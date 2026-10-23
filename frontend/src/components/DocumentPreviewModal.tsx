import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { documentsApi } from '../services/api';
import type { DocumentItem } from '../types';
import {
  unwrapDocumentKey,
  decryptFileBytes,
  base64ToBuffer,
  computeSha256,
} from '../services/crypto';
import {
  FileText,
  Download,
  Lock,
  Unlock,
  AlertCircle,
  CheckCircle2,
  X,
  RefreshCw,
  Eye,
} from 'lucide-react';

interface DocumentPreviewModalProps {
  isOpen: boolean;
  document: DocumentItem | null;
  onClose: () => void;
  onOpenVault: () => void;
}

export const DocumentPreviewModal: React.FC<DocumentPreviewModalProps> = ({
  isOpen,
  document,
  onClose,
  onOpenVault,
}) => {
  const { isVaultUnlocked, unlockedPrivateKey } = useAuth();
  const [decryptedText, setDecryptedText] = useState<string | null>(null);
  const [decryptedBlobUrl, setDecryptedBlobUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [error, setError] = useState('');
  const [integrityVerified, setIntegrityVerified] = useState(false);

  useEffect(() => {
    if (isOpen && document) {
      handleDecrypt();
    } else {
      setDecryptedText(null);
      if (decryptedBlobUrl) {
        URL.revokeObjectURL(decryptedBlobUrl);
        setDecryptedBlobUrl(null);
      }
      setIntegrityVerified(false);
      setError('');
    }
  }, [isOpen, document]);

  if (!isOpen || !document) return null;

  const handleDecrypt = async () => {
    if (!isVaultUnlocked || !unlockedPrivateKey) {
      setError('Unlock your vault to decrypt this document.');
      return;
    }

    setLoading(true);
    setError('');
    setIntegrityVerified(false);

    try {
      setStatusMsg('Retrieving encrypted payload from server...');
      const response = await documentsApi.getContent(document.id, 'view');

      setStatusMsg('Verifying ciphertext integrity...');
      const ciphertextBuffer = base64ToBuffer(response.encrypted_content);
      const computedHash = await computeSha256(ciphertextBuffer);

      if (computedHash !== response.encrypted_file_hash) {
        throw new Error('Integrity verification failed! Ciphertext does not match recorded SHA-256 hash.');
      }
      setIntegrityVerified(true);

      setStatusMsg('Unwrapping document AES-256-GCM key...');
      const aesKey = await unwrapDocumentKey(response.encrypted_key, unlockedPrivateKey);

      setStatusMsg('Decrypting content locally in browser memory...');
      const decryptedBuffer = await decryptFileBytes(ciphertextBuffer, aesKey);

      // Determine how to present based on content type
      const contentType = document.content_type || 'application/octet-stream';
      const isText = contentType.startsWith('text/') ||
        contentType.includes('json') ||
        contentType.includes('yaml') ||
        contentType.includes('javascript') ||
        contentType.includes('typescript') ||
        contentType.includes('markdown') ||
        document.name.endsWith('.txt') ||
        document.name.endsWith('.md') ||
        document.name.endsWith('.json') ||
        document.name.endsWith('.py') ||
        document.name.endsWith('.ts');

      const isImage = contentType.startsWith('image/');
      const isPdf = contentType === 'application/pdf' || document.name.endsWith('.pdf');

      const blob = new Blob([decryptedBuffer], { type: contentType });
      const blobUrl = URL.createObjectURL(blob);
      setDecryptedBlobUrl(blobUrl);

      if (isText) {
        const text = new TextDecoder('utf-8').decode(decryptedBuffer);
        setDecryptedText(text);
      } else {
        setDecryptedText(null);
      }

      setStatusMsg('');
    } catch (err: any) {
      console.error('Decryption failed:', err);
      setError(err?.response?.data?.detail || err?.message || 'Decryption failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleDownload = async () => {
    if (!document || !decryptedBlobUrl) return;

    // Trigger download of decrypted blob
    const a = window.document.createElement('a');
    a.href = decryptedBlobUrl;
    a.download = document.name;
    window.document.body.appendChild(a);
    a.click();
    window.document.body.removeChild(a);
  };

  const canDownload = document.permission === 'download' || document.permission === 'owner';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="relative w-full max-w-3xl p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] shadow-2xl text-slate-200 max-h-[90vh] flex flex-col">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#17233d] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center justify-between mb-4 pb-4 border-b border-[#1e2c4a] pr-10">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
              <Eye className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-tight">{document.name}</h2>
              <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                <span>{(document.size / 1024).toFixed(1)} KB</span>
                <span>•</span>
                <span className="uppercase text-cyan-400 font-semibold">{document.permission} Access</span>
                {integrityVerified && (
                  <>
                    <span>•</span>
                    <span className="text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      SHA-256 Verified
                    </span>
                  </>
                )}
              </div>
            </div>
          </div>

          {canDownload && decryptedBlobUrl && (
            <button
              onClick={handleDownload}
              className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-[#070b14] font-semibold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-cyan-500/20"
            >
              <Download className="w-4 h-4" />
              <span>Download Decrypted</span>
            </button>
          )}
        </div>

        {/* Locked Vault Banner */}
        {!isVaultUnlocked && (
          <div className="p-4 mb-4 rounded-xl bg-amber-950/40 border border-amber-500/40 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2.5">
              <Lock className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Vault is locked. Enter your passphrase to decrypt this file in-memory.</span>
            </div>
            <button
              onClick={onOpenVault}
              className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-semibold text-amber-200 border border-amber-500/40 transition-colors"
            >
              Unlock Vault
            </button>
          </div>
        )}

        {error && (
          <div className="p-4 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {loading && (
          <div className="p-8 flex flex-col items-center justify-center gap-3 text-cyan-300">
            <RefreshCw className="w-8 h-8 animate-spin text-cyan-400" />
            <span className="text-xs font-medium">{statusMsg || 'Decrypting...'}</span>
          </div>
        )}

        {/* Preview Container */}
        {!loading && decryptedBlobUrl && (
          <div className="flex-1 overflow-auto rounded-xl bg-[#070b14] border border-[#1e2c4a] p-4 text-xs font-mono text-slate-300">
            {decryptedText !== null ? (
              <pre className="whitespace-pre-wrap leading-relaxed">{decryptedText}</pre>
            ) : document.content_type?.startsWith('image/') ? (
              <div className="flex justify-center p-4">
                <img src={decryptedBlobUrl} alt={document.name} className="max-h-[60vh] rounded-lg shadow-lg" />
              </div>
            ) : document.name.endsWith('.pdf') ? (
              <iframe src={decryptedBlobUrl} title={document.name} className="w-full h-[60vh] rounded-lg border-0" />
            ) : (
              <div className="p-8 text-center text-slate-400 font-sans space-y-3">
                <FileText className="w-12 h-12 mx-auto text-slate-500" />
                <p className="text-sm font-medium text-slate-300">
                  Binary file decrypted successfully in browser memory ({document.size} bytes).
                </p>
                {canDownload ? (
                  <p className="text-xs text-slate-500">
                    Click the "Download Decrypted" button above to save the file locally.
                  </p>
                ) : (
                  <p className="text-xs text-amber-400">
                    Your permission grant is restricted to in-browser viewing only.
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
