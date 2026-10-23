import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { profileApi } from '../services/api';
import {
  Settings,
  Key,
  Lock,
  Unlock,
  Shield,
  Copy,
  Check,
  Download,
  AlertCircle,
  CheckCircle2,
  RefreshCw,
} from 'lucide-react';

interface SettingsPageProps {
  onOpenVault: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onOpenVault }) => {
  const { user, isVaultUnlocked, lockVault } = useAuth();
  const [profile, setProfile] = useState<{
    id: string;
    email: string;
    display_name: string;
    public_key?: string;
    encrypted_private_key?: string;
    private_key_salt?: string;
    pbkdf2_iterations: number;
  } | null>(null);
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const loadProfile = async () => {
      try {
        const data = await profileApi.getProfile();
        setProfile(data);
      } catch (err) {
        console.error('Failed to load profile', err);
      } finally {
        setLoading(false);
      }
    };
    loadProfile();
  }, [user]);

  const handleCopyPublicKey = () => {
    if (profile?.public_key) {
      navigator.clipboard.writeText(profile.public_key);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleExportBackup = () => {
    if (!profile?.encrypted_private_key) return;

    const backupData = {
      user_id: profile.id,
      email: profile.email,
      public_key: profile.public_key,
      encrypted_private_key: profile.encrypted_private_key,
      salt: profile.private_key_salt,
      pbkdf2_iterations: profile.pbkdf2_iterations || 600000,
      cipher: 'AES-256-GCM',
      algorithm: 'RSA-OAEP-2048',
      exported_at: new Date().toISOString(),
      note: 'This file contains your encrypted private key. You will need your master vault passphrase to decrypt it.',
    };

    const blob = new Blob([JSON.stringify(backupData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trustvault-backup-${profile.email}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Settings className="w-5 h-5 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Account & Cryptographic Settings</h1>
        </div>
        <p className="text-xs text-slate-400">
          Manage your account profile, vault encryption status, and offline cryptographic key backups
        </p>
      </div>

      {/* Account Info Card */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] shadow-xl space-y-4">
        <h2 className="text-xs font-bold uppercase tracking-wider text-slate-300">
          Account Profile
        </h2>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div>
            <span className="text-slate-500 block text-[11px]">Display Name</span>
            <span className="text-slate-200 font-semibold">{user?.display_name}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Email Address</span>
            <span className="text-slate-200 font-mono">{user?.email}</span>
          </div>
          <div>
            <span className="text-slate-500 block text-[11px]">Organization & Role</span>
            <span className="text-cyan-400 font-medium">
              {user?.org_name} ({user?.role})
            </span>
          </div>
        </div>
      </div>

      {/* Cryptographic Vault Card */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] shadow-xl space-y-6">
        <div className="flex items-center justify-between pb-4 border-b border-[#1e2c4a]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Key className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-white">Cryptographic Vault State</h2>
              <p className="text-xs text-slate-400">
                Client-side RSA-OAEP 2048 identity protected with PBKDF2-SHA-256
              </p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {isVaultUnlocked ? (
              <button
                onClick={lockVault}
                className="px-3.5 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Lock Vault</span>
              </button>
            ) : (
              <button
                onClick={onOpenVault}
                className="px-3.5 py-1.5 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-semibold flex items-center gap-1.5 transition-colors"
              >
                <Unlock className="w-3.5 h-3.5 text-cyan-400" />
                <span>Unlock Vault</span>
              </button>
            )}
          </div>
        </div>

        {/* Cryptographic Parameters */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs">
          <div className="p-3.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a]">
            <span className="text-slate-500 block text-[11px]">PBKDF2 Iterations</span>
            <span className="text-slate-200 font-mono font-bold">
              {profile?.pbkdf2_iterations?.toLocaleString() || '600,000'} rounds
            </span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a]">
            <span className="text-slate-500 block text-[11px]">Salt Entropy</span>
            <span className="text-slate-200 font-mono">16-byte random cryptographic salt</span>
          </div>

          <div className="p-3.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a]">
            <span className="text-slate-500 block text-[11px]">Asymmetric Key Wrapping</span>
            <span className="text-slate-200 font-mono">RSA-OAEP 2048-bit (SHA-256)</span>
          </div>
        </div>

        {/* Public Key Display */}
        {profile?.public_key && (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-300">
                Your Public Key (SPKI Base64)
              </span>
              <button
                onClick={handleCopyPublicKey}
                className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Key'}</span>
              </button>
            </div>
            <div className="p-3 rounded-xl bg-[#070b14] border border-[#1e2c4a] font-mono text-[11px] text-slate-400 break-all select-all">
              {profile.public_key}
            </div>
            <p className="text-[11px] text-slate-500">
              Other organization members use this public key to wrap AES document keys when sharing confidential files with you.
            </p>
          </div>
        )}

        {/* Offline Backup Button */}
        {profile?.encrypted_private_key && (
          <div className="p-4 rounded-xl bg-[#111a2e]/60 border border-[#1e2c4a] flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div>
              <div className="text-xs font-bold text-slate-200">
                Export Encrypted Key Backup (JSON)
              </div>
              <p className="text-[11px] text-slate-400 leading-relaxed mt-0.5">
                Download your encrypted private key envelope for offline cold storage. It cannot be decrypted without your master passphrase.
              </p>
            </div>

            <button
              onClick={handleExportBackup}
              className="py-2 px-4 rounded-xl bg-[#17233d] hover:bg-[#1e2c4a] text-slate-200 border border-slate-700 hover:border-slate-500 text-xs font-semibold transition-all flex items-center gap-2 shrink-0"
            >
              <Download className="w-3.5 h-3.5 text-cyan-400" />
              <span>Export Key Backup</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
};
