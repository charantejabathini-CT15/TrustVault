import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { documentsApi, teamApi, profileApi } from '../services/api';
import type { DocumentDetail, OrgMemberItem } from '../types';
import {
  unwrapDocumentKey,
  wrapDocumentKey,
  importPublicKeySpki,
} from '../services/crypto';
import {
  Share2,
  Lock,
  UserCheck,
  Calendar,
  AlertCircle,
  CheckCircle2,
  Trash2,
  X,
  RefreshCw,
} from 'lucide-react';

interface ShareModalProps {
  isOpen: boolean;
  documentId: string;
  onClose: () => void;
  onShareUpdated: () => void;
  onOpenVault: () => void;
}

export const ShareModal: React.FC<ShareModalProps> = ({
  isOpen,
  documentId,
  onClose,
  onShareUpdated,
  onOpenVault,
}) => {
  const { user, unlockedPrivateKey, isVaultUnlocked } = useAuth();
  const [doc, setDoc] = useState<DocumentDetail | null>(null);
  const [members, setMembers] = useState<OrgMemberItem[]>([]);
  const [selectedEmail, setSelectedEmail] = useState('');
  const [permission, setPermission] = useState<'view' | 'download'>('view');
  const [expiryDays, setExpiryDays] = useState('7');
  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadData = async () => {
    if (!documentId) return;
    setFetching(true);
    try {
      const [d, t] = await Promise.all([
        documentsApi.get(documentId),
        teamApi.getMembers(),
      ]);
      setDoc(d);
      const membersList = Array.isArray(t) ? t : (t?.members || []);
      const activeGranteeIds = new Set((d.shares || []).filter(s => !s.revoked).map(s => s.grantee_id));
      const eligible = membersList.filter(m => m.user_id !== user?.id && !activeGranteeIds.has(m.user_id));
      setMembers(eligible);
      if (eligible.length > 0) {
        setSelectedEmail(eligible[0].email);
      } else {
        setSelectedEmail('');
      }
    } catch (err: any) {
      setError('Failed to load document or team details');
    } finally {
      setFetching(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      loadData();
    }
  }, [isOpen, documentId]);

  if (!isOpen) return null;

  const handleShare = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedEmail || !doc || !unlockedPrivateKey) return;

    setLoading(true);
    setError('');
    setSuccess('');

    try {
      // 1. Unwrap the owner's document AES key
      if (!doc.key_envelope) {
        throw new Error('Document key envelope not available for current account');
      }
      const aesKey = await unwrapDocumentKey(doc.key_envelope, unlockedPrivateKey);

      // 2. Find target member & fetch their public key
      const targetMember = members.find(m => m.email === selectedEmail);
      if (!targetMember) throw new Error('Recipient not found');

      const recipientInfo = await profileApi.getUserPublicKey(targetMember.user_id);
      if (!recipientInfo.public_key) {
        throw new Error(`${targetMember.display_name} has not generated encryption keys yet`);
      }

      // 3. Import recipient's public key
      const recipientPublicKey = await importPublicKeySpki(recipientInfo.public_key);

      // 4. Wrap the document AES key for the recipient
      const wrappedForRecipient = await wrapDocumentKey(aesKey, recipientPublicKey);

      // 5. Calculate expiration ISO
      let expiresAt: string | undefined;
      if (expiryDays !== 'never') {
        const d = new Date();
        d.setDate(d.getDate() + parseInt(expiryDays, 10));
        expiresAt = d.toISOString();
      }

      // 6. Submit share grant
      await documentsApi.createShare(documentId, {
        grantee_email: selectedEmail,
        permission,
        encrypted_key: wrappedForRecipient,
        expires_at: expiresAt,
      });

      setSuccess(`Access granted to ${selectedEmail}!`);
      loadData();
      onShareUpdated();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to share document');
    } finally {
      setLoading(false);
    }
  };

  const handleRevoke = async (shareId: string) => {
    try {
      await documentsApi.revokeShare(shareId);
      loadData();
      onShareUpdated();
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Failed to revoke access');
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-xl p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] shadow-2xl text-slate-200 max-h-[90vh] overflow-y-auto">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#17233d] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Share2 className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Share Document Access</h2>
            <p className="text-xs text-slate-400">
              {doc ? doc.name : 'Loading...'}
            </p>
          </div>
        </div>

        {/* Vault lock warning */}
        {!isVaultUnlocked && (
          <div className="p-3.5 mb-4 rounded-xl bg-amber-950/50 border border-amber-500/40 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Unlock your vault to re-wrap key for recipient.</span>
            </div>
            <button
              onClick={onOpenVault}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-semibold text-amber-200 border border-amber-500/40"
            >
              Unlock
            </button>
          </div>
        )}

        {error && (
          <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{success}</span>
          </div>
        )}

        {/* Share Form */}
        <form onSubmit={handleShare} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Select Recipient (Organization Member)
            </label>
            {members.length > 0 ? (
              <select
                value={selectedEmail}
                onChange={(e) => setSelectedEmail(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 outline-none transition-colors"
              >
                {members.map((m) => (
                  <option key={m.id} value={m.email} className="bg-[#111a2e] text-slate-100">
                    {m.display_name} ({m.email}) — {m.role}
                  </option>
                ))}
              </select>
            ) : (
              <div className="p-3 rounded-xl bg-[#111a2e] border border-[#1e2c4a] text-xs text-slate-400">
                All team members already have access or no other members exist.
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Permission Level
              </label>
              <select
                value={permission}
                onChange={(e) => setPermission(e.target.value as 'view' | 'download')}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 outline-none transition-colors"
              >
                <option value="view">View Only (Decrypted in-browser)</option>
                <option value="download">View & Download</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Access Expiration
              </label>
              <select
                value={expiryDays}
                onChange={(e) => setExpiryDays(e.target.value)}
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 outline-none transition-colors"
              >
                <option value="1">1 Day</option>
                <option value="7">7 Days</option>
                <option value="30">30 Days</option>
                <option value="never">No Expiration</option>
              </select>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !selectedEmail || !isVaultUnlocked || members.length === 0}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-50 text-[#070b14] font-semibold text-sm transition-all flex items-center justify-center gap-2"
          >
            {loading ? 'Re-wrapping Key & Granting Access...' : 'Create Encrypted Share Grant'}
          </button>
        </form>

        {/* Existing Shares Table */}
        <div className="mt-6 pt-5 border-t border-[#1e2c4a]">
          <h3 className="text-xs font-bold text-slate-300 uppercase tracking-wider mb-3">
            Active & Previous Grants ({doc?.shares.length || 0})
          </h3>

          <div className="space-y-2">
            {doc?.shares && doc.shares.length > 0 ? (
              doc.shares.map((share) => (
                <div
                  key={share.id}
                  className="p-3 rounded-xl bg-[#111a2e]/60 border border-[#1e2c4a] flex items-center justify-between text-xs"
                >
                  <div>
                    <div className="font-medium text-slate-200">
                      {share.grantee_name || share.grantee_email}
                    </div>
                    <div className="text-[11px] text-slate-400 flex items-center gap-2 mt-0.5">
                      <span className="uppercase text-cyan-400 font-semibold">{share.permission}</span>
                      <span>•</span>
                      {share.expires_at ? (
                        <span>Expires {new Date(share.expires_at).toLocaleDateString()}</span>
                      ) : (
                        <span>No expiration</span>
                      )}
                      <span>•</span>
                      {share.revoked ? (
                        <span className="text-rose-400 font-medium">Revoked</span>
                      ) : (
                        <span className="text-emerald-400 font-medium">Active</span>
                      )}
                    </div>
                  </div>

                  {!share.revoked && (
                    <button
                      onClick={() => handleRevoke(share.id)}
                      className="px-2.5 py-1 rounded-lg text-rose-400 hover:text-rose-300 hover:bg-rose-950/40 border border-rose-900/50 transition-colors flex items-center gap-1.5 font-medium"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Revoke</span>
                    </button>
                  )}
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic py-2">No recipients have been granted access yet.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
