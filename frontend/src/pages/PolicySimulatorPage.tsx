import React, { useState, useEffect } from 'react';
import { policyApi, teamApi, documentsApi } from '../services/api';
import type { OrgMemberItem, DocumentItem, PolicySimulationResult } from '../types';
import {
  Sliders,
  CheckCircle2,
  XCircle,
  HelpCircle,
  Clock,
  ArrowRight,
  Shield,
  FileText,
  User,
  RefreshCw,
  AlertCircle,
} from 'lucide-react';

export const PolicySimulatorPage: React.FC = () => {
  const [members, setMembers] = useState<OrgMemberItem[]>([]);
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [selectedUserId, setSelectedUserId] = useState('');
  const [selectedDocId, setSelectedDocId] = useState('');
  const [selectedAction, setSelectedAction] = useState<'view' | 'download'>('view');
  const [timeOffsetDays, setTimeOffsetDays] = useState('0');

  const [loading, setLoading] = useState(false);
  const [fetching, setFetching] = useState(true);
  const [result, setResult] = useState<PolicySimulationResult | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const loadData = async () => {
      setFetching(true);
      try {
        const [teamData, docsData] = await Promise.all([
          teamApi.getMembers(),
          documentsApi.list(),
        ]);
        const membersList = Array.isArray(teamData) ? teamData : (teamData?.members || []);
        const docsList = Array.isArray(docsData) ? docsData : (docsData?.documents || []);
        setMembers(membersList);
        setDocuments(docsList);
        if (membersList.length > 0) setSelectedUserId(membersList[0].user_id);
        if (docsList.length > 0) setSelectedDocId(docsList[0].id);
      } catch (err) {
        console.error('Failed to load simulator data', err);
        setMembers([]);
        setDocuments([]);
      } finally {
        setFetching(false);
      }
    };
    loadData();
  }, []);

  const handleSimulate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedUserId || !selectedDocId) return;

    setLoading(true);
    setError('');

    try {
      let simulatedTime: string | undefined;
      const days = parseInt(timeOffsetDays, 10);
      if (days !== 0) {
        const d = new Date();
        d.setDate(d.getDate() + days);
        simulatedTime = d.toISOString();
      }

      const res = await policyApi.simulate({
        user_id: selectedUserId,
        document_id: selectedDocId,
        action: selectedAction,
        simulated_time: simulatedTime,
      });
      setResult(res);
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Simulation request failed');
      setResult(null);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-5xl mx-auto">
      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Sliders className="w-5 h-5 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Access Policy Simulator</h1>
        </div>
        <p className="text-xs text-slate-400">
          Deterministic pre-flight evaluation using the exact same backend authorization policy engine
        </p>
      </div>

      {/* Notice Banner */}
      <div className="p-4 rounded-2xl bg-cyan-950/40 border border-cyan-800/40 text-xs text-slate-300 flex items-start gap-3">
        <Shield className="w-5 h-5 text-cyan-400 shrink-0 mt-0.5" />
        <div className="space-y-1">
          <div className="font-semibold text-cyan-300">Read-Only Cryptographic Simulation</div>
          <p className="text-slate-400 text-[11px] leading-relaxed">
            Simulation evaluates authorization rules without altering database grants, recording unauthorized access violations, or decrypting file contents.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 rounded-2xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-300">
          <AlertCircle className="w-5 h-5 shrink-0 text-rose-400" />
          <span>{error}</span>
        </div>
      )}

      {/* Simulator Control Form */}
      <form onSubmit={handleSimulate} className="p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] shadow-xl space-y-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Simulated Member */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <User className="w-3.5 h-3.5 text-cyan-400" />
              <span>Simulated Member</span>
            </label>
            <select
              value={selectedUserId}
              onChange={(e) => setSelectedUserId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] text-xs text-slate-100 focus:border-cyan-500 outline-none"
            >
              {members.length === 0 ? (
                <option value="" disabled>No team members found</option>
              ) : (
                members.map((m) => (
                  <option key={m.id} value={m.user_id} className="bg-[#111a2e]">
                    {m.display_name} ({m.email}) — {m.role}
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Target Document */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-cyan-400" />
              <span>Target Document</span>
            </label>
            <select
              value={selectedDocId}
              onChange={(e) => setSelectedDocId(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] text-xs text-slate-100 focus:border-cyan-500 outline-none"
            >
              {documents.length === 0 ? (
                <option value="" disabled>No documents uploaded yet</option>
              ) : (
                documents.map((d) => (
                  <option key={d.id} value={d.id} className="bg-[#111a2e]">
                    {d.name} (Owner: {d.owner_name || 'Member'})
                  </option>
                ))
              )}
            </select>
          </div>

          {/* Requested Action */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5">
              Requested Action
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setSelectedAction('view')}
                className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                  selectedAction === 'view'
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                    : 'bg-[#111a2e] border-[#1e2c4a] text-slate-400 hover:text-slate-200'
                }`}
              >
                In-Browser View
              </button>
              <button
                type="button"
                onClick={() => setSelectedAction('download')}
                className={`py-2 rounded-xl text-xs font-semibold border transition-all ${
                  selectedAction === 'download'
                    ? 'bg-cyan-500/20 border-cyan-500 text-cyan-300'
                    : 'bg-[#111a2e] border-[#1e2c4a] text-slate-400 hover:text-slate-200'
                }`}
              >
                File Download
              </button>
            </div>
          </div>

          {/* Simulated Time Offset */}
          <div>
            <label className="block text-xs font-semibold text-slate-300 mb-1.5 flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-cyan-400" />
              <span>Simulated Time Evaluation</span>
            </label>
            <select
              value={timeOffsetDays}
              onChange={(e) => setTimeOffsetDays(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] text-xs text-slate-100 focus:border-cyan-500 outline-none"
            >
              <option value="0">Current Timestamp (Now)</option>
              <option value="2">+2 Days (Test Near-Term Expiry)</option>
              <option value="8">+8 Days (Test 7-Day Expired Grant)</option>
              <option value="35">+35 Days (Test 30-Day Expired Grant)</option>
            </select>
          </div>
        </div>

        {documents.length === 0 && !fetching && (
          <div className="p-3 rounded-xl bg-amber-500/10 border border-amber-500/20 text-xs text-amber-300 flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-amber-400" />
            <span>No documents found in your organization. Upload a document from "My Documents" to simulate access policies.</span>
          </div>
        )}

        <button
          type="submit"
          disabled={loading || !selectedUserId || !selectedDocId}
          className="w-full py-3 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-50 text-[#070b14] font-bold text-xs transition-all flex items-center justify-center gap-2 shadow-lg shadow-cyan-500/20"
        >
          {loading ? 'Evaluating Rules...' : 'Run Deterministic Policy Simulation'}
        </button>
      </form>

      {/* Simulation Result */}
      {result && (
        <div className="p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] shadow-2xl space-y-6 animate-in fade-in duration-300">
          {/* Outcome Banner */}
          <div
            className={`p-5 rounded-2xl border flex items-center justify-between ${
              result.allowed
                ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
                : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
            }`}
          >
            <div className="flex items-center gap-3">
              {result.allowed ? (
                <CheckCircle2 className="w-8 h-8 text-emerald-400" />
              ) : (
                <XCircle className="w-8 h-8 text-rose-400" />
              )}
              <div>
                <div className="text-xl font-extrabold tracking-tight">
                  SIMULATION VERDICT: {result.allowed ? 'ALLOW' : 'DENY'}
                </div>
                <div className="text-xs text-slate-300 mt-0.5">
                  Deciding rule outcome: <span className="font-semibold">{result.reason}</span>
                </div>
              </div>
            </div>

            <span className="text-[10px] uppercase font-bold tracking-wider px-2.5 py-1 rounded bg-[#070b14]/60 border border-current">
              Simulated Outcome
            </span>
          </div>

          {/* Rule Evaluation Checklist */}
          <div>
            <h3 className="text-xs font-bold text-white uppercase tracking-wider mb-3">
              Policy Rule Evaluation Pipeline
            </h3>

            <div className="space-y-2">
              {result.checks.map((step, idx) => (
                <div
                  key={idx}
                  className={`p-3.5 rounded-xl border flex items-center justify-between text-xs transition-colors ${
                    step.passed
                      ? 'bg-[#111a2e]/60 border-emerald-900/40 text-slate-200'
                      : 'bg-rose-950/20 border-rose-900/50 text-rose-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {step.passed ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <span className="font-medium">{step.detail}</span>
                  </div>
                  <span className="font-mono text-[11px] text-slate-500 uppercase">
                    {step.check}
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
