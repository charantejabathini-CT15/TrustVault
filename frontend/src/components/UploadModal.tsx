import React, { useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { documentsApi, profileApi } from '../services/api';
import {
  generateDocumentAesKey,
  encryptFileBytes,
  wrapDocumentKey,
  importPublicKeySpki,
} from '../services/crypto';
import { Upload, FileText, CheckCircle2, AlertCircle, Lock, X, RefreshCw } from 'lucide-react';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  onOpenVault: () => void;
}

export const UploadModal: React.FC<UploadModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  onOpenVault,
}) => {
  const { user, isVaultUnlocked } = useAuth();
  const [file, setFile] = useState<File | null>(null);
  const [docName, setDocName] = useState('');
  const [statusText, setStatusText] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [hashPreview, setHashPreview] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileChange = (selected: File) => {
    if (selected.size > 50 * 1024 * 1024) {
      setError('File size exceeds the 50 MB limit.');
      return;
    }
    setFile(selected);
    if (!docName) {
      setDocName(selected.name);
    }
    setError('');
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      handleFileChange(e.dataTransfer.files[0]);
    }
  };

  const handleUpload = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;

    if (!isVaultUnlocked) {
      setError('Your vault must be unlocked to wrap the document encryption key.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      // 1. Read file as ArrayBuffer
      setStatusText('Reading file into secure browser memory...');
      const fileBytes = await file.arrayBuffer();

      // 2. Generate random AES-256-GCM key
      setStatusText('Generating random AES-256-GCM document key...');
      const aesKey = await generateDocumentAesKey();

      // 3. Encrypt file with AES-256-GCM
      setStatusText('Encrypting file content client-side...');
      const { ciphertextWithIv, hash } = await encryptFileBytes(fileBytes, aesKey);
      setHashPreview(hash);

      // 4. Retrieve user's public key
      setStatusText('Fetching cryptographic public key for envelope...');
      const profile = await profileApi.getProfile();
      if (!profile.public_key) {
        throw new Error('User public key not found. Please setup your vault first.');
      }
      const ownerPublicKey = await importPublicKeySpki(profile.public_key);

      // 5. Wrap AES key using RSA-OAEP
      setStatusText('Wrapping AES key inside RSA-OAEP envelope...');
      const wrappedKey = await wrapDocumentKey(aesKey, ownerPublicKey);

      // 6. Upload encrypted payload to backend
      setStatusText('Uploading encrypted payload & audit metadata...');
      const formData = new FormData();
      const encryptedBlob = new Blob([ciphertextWithIv], { type: 'application/octet-stream' });
      formData.append('file', encryptedBlob, file.name);
      formData.append('name', docName || file.name);
      formData.append('encrypted_file_hash', hash);
      formData.append('encrypted_key', wrappedKey);

      await documentsApi.upload(formData);

      setStatusText('Upload sealed and confirmed in tamper-evident audit log!');
      setTimeout(() => {
        setFile(null);
        setDocName('');
        setStatusText('');
        setHashPreview('');
        onSuccess();
        onClose();
      }, 1000);
    } catch (err: any) {
      console.error('Upload error:', err);
      setError(err?.response?.data?.detail || err?.message || 'Encryption or upload failed');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-lg p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] shadow-2xl text-slate-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#17233d] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Upload className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">Upload Encrypted Document</h2>
            <p className="text-xs text-slate-400">
              Browser-encrypted via AES-256-GCM before transmission
            </p>
          </div>
        </div>

        {/* Warning if vault locked */}
        {!isVaultUnlocked && (
          <div className="p-3.5 mb-4 rounded-xl bg-amber-950/50 border border-amber-500/40 flex items-center justify-between text-xs text-amber-300">
            <div className="flex items-center gap-2">
              <Lock className="w-4 h-4 text-amber-400 shrink-0" />
              <span>Vault is locked. Unlock it to wrap encryption keys.</span>
            </div>
            <button
              onClick={onOpenVault}
              className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 font-semibold text-amber-200 border border-amber-500/40 transition-colors"
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

        {statusText && (
          <div className="p-3 mb-4 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center gap-2 text-xs text-cyan-300">
            <RefreshCw className="w-4 h-4 shrink-0 text-cyan-400 animate-spin" />
            <span>{statusText}</span>
          </div>
        )}

        <form onSubmit={handleUpload} className="space-y-4">
          {/* Dropzone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
            className={`border-2 border-dashed rounded-2xl p-6 text-center cursor-pointer transition-all ${
              file
                ? 'border-cyan-500/50 bg-cyan-950/20'
                : 'border-slate-700 hover:border-slate-500 bg-[#111a2e]/50'
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              onChange={(e) => e.target.files?.[0] && handleFileChange(e.target.files[0])}
              className="hidden"
            />
            {file ? (
              <div className="flex flex-col items-center gap-2">
                <FileText className="w-8 h-8 text-cyan-400" />
                <span className="text-sm font-medium text-slate-200">{file.name}</span>
                <span className="text-xs text-slate-400">
                  {(file.size / 1024).toFixed(1)} KB • {file.type || 'Binary file'}
                </span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-2">
                <Upload className="w-8 h-8 text-slate-400" />
                <span className="text-sm font-medium text-slate-200">
                  Click to select or drag and drop file here
                </span>
                <span className="text-xs text-slate-500">Max file size: 50 MB</span>
              </div>
            )}
          </div>

          {/* Document name input */}
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Document Display Name
            </label>
            <input
              type="text"
              required
              value={docName}
              onChange={(e) => setDocName(e.target.value)}
              placeholder="e.g. Q4_Financial_Audit_Report.pdf"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          {hashPreview && (
            <div className="p-2.5 rounded-lg bg-[#070b14] border border-[#1e2c4a] text-[11px] font-mono text-slate-400 break-all">
              <span className="text-slate-500">Ciphertext SHA-256: </span>
              <span className="text-cyan-400">{hashPreview}</span>
            </div>
          )}

          <div className="flex items-center justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={loading}
              className="px-4 py-2.5 rounded-xl text-slate-400 hover:text-slate-200 text-sm font-medium transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !file || !isVaultUnlocked}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-50 text-[#070b14] font-semibold text-sm transition-all flex items-center gap-2"
            >
              {loading ? 'Encrypting & Sealing...' : 'Encrypt & Upload'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
