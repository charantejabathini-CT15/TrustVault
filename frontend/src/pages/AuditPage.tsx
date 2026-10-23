import React, { useState, useEffect } from 'react';
import { auditApi } from '../services/api';
import type { AuditEventItem, AuditVerificationResult } from '../types';
import {
  History,
  ShieldCheck,
  ShieldAlert,
  Search,
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  FileCode,
  Link,
  ChevronRight,
  Filter,
} from 'lucide-react';

export const AuditPage: React.FC = () => {
  const [events, setEvents] = useState<AuditEventItem[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [verifying, setVerifying] = useState(false);
  const [verificationResult, setVerificationResult] = useState<AuditVerificationResult | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<AuditEventItem | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [resultFilter, setResultFilter] = useState('');

  const loadEvents = async () => {
    setLoading(true);
    try {
      const data = await auditApi.list({
        action: actionFilter || undefined,
        result: resultFilter || undefined,
        limit: 100,
      });
      const eventsList = data?.events || [];
      setEvents(eventsList);
      setTotal(data?.total ?? eventsList.length);
      if (eventsList.length > 0 && !selectedEvent) {
        setSelectedEvent(eventsList[0]);
      }
    } catch (err) {
      console.error('Failed to load audit events', err);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEvents();
  }, [actionFilter, resultFilter]);

  const handleVerify = async () => {
    setVerifying(true);
    try {
      const res = await auditApi.verify();
      setVerificationResult(res);
      loadEvents();
    } catch (err: any) {
      setVerificationResult({
        valid: false,
        events_checked: 0,
        message: err?.response?.data?.detail || 'Verification request failed',
      });
    } finally {
      setVerifying(false);
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header & Verification Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 p-6 rounded-2xl bg-gradient-to-r from-[#0d1322] via-[#111a2e] to-[#0a1020] border border-[#1e2c4a]">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <History className="w-5 h-5 text-cyan-400" />
            <h1 className="text-2xl font-bold text-white tracking-tight">
              Verifiable Audit Trail
            </h1>
          </div>
          <p className="text-xs text-slate-400">
            Immutable SHA-256 sequential hash chain recording all document access decisions
          </p>
        </div>

        <button
          onClick={handleVerify}
          disabled={verifying}
          className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-50 text-[#070b14] font-bold text-xs transition-all flex items-center gap-2 shadow-md shadow-cyan-500/20 active:scale-95 shrink-0"
        >
          <RefreshCw className={`w-4 h-4 ${verifying ? 'animate-spin' : ''}`} />
          <span>{verifying ? 'Calculating Hashes...' : 'Verify Entire Audit Chain'}</span>
        </button>
      </div>

      {/* Verification Result Banner */}
      {verificationResult && (
        <div
          className={`p-4 rounded-2xl border flex items-start gap-3.5 ${
            verificationResult.valid
              ? 'bg-emerald-950/40 border-emerald-500/40 text-emerald-300'
              : 'bg-rose-950/40 border-rose-500/40 text-rose-300'
          }`}
        >
          {verificationResult.valid ? (
            <ShieldCheck className="w-6 h-6 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <ShieldAlert className="w-6 h-6 text-rose-400 shrink-0 mt-0.5" />
          )}
          <div className="space-y-1 text-xs">
            <div className="font-bold text-sm">
              {verificationResult.valid ? 'Audit Chain Cryptographically Intact' : 'Chain Integrity Violation Detected!'}
            </div>
            <p className="leading-relaxed text-slate-300">{verificationResult.message}</p>
            <div className="text-[11px] font-mono text-slate-400 pt-1">
              Events checked: {verificationResult.events_checked} • Genesis hash:{' '}
              {('0'.repeat(64)).slice(0, 16)}...
              {verificationResult.first_failure_sequence && (
                <span className="text-rose-400 font-bold ml-2">
                  First detected corruption at sequence #{verificationResult.first_failure_sequence}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Filter Toolbar */}
      <div className="flex flex-wrap items-center gap-3">
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-[#0d1322] border border-[#1e2c4a] text-xs text-slate-200 focus:border-cyan-500 outline-none"
        >
          <option value="">All Actions</option>
          <option value="document_upload">Document Upload</option>
          <option value="share_created">Share Created</option>
          <option value="share_revoked">Share Revoked</option>
          <option value="document_view">Document View</option>
          <option value="document_download">Document Download</option>
          <option value="audit_verification">Audit Verification</option>
        </select>

        <select
          value={resultFilter}
          onChange={(e) => setResultFilter(e.target.value)}
          className="px-3.5 py-2 rounded-xl bg-[#0d1322] border border-[#1e2c4a] text-xs text-slate-200 focus:border-cyan-500 outline-none"
        >
          <option value="">All Results</option>
          <option value="success">Success</option>
          <option value="denied">Denied</option>
          <option value="failure">Failure</option>
        </select>

        <span className="text-xs text-slate-500 ml-auto">
          Showing {events.length} of {total} recorded event(s)
        </span>
      </div>

      {/* 2-Pane: Event Stream + Selected Event Detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left: Events List (7 cols) */}
        <div className="lg:col-span-7 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] overflow-hidden shadow-xl flex flex-col">
          <div className="p-4 bg-[#111a2e] border-b border-[#1e2c4a] text-xs font-bold text-slate-300 uppercase tracking-wider">
            Sequential Chain Events
          </div>

          <div className="divide-y divide-[#1e2c4a] max-h-[600px] overflow-y-auto">
            {loading ? (
              <div className="p-12 text-center text-slate-500">
                <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
                <span>Loading chain...</span>
              </div>
            ) : events.length > 0 ? (
              events.map((evt) => (
                <div
                  key={evt.id}
                  onClick={() => setSelectedEvent(evt)}
                  className={`p-4 cursor-pointer transition-all flex items-center justify-between text-xs ${
                    selectedEvent?.id === evt.id
                      ? 'bg-cyan-950/40 border-l-4 border-cyan-400'
                      : 'hover:bg-[#111a2e]/60 border-l-4 border-transparent'
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono text-cyan-400 font-bold">#{evt.sequence_number}</span>
                      <span className="font-semibold text-slate-200">{evt.action}</span>
                      <span
                        className={`px-2 py-0.5 text-[10px] font-bold rounded capitalize ${
                          evt.result === 'success'
                            ? 'bg-emerald-950 text-emerald-400 border border-emerald-800'
                            : 'bg-rose-950 text-rose-400 border border-rose-800'
                        }`}
                      >
                        {evt.result}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-400 flex items-center gap-2">
                      <span>Actor: {evt.actor_name || evt.actor_email || 'System'}</span>
                      {evt.document_name && (
                        <>
                          <span>•</span>
                          <span className="truncate max-w-[180px]">{evt.document_name}</span>
                        </>
                      )}
                    </div>

                    <div className="text-[10px] font-mono text-slate-500">
                      prev: {evt.previous_hash.slice(0, 10)}... → hash: {evt.event_hash.slice(0, 10)}...
                    </div>
                  </div>

                  <div className="text-right text-[11px] text-slate-500 shrink-0">
                    <div>{new Date(evt.created_at).toLocaleDateString()}</div>
                    <div className="text-[10px]">{new Date(evt.created_at).toLocaleTimeString()}</div>
                  </div>
                </div>
              ))
            ) : (
              <p className="p-8 text-center text-slate-500 italic">No events match the selected filter.</p>
            )}
          </div>
        </div>

        {/* Right: Selected Event Cryptographic Inspector (5 cols) */}
        <div className="lg:col-span-5 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] p-5 flex flex-col space-y-4">
          <div className="flex items-center gap-2 pb-3 border-b border-[#1e2c4a]">
            <FileCode className="w-4 h-4 text-cyan-400" />
            <h3 className="text-xs font-bold text-white uppercase tracking-wider">
              Cryptographic Event Inspector
            </h3>
          </div>

          {selectedEvent ? (
            <div className="space-y-3.5 text-xs">
              <div>
                <span className="text-slate-500 block text-[11px]">Sequence ID</span>
                <span className="font-mono text-slate-200 font-bold">#{selectedEvent.sequence_number}</span>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Action & Result</span>
                <div className="flex items-center gap-2 mt-0.5">
                  <span className="text-cyan-400 font-semibold">{selectedEvent.action}</span>
                  <span className="uppercase text-[10px] px-1.5 py-0.5 rounded bg-slate-800 text-slate-300">
                    {selectedEvent.result}
                  </span>
                </div>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Previous Hash (Chained)</span>
                <div className="font-mono text-[11px] text-slate-400 break-all bg-[#070b14] p-2 rounded-lg border border-[#1e2c4a]">
                  {selectedEvent.previous_hash}
                </div>
              </div>

              <div>
                <span className="text-slate-500 block text-[11px]">Current Event Hash (SHA-256)</span>
                <div className="font-mono text-[11px] text-cyan-400 break-all bg-[#070b14] p-2 rounded-lg border border-cyan-900/60 font-bold">
                  {selectedEvent.event_hash}
                </div>
              </div>

              {selectedEvent.metadata_json && (
                <div>
                  <span className="text-slate-500 block text-[11px] mb-1">Attached Non-Sensitive Metadata</span>
                  <pre className="font-mono text-[11px] text-slate-300 bg-[#070b14] p-2.5 rounded-lg border border-[#1e2c4a] overflow-x-auto">
                    {JSON.stringify(selectedEvent.metadata_json, null, 2)}
                  </pre>
                </div>
              )}

              <div className="pt-2 text-[11px] text-slate-500">
                Timestamp: {new Date(selectedEvent.created_at).toISOString()}
              </div>
            </div>
          ) : (
            <div className="p-8 text-center text-slate-500 italic">
              Select an event to inspect its cryptographic payload.
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
