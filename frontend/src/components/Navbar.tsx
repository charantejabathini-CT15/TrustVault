import React from 'react';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, Unlock, Key, LogOut, User as UserIcon } from 'lucide-react';

interface NavbarProps {
  onOpenVaultModal: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenVaultModal }) => {
  const { user, isVaultUnlocked, logout } = useAuth();

  return (
    <header className="h-16 border-b border-[#1e2c4a] bg-[#070b14]/90 backdrop-blur-md px-6 flex items-center justify-between sticky top-0 z-30">
      {/* Brand */}
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
          <Shield className="w-6 h-6 text-[#070b14]" />
        </div>
        <div>
          <span className="font-bold text-lg tracking-tight bg-gradient-to-r from-white via-slate-200 to-cyan-400 bg-clip-text text-transparent">
            TrustVault
          </span>
          <span className="ml-2 text-[10px] uppercase tracking-wider font-semibold px-2 py-0.5 rounded bg-cyan-950/80 text-cyan-400 border border-cyan-800/60">
            Zero-Knowledge
          </span>
        </div>
      </div>

      {/* User & Security Status */}
      {user && (
        <div className="flex items-center gap-4">
          {/* Organization badge */}
          {user.org_name && (
            <div className="hidden md:flex items-center gap-2 px-3 py-1 rounded-lg bg-[#111a2e] border border-[#1e2c4a] text-xs text-slate-300">
              <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse"></span>
              <span className="font-medium">{user.org_name}</span>
              <span className="text-slate-500">•</span>
              <span className="capitalize text-cyan-400">{user.role}</span>
            </div>
          )}

          {/* Cryptographic Vault Status */}
          <button
            onClick={onOpenVaultModal}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-medium transition-all ${
              isVaultUnlocked
                ? 'bg-emerald-950/60 border-emerald-500/40 text-emerald-300 hover:bg-emerald-900/60 shadow-sm shadow-emerald-500/10'
                : 'bg-amber-950/60 border-amber-500/40 text-amber-300 hover:bg-amber-900/60 animate-pulse shadow-sm shadow-amber-500/10'
            }`}
          >
            {isVaultUnlocked ? (
              <>
                <Unlock className="w-3.5 h-3.5 text-emerald-400" />
                <span>Vault Unlocked</span>
              </>
            ) : (
              <>
                <Lock className="w-3.5 h-3.5 text-amber-400" />
                <span>Vault Locked</span>
              </>
            )}
          </button>

          {/* User profile & Logout */}
          <div className="flex items-center gap-3 pl-2 border-l border-[#1e2c4a]">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-full bg-slate-800 border border-slate-700 flex items-center justify-center text-xs font-semibold text-slate-200">
                {user.display_name?.charAt(0).toUpperCase() || <UserIcon className="w-4 h-4" />}
              </div>
              <div className="hidden lg:block text-left">
                <div className="text-xs font-medium text-slate-200 leading-tight">{user.display_name}</div>
                <div className="text-[11px] text-slate-400 leading-tight">{user.email}</div>
              </div>
            </div>

            <button
              onClick={logout}
              title="Sign Out"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/30 border border-transparent hover:border-rose-900/40 transition-colors"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}
    </header>
  );
};
