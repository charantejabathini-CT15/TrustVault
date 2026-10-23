import React, { useState, useEffect } from 'react';
import { documentsApi } from '../services/api';
import type { DocumentItem } from '../types';
import {
  Share2,
  FileText,
  Eye,
  Download,
  Calendar,
  Lock,
  Search,
  RefreshCw,
  Clock,
} from 'lucide-react';

interface SharedWithMePageProps {
  onOpenPreview: (doc: DocumentItem) => void;
}

export const SharedWithMePage: React.FC<SharedWithMePageProps> = ({ onOpenPreview }) => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadDocs = async () => {
    setLoading(true);
    try {
      const data = await documentsApi.list('shared');
      setDocuments(data?.documents || []);
    } catch (err) {
      console.error('Failed to load shared documents', err);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const filtered = documents.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-white tracking-tight">Shared With Me</h1>
        <p className="text-xs text-slate-400 mt-1">
          Confidential documents other organization members have granted you access to
        </p>
      </div>

      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search shared documents..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#0d1322] border border-[#1e2c4a] focus:border-cyan-500 text-xs text-slate-200 placeholder-slate-500 outline-none transition-colors"
          />
        </div>
      </div>

      <div className="rounded-2xl bg-[#0d1322] border border-[#1e2c4a] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111a2e] border-b border-[#1e2c4a] text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3.5 px-4">Document</th>
                <th className="py-3.5 px-4">Owner</th>
                <th className="py-3.5 px-4">Size</th>
                <th className="py-3.5 px-4">Granted Permission</th>
                <th className="py-3.5 px-4">Shared Date</th>
                <th className="py-3.5 px-4 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2c4a] text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
                    <span>Loading shared documents...</span>
                  </td>
                </tr>
              ) : filtered.length > 0 ? (
                filtered.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[#111a2e]/40 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-200 flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="truncate max-w-xs">{doc.name}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-300 font-medium">
                      {doc.owner_name || 'Organization Member'}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono">
                      {(doc.size / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3.5 px-4">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[11px] font-semibold uppercase tracking-wider border ${
                          doc.permission === 'download'
                            ? 'bg-teal-950/80 text-teal-400 border-teal-800/60'
                            : 'bg-cyan-950/80 text-cyan-400 border-cyan-800/60'
                        }`}
                      >
                        {doc.permission} Access
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <button
                        onClick={() => onOpenPreview(doc)}
                        className="py-1.5 px-3 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/20 text-cyan-400 border border-cyan-500/30 text-xs font-semibold transition-colors inline-flex items-center gap-1.5"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        <span>Decrypt & View</span>
                      </button>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <Share2 className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                    <p className="font-medium text-slate-400">No documents shared with you</p>
                    <p className="text-xs text-slate-500 mt-1">
                      When someone in your organization grants you access, documents will appear here.
                    </p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
