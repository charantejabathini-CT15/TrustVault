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
  ExternalLink,
} from 'lucide-react';

function detectFileType(buffer: ArrayBuffer, docName: string, docContentType?: string): {
  isPdf: boolean;
  isImage: boolean;
  isText: boolean;
  mimeType: string;
} {
  const bytes = new Uint8Array(buffer);
  const name = (docName || '').toLowerCase();
  const declaredType = (docContentType || '').toLowerCase();

  // 1. PDF detection (Magic header: %PDF -> 0x25 0x50 0x44 0x46)
  const isPdf =
    declaredType === 'application/pdf' ||
    name.endsWith('.pdf') ||
    (bytes.length >= 4 && bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 && bytes[3] === 0x46);

  if (isPdf) {
    return { isPdf: true, isImage: false, isText: false, mimeType: 'application/pdf' };
  }

  // 2. Image detection
  const isPng = bytes.length >= 8 && bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47;
  const isJpg = bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  const isGif = bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46;
  const isWebp =
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50;

  const isImage = isPng || isJpg || isGif || isWebp || declaredType.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg|bmp)$/i.test(name);
  if (isImage) {
    const mime = isPng ? 'image/png' : isJpg ? 'image/jpeg' : isGif ? 'image/gif' : isWebp ? 'image/webp' : (declaredType || 'image/png');
    return { isPdf: false, isImage: true, isText: false, mimeType: mime };
  }

  // 3. Text detection: try decoding as UTF-8
  try {
    const decoder = new TextDecoder('utf-8', { fatal: true });
    let hasNull = false;
    const sampleLen = Math.min(bytes.length, 4096);
    for (let i = 0; i < sampleLen; i++) {
      if (bytes[i] === 0) {
        hasNull = true;
        break;
      }
    }
    if (!hasNull) {
      decoder.decode(bytes.subarray(0, sampleLen));
      return { isPdf: false, isImage: false, isText: true, mimeType: 'text/plain' };
    }
  } catch {}

  return { isPdf: false, isImage: false, isText: false, mimeType: declaredType || 'application/octet-stream' };
}

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
  const [detectedType, setDetectedType] = useState<{ isPdf: boolean; isImage: boolean; isText: boolean; mimeType: string }>({
    isPdf: false,
    isImage: false,
    isText: false,
    mimeType: '',
  });
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

      // Deep inspection of decrypted buffer with magic byte header inspection
      const fileType = detectFileType(decryptedBuffer, document.name, document.content_type);
      setDetectedType(fileType);

      const blob = new Blob([decryptedBuffer], { type: fileType.mimeType });
      const blobUrl = URL.createObjectURL(blob);
      setDecryptedBlobUrl(blobUrl);

      if (fileType.isText) {
        try {
          const text = new TextDecoder('utf-8').decode(decryptedBuffer);
          setDecryptedText(text);
        } catch {
          setDecryptedText(null);
        }
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

          {decryptedBlobUrl && (
            <div className="flex items-center gap-2">
              <a
                href={decryptedBlobUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="py-2 px-3.5 rounded-xl bg-[#17233d] hover:bg-[#1e2c4a] border border-[#2b3c66] text-cyan-300 font-semibold text-xs transition-all flex items-center gap-1.5 shadow-sm"
              >
                <ExternalLink className="w-4 h-4" />
                <span>Open in New Tab</span>
              </a>

              {canDownload && (
                <button
                  onClick={handleDownload}
                  className="py-2 px-3.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-[#070b14] font-semibold text-xs transition-all flex items-center gap-1.5 shadow-md shadow-cyan-500/20"
                >
                  <Download className="w-4 h-4" />
                  <span>Download Decrypted</span>
                </button>
              )}
            </div>
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
          <div className="flex-1 overflow-auto rounded-xl bg-[#070b14] border border-[#1e2c4a] p-3 text-xs font-mono text-slate-300 min-h-[460px] flex flex-col">
            {detectedType.isPdf ? (
              <div className="flex-1 w-full flex flex-col gap-2 min-h-[500px]">
                <div className="flex items-center justify-between px-3 py-2 rounded-lg bg-[#111a2e] text-xs font-sans text-slate-300 border border-[#1e2c4a]">
                  <span className="flex items-center gap-2 text-cyan-400 font-medium">
                    <FileText className="w-4 h-4" />
                    PDF Document (Decrypted)
                  </span>
                  <a
                    href={decryptedBlobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-2.5 py-1 rounded-md bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 flex items-center gap-1 font-semibold text-[11px]"
                  >
                    <ExternalLink className="w-3.5 h-3.5" />
                    Fullscreen View
                  </a>
                </div>
                <iframe
                  src={decryptedBlobUrl}
                  title={document.name}
                  className="w-full flex-1 min-h-[460px] rounded-lg border border-[#1e2c4a] bg-slate-900"
                />
              </div>
            ) : detectedType.isImage ? (
              <div className="flex flex-col items-center justify-center p-4 gap-3 my-auto">
                <img
                  src={decryptedBlobUrl}
                  alt={document.name}
                  className="max-h-[60vh] max-w-full rounded-lg shadow-lg object-contain border border-[#1e2c4a]"
                />
              </div>
            ) : detectedType.isText && decryptedText !== null ? (
              <pre className="whitespace-pre-wrap leading-relaxed font-mono p-3 bg-black/40 rounded-lg">{decryptedText}</pre>
            ) : (
              <div className="p-8 text-center text-slate-400 font-sans space-y-4 my-auto">
                <FileText className="w-14 h-14 mx-auto text-cyan-400" />
                <div>
                  <h4 className="text-base font-semibold text-white">
                    {document.name} ({document.size} bytes)
                  </h4>
                  <p className="text-xs text-slate-400 mt-1">
                    Binary file decrypted successfully in secure browser memory.
                  </p>
                </div>
                <div className="flex items-center justify-center gap-3 pt-2">
                  <a
                    href={decryptedBlobUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 font-semibold text-xs transition-colors flex items-center gap-1.5"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Open In Dedicated Browser Tab
                  </a>
                  {canDownload && (
                    <button
                      onClick={handleDownload}
                      className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-[#070b14] font-semibold text-xs transition-all flex items-center gap-1.5"
                    >
                      <Download className="w-4 h-4" />
                      Save Locally
                    </button>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
