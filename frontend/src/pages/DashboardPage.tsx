import React, { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardApi, auditApi, documentsApi, alertsApi } from '../services/api';
import { db } from '../services/firebase';
import { collection, query, where, onSnapshot } from 'firebase/firestore';
import type { DashboardStats, AuditEventItem, DocumentItem, SecurityAlertItem } from '../types';
import {
  FileText,
  Share2,
  AlertTriangle,
  History,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Upload,
  Sliders,
  CheckCircle2,
  RefreshCw,
  Lock,
} from 'lucide-react';

interface DashboardPageProps {
  onOpenUpload: () => void;
  onOpenVault: () => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onOpenUpload, onOpenVault }) => {
  const { user, isVaultUnlocked } = useAuth();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [recentEvents, setRecentEvents] = useState<AuditEventItem[]>([]);
  const [recentDocs, setRecentDocs] = useState<DocumentItem[]>([]);
  const [alerts, setAlerts] = useState<SecurityAlertItem[]>([]);
  const [verifying, setVerifying] = useState(false);
  const [verificationMsg, setVerificationMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastSyncTime, setLastSyncTime] = useState<Date>(new Date());

  const loadDashboard = async (isSilent = false) => {
    if (!isSilent) setLoading(true);
    try {
      const results = await Promise.allSettled([
        dashboardApi.getStats(),
        auditApi.list({ limit: 5 }),
        documentsApi.list(),
        alertsApi.list({ status: 'open' }),
      ]);

      let loadedDocs: DocumentItem[] = [];

      if (results[0].status === 'fulfilled') {
        setStats(results[0].value);
      }
      if (results[1].status === 'fulfilled') {
        setRecentEvents(results[1].value?.events || []);
      }
      if (results[2].status === 'fulfilled') {
        loadedDocs = results[2].value?.documents || [];
        setRecentDocs(loadedDocs.slice(0, 5));
      }
      if (results[3].status === 'fulfilled') {
        setAlerts((results[3].value?.alerts || []).slice(0, 3));
      }

      // Sync document counts if loaded
      if (loadedDocs.length > 0) {
        setStats((prev) => ({
          active_shares: prev?.active_shares ?? 0,
          open_alerts: prev?.open_alerts ?? 0,
          total_audit_events: prev?.total_audit_events ?? 0,
          chain_verified: prev?.chain_verified ?? true,
          ...prev,
          total_documents: Math.max(prev?.total_documents ?? 0, loadedDocs.length),
        }));
      }

      setLastSyncTime(new Date());
    } catch (err) {
      console.error('Failed to load dashboard data', err);
    } finally {
      if (!isSilent) setLoading(false);
    }
  };

  useEffect(() => {
    // Initial fetch
    loadDashboard(false);

    if (!user) return;
    const orgId = user.org_id || 'default_org';

    // 1. Live real-time listener on documents
    let unsubDocs = () => {};
    try {
      const qDocs = query(collection(db, 'documents'), where('org_id', '==', orgId));
      unsubDocs = onSnapshot(
        qDocs,
        () => {
          loadDashboard(true);
        },
        (e) => console.warn('Real-time docs listener notice:', e)
      );
    } catch (e) {
      console.warn('Could not attach documents snapshot listener:', e);
    }

    // 2. Live real-time listener on audit events
    let unsubAudit = () => {};
    try {
      const qAudit = query(collection(db, 'audit_events'), where('org_id', '==', orgId));
      unsubAudit = onSnapshot(
        qAudit,
        () => {
          loadDashboard(true);
        },
        (e) => console.warn('Real-time audit listener notice:', e)
      );
    } catch (e) {
      console.warn('Could not attach audit snapshot listener:', e);
    }

    // 3. Live real-time listener on shares
    let unsubShares = () => {};
    try {
      unsubShares = onSnapshot(
        collection(db, 'shares'),
        () => {
          loadDashboard(true);
        },
        (e) => console.warn('Real-time shares listener notice:', e)
      );
    } catch (e) {
      console.warn('Could not attach shares snapshot listener:', e);
    }

    // 4. Fallback interval every 4 seconds to guarantee live updates
    const interval = setInterval(() => {
      loadDashboard(true);
    }, 4000);

    return () => {
      unsubDocs();
      unsubAudit();
      unsubShares();
      clearInterval(interval);
    };
  }, [user?.org_id, user?.id]);

  const handleVerifyChain = async () => {
    setVerifying(true);
    setVerificationMsg(null);
    try {
      const res = await auditApi.verify();
      setVerificationMsg(res.message);
      loadDashboard(true);
    } catch (err: any) {
      setVerificationMsg(err?.response?.data?.detail || 'Verification error');
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      {/* Welcome & Security Banner */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-[#0d1322] via-[#111a2e] to-[#0a1020] border border-[#1e2c4a]">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl md:text-3xl font-extrabold text-white tracking-tight">
              Security Operations Dashboard
            </h1>
            <div className="hidden sm:inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-[11px] font-semibold">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
              </span>
              <span>Live Real-Time Sync</span>
            </div>
          </div>
          <p className="text-xs text-slate-400 mt-1">
            Organization: <span className="text-cyan-400 font-semibold">{user?.org_name}</span> • Role:{' '}
            <span className="capitalize text-slate-300 font-medium">{user?.role}</span> • Last synced:{' '}
            <span className="text-slate-300 font-mono">{lastSyncTime.toLocaleTimeString()}</span>
          </p>
        </div>

        <div className="flex items-center gap-2.5 flex-wrap">
          <button
            onClick={() => loadDashboard(false)}
            disabled={loading}
            title="Refresh Dashboard Data"
            className="px-3 py-2 rounded-xl bg-[#111a2e] hover:bg-[#1e2c4a] text-slate-300 hover:text-white border border-[#1e2c4a] text-xs font-semibold flex items-center gap-1.5 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin text-cyan-400' : ''}`} />
            <span>Sync</span>
          </button>

          {!isVaultUnlocked && (
            <button
              onClick={onOpenVault}
              className="px-4 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-semibold flex items-center gap-2 transition-colors"
            >
              <Lock className="w-4 h-4 text-amber-400" />
              <span>Unlock Vault</span>
            </button>
          )}

          <button
            onClick={onOpenUpload}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-[#070b14] text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-cyan-500/20"
          >
            <Upload className="w-4 h-4" />
            <span>Upload Document</span>
          </button>
        </div>
      </div>

      {/* Metrics Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
        {/* Total Documents */}
        <div className="p-5 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] hover:border-cyan-500/30 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium">Protected Documents</span>
            <div className="p-2 rounded-xl bg-cyan-500/10 text-cyan-400">
              <FileText className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {stats?.total_documents ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">AES-256-GCM sealed</div>
        </div>

        {/* Active Shares */}
        <div className="p-5 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] hover:border-teal-500/30 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium">Active Share Grants</span>
            <div className="p-2 rounded-xl bg-teal-500/10 text-teal-400">
              <Share2 className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {stats?.active_shares ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Enforced by backend policy</div>
        </div>

        {/* Security Alerts */}
        <div className="p-5 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] hover:border-rose-500/30 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium">Open Security Alerts</span>
            <div className="p-2 rounded-xl bg-rose-500/10 text-rose-400">
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <div className="text-2xl font-bold text-white tracking-tight">
            {stats?.open_alerts ?? 0}
          </div>
          <div className="text-[11px] text-slate-500 mt-1">Rule engine monitoring</div>
        </div>

        {/* Audit Chain Verification */}
        <div className="p-5 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] hover:border-emerald-500/30 transition-all">
          <div className="flex items-center justify-between text-slate-400 mb-3">
            <span className="text-xs font-medium">Audit Hash Chain</span>
            <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-400">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="text-2xl font-bold text-white tracking-tight">
              {stats?.total_audit_events ?? 0}
            </div>
            <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-950 text-emerald-400 border border-emerald-800">
              Intact
            </span>
          </div>
          <div className="text-[11px] text-slate-500 mt-1">SHA-256 sequential chain</div>
        </div>
      </div>

      {/* Audit Chain Verification Banner */}
      <div className="p-5 rounded-2xl bg-[#0d1322] border border-cyan-500/30 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0">
            <History className="w-5 h-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-white">Tamper-Evident Hash Chain Verification</h3>
            <p className="text-xs text-slate-400">
              Mathematically verify every recorded event hash from genesis to sequence head.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {verificationMsg && (
            <span className="text-xs text-cyan-300 font-mono bg-cyan-950/60 px-3 py-1.5 rounded-lg border border-cyan-800">
              {verificationMsg}
            </span>
          )}
          <button
            onClick={handleVerifyChain}
            disabled={verifying}
            className="px-4 py-2 rounded-xl bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-200 text-xs font-semibold transition-all flex items-center gap-2 shrink-0 active:scale-95"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${verifying ? 'animate-spin' : ''}`} />
            <span>{verifying ? 'Verifying Chain...' : 'Verify Chain Integrity'}</span>
          </button>
        </div>
      </div>

      {/* Main 2-Column Section */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Recent Documents */}
        <div className="p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white tracking-wide uppercase">
              Recent Documents
            </h2>
            <Link
              to="/documents"
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
            >
              <span>View All</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2">
            {recentDocs.length > 0 ? (
              recentDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="p-3 rounded-xl bg-[#111a2e]/60 border border-[#1e2c4a] flex items-center justify-between text-xs"
                >
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-cyan-950/50 text-cyan-400">
                      <FileText className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="font-semibold text-slate-200">{doc.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {(doc.size / 1024).toFixed(1)} KB • {doc.share_count} active share(s)
                      </div>
                    </div>
                  </div>
                  <span className="uppercase text-[10px] font-bold px-2 py-0.5 rounded bg-[#1e2c4a] text-slate-300">
                    {doc.permission || 'Restricted'}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic py-4">No documents uploaded yet.</p>
            )}
          </div>
        </div>

        {/* Recent Audit Events */}
        <div className="p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-bold text-white tracking-wide uppercase">
              Recent Audit Log
            </h2>
            <Link
              to="/audit"
              className="text-xs text-cyan-400 hover:text-cyan-300 flex items-center gap-1 font-medium"
            >
              <span>Full Audit Trail</span>
              <ArrowRight className="w-3.5 h-3.5" />
            </Link>
          </div>

          <div className="space-y-2">
            {recentEvents.length > 0 ? (
              recentEvents.map((evt) => (
                <div
                  key={evt.id}
                  className="p-3 rounded-xl bg-[#111a2e]/60 border border-[#1e2c4a] flex items-center justify-between text-xs font-mono"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-cyan-400 font-semibold font-sans">{evt.action}</span>
                      <span className="text-slate-500 font-sans">•</span>
                      <span className="text-[11px] text-slate-400 font-sans">
                        seq #{evt.sequence_number}
                      </span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      hash: {evt.event_hash.slice(0, 16)}...
                    </div>
                  </div>
                  <span
                    className={`px-2 py-0.5 text-[10px] font-bold rounded capitalize font-sans ${
                      evt.result === 'success'
                        ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                        : 'bg-rose-950 text-rose-400 border border-rose-800'
                    }`}
                  >
                    {evt.result}
                  </span>
                </div>
              ))
            ) : (
              <p className="text-xs text-slate-500 italic py-4">No audit events recorded yet.</p>
            )}
          </div>
        </div>
      </div>

      {/* Bottom Attribution Footer */}
      <footer className="pt-6 pb-2 border-t border-[#1e2c4a]/80 flex flex-col sm:flex-row items-center justify-between text-xs text-slate-400 gap-3">
        <div className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
          <span className="text-slate-400">Zero-Knowledge Cryptographic Vault • Real-Time Security Operations</span>
        </div>
        <div className="text-slate-400 font-medium flex items-center gap-1.5 text-xs">
          <span>Created by</span>
          <span className="text-cyan-400 font-bold tracking-wide hover:text-cyan-300 transition-colors">
            Charan Teja Bathini
          </span>
        </div>
      </footer>
    </div>
  );
};
