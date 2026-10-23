import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Key, Lock, Unlock, AlertCircle, CheckCircle2, X } from 'lucide-react';

interface VaultModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const VaultModal: React.FC<VaultModalProps> = ({ isOpen, onClose }) => {
  const { user, isVaultUnlocked, unlockVault, setupVault, lockVault } = useAuth();
  const [passphrase, setPassphrase] = useState('');
  const [confirmPassphrase, setConfirmPassphrase] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [successMsg, setSuccessMsg] = useState('');

  if (!isOpen) return null;

  const hasKeys = user?.has_keys;

  const handleUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const ok = await unlockVault(passphrase);
      if (ok) {
        setSuccessMsg('Vault unlocked successfully!');
        setTimeout(() => {
          setSuccessMsg('');
          setPassphrase('');
          onClose();
        }, 1000);
      } else {
        setError('Incorrect passphrase or unable to decrypt private key.');
      }
    } catch (err: any) {
      setError(err?.message || 'Failed to unlock vault');
    } finally {
      setLoading(false);
    }
  };

  const handleSetup = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (passphrase.length < 10) {
      setError('Vault passphrase must be at least 10 characters for strong security.');
      return;
    }
    if (passphrase !== confirmPassphrase) {
      setError('Passphrases do not match.');
      return;
    }

    setLoading(true);
    try {
      await setupVault(passphrase);
      setSuccessMsg('Vault keys generated & initialized successfully!');
      setTimeout(() => {
        setSuccessMsg('');
        setPassphrase('');
        setConfirmPassphrase('');
        onClose();
      }, 1200);
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      setError(typeof detail === 'string' ? detail : err?.message || 'Failed to setup vault');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="relative w-full max-w-md p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] shadow-2xl shadow-cyan-950/40 text-slate-200">
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-1.5 rounded-lg text-slate-400 hover:text-slate-200 hover:bg-[#17233d] transition-colors"
        >
          <X className="w-5 h-5" />
        </button>

        {/* Modal Header */}
        <div className="flex items-center gap-3 mb-5">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Key className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-white tracking-tight">
              {hasKeys ? (isVaultUnlocked ? 'Vault Status' : 'Unlock Your Vault') : 'Setup Encryption Vault'}
            </h2>
            <p className="text-xs text-slate-400">
              {hasKeys ? 'Zero-knowledge browser key management' : 'Generate your private RSA cryptographic identity'}
            </p>
          </div>
        </div>

        {error && (
          <div className="p-3 mb-4 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        {successMsg && (
          <div className="p-3 mb-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2.5 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 shrink-0 text-emerald-400" />
            <span>{successMsg}</span>
          </div>
        )}

        {/* State 1: Already Unlocked */}
        {hasKeys && isVaultUnlocked && (
          <div className="space-y-4">
            <div className="p-4 rounded-xl bg-emerald-950/40 border border-emerald-500/30 text-emerald-300 space-y-2">
              <div className="flex items-center gap-2 font-semibold text-sm">
                <Unlock className="w-4 h-4 text-emerald-400" />
                <span>Vault is Active & Unlocked</span>
              </div>
              <p className="text-xs text-emerald-400/80 leading-relaxed">
                Your private key is loaded in memory for client-side file encryption and decryption. It will be securely discarded when you sign out or close this tab.
              </p>
            </div>

            <button
              onClick={() => {
                lockVault();
                onClose();
              }}
              className="w-full py-2.5 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-sm font-semibold transition-colors flex items-center justify-center gap-2"
            >
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Lock Vault Now</span>
            </button>
          </div>
        )}

        {/* State 2: Needs Unlock */}
        {hasKeys && !isVaultUnlocked && (
          <form onSubmit={handleUnlock} className="space-y-4">
            <p className="text-xs text-slate-400 leading-relaxed">
              Enter your vault passphrase to derive your protection key via PBKDF2 (600,000 rounds) and unwrap your private key in the browser.
            </p>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Vault Passphrase
              </label>
              <input
                type="password"
                required
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="Enter your secret vault passphrase"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !passphrase}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-50 text-[#070b14] font-semibold text-sm transition-all flex items-center justify-center gap-2"
            >
              {loading ? 'Deriving Keys & Unlocking...' : 'Unlock Vault'}
            </button>
          </form>
        )}

        {/* State 3: First-time Vault Setup */}
        {!hasKeys && (
          <form onSubmit={handleSetup} className="space-y-4">
            <div className="p-3.5 rounded-xl bg-cyan-950/40 border border-cyan-800/40 text-xs text-cyan-300 space-y-1">
              <span className="font-semibold text-cyan-200">First-Time Setup:</span>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Choose a strong passphrase. TrustVault never stores this passphrase on the server. If you lose it, your private key cannot be recovered.
              </p>
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Choose Master Vault Passphrase
              </label>
              <input
                type="password"
                required
                minLength={10}
                value={passphrase}
                onChange={(e) => setPassphrase(e.target.value)}
                placeholder="At least 10 characters"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            <div>
              <label className="block text-xs font-medium text-slate-300 mb-1.5">
                Confirm Vault Passphrase
              </label>
              <input
                type="password"
                required
                value={confirmPassphrase}
                onChange={(e) => setConfirmPassphrase(e.target.value)}
                placeholder="Re-enter your passphrase"
                className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
              />
            </div>

            <button
              type="submit"
              disabled={loading || !passphrase || !confirmPassphrase}
              className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-50 text-[#070b14] font-semibold text-sm transition-all flex items-center justify-center gap-2"
            >
              {loading ? 'Generating RSA-2048 & Deriving PBKDF2...' : 'Generate & Secure Vault'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
};
