import React from 'react';
import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  FileText,
  Share2,
  Upload,
  History,
  Sliders,
  AlertTriangle,
  Users,
  Settings,
} from 'lucide-react';

interface SidebarProps {
  onOpenUpload: () => void;
  openAlertsCount?: number;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenUpload, openAlertsCount = 0 }) => {
  const navItems = [
    { to: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/documents', label: 'My Documents', icon: FileText },
    { to: '/shared-with-me', label: 'Shared With Me', icon: Share2 },
    { to: '/audit', label: 'Audit Trail', icon: History },
    { to: '/policy-simulator', label: 'Policy Simulator', icon: Sliders },
    {
      to: '/alerts',
      label: 'Security Alerts',
      icon: AlertTriangle,
      badge: openAlertsCount > 0 ? openAlertsCount : undefined,
    },
    { to: '/team', label: 'Team & Members', icon: Users },
    { to: '/settings', label: 'Vault Settings', icon: Settings },
  ];

  return (
    <aside className="w-64 border-r border-[#1e2c4a] bg-[#070b14]/70 p-4 flex flex-col justify-between hidden md:flex shrink-0">
      <div className="space-y-6">
        {/* Upload Quick Action */}
        <button
          onClick={onOpenUpload}
          className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-[#070b14] font-semibold text-sm flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20 hover:shadow-cyan-500/30 transition-all active:scale-[0.98]"
        >
          <Upload className="w-4 h-4 stroke-[2.5]" />
          <span>Upload Encrypted File</span>
        </button>

        {/* Navigation list */}
        <nav className="space-y-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center justify-between px-3 py-2.5 rounded-xl text-sm font-medium transition-all ${
                    isActive
                      ? 'bg-gradient-to-r from-cyan-950/80 to-[#111a2e] text-cyan-300 border border-cyan-800/50 shadow-sm'
                      : 'text-slate-400 hover:text-slate-200 hover:bg-[#111a2e]/60 border border-transparent'
                  }`
                }
              >
                <div className="flex items-center gap-3">
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </div>
                {item.badge !== undefined && (
                  <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-rose-500/20 text-rose-400 border border-rose-500/40 animate-pulse">
                    {item.badge}
                  </span>
                )}
              </NavLink>
            );
          })}
        </nav>
      </div>

      {/* Security Info Card */}
      <div className="p-3.5 rounded-xl bg-[#111a2e]/80 border border-[#1e2c4a] text-xs text-slate-400 space-y-1.5">
        <div className="flex items-center justify-between font-semibold text-slate-300">
          <span>Cryptographic Guard</span>
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
            Active
          </span>
        </div>
        <p className="text-[11px] leading-relaxed text-slate-400">
          Keys wrapped via RSA-OAEP 2048 & files sealed with AES-256-GCM.
        </p>
      </div>
    </aside>
  );
};
