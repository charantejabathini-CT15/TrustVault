import React, { useState, useEffect } from 'react';
import { alertsApi } from '../services/api';
import type { SecurityAlertItem } from '../types';
import {
  AlertTriangle,
  ShieldAlert,
  CheckCircle2,
  XCircle,
  Eye,
  RefreshCw,
  Search,
  Check,
  Slash,
} from 'lucide-react';

export const AlertsPage: React.FC = () => {
  const [alerts, setAlerts] = useState<SecurityAlertItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('open');
  const [severityFilter, setSeverityFilter] = useState('');
  const [loading, setLoading] = useState(true);
  const [updatingId, setUpdatingId] = useState<string | null>(null);

  const loadAlerts = async () => {
    setLoading(true);
    try {
      const data = await alertsApi.list({
        status: statusFilter || undefined,
        severity: severityFilter || undefined,
      });
      setAlerts(data?.alerts || []);
    } catch (err) {
      console.error('Failed to load alerts', err);
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadAlerts();
  }, [statusFilter, severityFilter]);

  const handleUpdateStatus = async (
    alertId: string,
    status: 'acknowledged' | 'resolved' | 'dismissed'
  ) => {
    setUpdatingId(alertId);
    try {
      await alertsApi.updateStatus(alertId, status);
      loadAlerts();
    } catch (err) {
      alert('Failed to update alert status');
    } finally {
      setUpdatingId(null);
    }
  };

  const severityBadge = (sev: string) => {
    switch (sev) {
      case 'critical':
        return 'bg-rose-950/80 text-rose-400 border-rose-800/80 animate-pulse';
      case 'high':
        return 'bg-orange-950/80 text-orange-400 border-orange-800/80';
      case 'medium':
        return 'bg-amber-950/80 text-amber-400 border-amber-800/80';
      default:
        return 'bg-cyan-950/80 text-cyan-400 border-cyan-800/80';
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-5 h-5 text-rose-400" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Security Alerts</h1>
        </div>
        <p className="text-xs text-slate-400">
          Rule-based anomaly detection engine monitoring unauthorized access and burst attempts
        </p>
      </div>

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-[#0d1322] border border-[#1e2c4a] text-xs text-slate-200 focus:border-cyan-500 outline-none"
        >
          <option value="">All Statuses</option>
          <option value="open">Open Alerts</option>
          <option value="acknowledged">Acknowledged</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
        </select>

        <select
          value={severityFilter}
          onChange={(e) => setSeverityFilter(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-[#0d1322] border border-[#1e2c4a] text-xs text-slate-200 focus:border-cyan-500 outline-none"
        >
          <option value="">All Severities</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="medium">Medium</option>
          <option value="low">Low</option>
        </select>

        <button
          onClick={loadAlerts}
          className="p-2 rounded-xl bg-[#0d1322] border border-[#1e2c4a] text-slate-400 hover:text-cyan-400 transition-colors ml-auto"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Alerts Stream */}
      <div className="space-y-4">
        {loading ? (
          <div className="p-12 text-center text-slate-500">
            <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
            <span>Loading security alerts...</span>
          </div>
        ) : alerts.length > 0 ? (
          alerts.map((alert) => (
            <div
              key={alert.id}
              className="p-5 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] hover:border-slate-700 transition-all space-y-4 shadow-lg"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[#1e2c4a]">
                <div className="flex items-center gap-2.5">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${severityBadge(
                      alert.severity
                    )}`}
                  >
                    {alert.severity}
                  </span>
                  <span className="font-mono text-xs text-cyan-300 font-semibold">
                    {alert.rule_name}
                  </span>
                </div>

                <div className="text-xs text-slate-400 flex items-center gap-2">
                  <span>Detected: {new Date(alert.created_at).toLocaleString()}</span>
                  <span className="capitalize px-2 py-0.5 rounded bg-[#111a2e] text-slate-300 font-medium text-[11px]">
                    {alert.status}
                  </span>
                </div>
              </div>

              <div className="space-y-1.5 text-xs">
                <p className="text-slate-200 font-medium text-sm leading-relaxed">
                  {alert.description}
                </p>
                {alert.recommendation && (
                  <p className="text-slate-400 text-xs">
                    <span className="text-cyan-400 font-semibold">Recommendation: </span>
                    {alert.recommendation}
                  </p>
                )}
                {alert.user_email && (
                  <p className="text-slate-400 text-xs">
                    <span className="text-slate-500">Target Account: </span>
                    <span className="font-mono text-slate-300">{alert.user_email}</span>
                  </p>
                )}
              </div>

              {alert.evidence_json && (
                <div className="bg-[#070b14] p-3 rounded-xl border border-[#1e2c4a] text-[11px] font-mono text-slate-400 overflow-x-auto">
                  <span className="text-slate-500 block mb-1">Supporting Forensic Evidence:</span>
                  <pre>{JSON.stringify(alert.evidence_json, null, 2)}</pre>
                </div>
              )}

              {/* Workflow Actions */}
              <div className="flex items-center justify-end gap-2 pt-1">
                {alert.status === 'open' && (
                  <button
                    disabled={updatingId === alert.id}
                    onClick={() => handleUpdateStatus(alert.id, 'acknowledged')}
                    className="px-3 py-1.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Eye className="w-3.5 h-3.5" />
                    <span>Acknowledge</span>
                  </button>
                )}
                {alert.status !== 'resolved' && (
                  <button
                    disabled={updatingId === alert.id}
                    onClick={() => handleUpdateStatus(alert.id, 'resolved')}
                    className="px-3 py-1.5 rounded-xl bg-emerald-500/10 hover:bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>Mark Resolved</span>
                  </button>
                )}
                {alert.status !== 'dismissed' && (
                  <button
                    disabled={updatingId === alert.id}
                    onClick={() => handleUpdateStatus(alert.id, 'dismissed')}
                    className="px-3 py-1.5 rounded-xl text-slate-400 hover:text-slate-200 hover:bg-[#111a2e] text-xs font-semibold transition-colors flex items-center gap-1.5"
                  >
                    <Slash className="w-3.5 h-3.5" />
                    <span>Dismiss</span>
                  </button>
                )}
              </div>
            </div>
          ))
        ) : (
          <div className="p-12 text-center rounded-2xl bg-[#0d1322] border border-[#1e2c4a] text-slate-400">
            <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-emerald-400" />
            <p className="font-semibold text-slate-200">No security alerts detected</p>
            <p className="text-xs text-slate-500 mt-1">
              All access patterns are currently within normal baseline thresholds.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
