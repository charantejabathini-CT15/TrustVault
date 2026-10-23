import React, { useState, useEffect } from 'react';
import { documentsApi } from '../services/api';
import type { DocumentItem } from '../types';
import {
  FileText,
  Upload,
  Share2,
  Eye,
  Trash2,
  Lock,
  Search,
  CheckCircle2,
  RefreshCw,
  Plus,
} from 'lucide-react';

interface DocumentsPageProps {
  onOpenUpload: () => void;
  onOpenPreview: (doc: DocumentItem) => void;
  onOpenShare: (docId: string) => void;
}

export const DocumentsPage: React.FC<DocumentsPageProps> = ({
  onOpenUpload,
  onOpenPreview,
  onOpenShare,
}) => {
  const [documents, setDocuments] = useState<DocumentItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const loadDocs = async () => {
    setLoading(true);
    try {
      const data = await documentsApi.list('owned');
      setDocuments(data?.documents || []);
    } catch (err) {
      console.error('Failed to load owned documents', err);
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadDocs();
  }, []);

  const handleDelete = async (id: string, name: string) => {
    if (!window.confirm(`Are you sure you want to delete "${name}"? This will revoke all active shares.`)) {
      return;
    }
    try {
      await documentsApi.delete(id);
      loadDocs();
    } catch (err) {
      alert('Failed to delete document');
    }
  };

  const filtered = documents.filter((d) =>
    d.name.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="p-6 md:p-8 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">My Documents</h1>
          <p className="text-xs text-slate-400 mt-1">
            Documents you have encrypted and uploaded to TrustVault
          </p>
        </div>

        <button
          onClick={onOpenUpload}
          className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-[#070b14] text-xs font-semibold flex items-center gap-2 transition-all shadow-md shadow-cyan-500/20 shrink-0"
        >
          <Plus className="w-4 h-4 stroke-[3]" />
          <span>Upload New Document</span>
        </button>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <Search className="w-4 h-4 absolute left-3.5 top-3 text-slate-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search documents by name..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-[#0d1322] border border-[#1e2c4a] focus:border-cyan-500 text-xs text-slate-200 placeholder-slate-500 outline-none transition-colors"
          />
        </div>
      </div>

      {/* Documents Table */}
      <div className="rounded-2xl bg-[#0d1322] border border-[#1e2c4a] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111a2e] border-b border-[#1e2c4a] text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3.5 px-4">Document</th>
                <th className="py-3.5 px-4">Size</th>
                <th className="py-3.5 px-4">Encrypted Hash</th>
                <th className="py-3.5 px-4">Active Shares</th>
                <th className="py-3.5 px-4">Uploaded</th>
                <th className="py-3.5 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2c4a] text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
                    <span>Loading documents...</span>
                  </td>
                </tr>
              ) : filtered.length > 0 ? (
                filtered.map((doc) => (
                  <tr key={doc.id} className="hover:bg-[#111a2e]/40 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-200 flex items-center gap-2.5">
                      <FileText className="w-4 h-4 text-cyan-400 shrink-0" />
                      <span className="truncate max-w-xs">{doc.name}</span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono">
                      {(doc.size / 1024).toFixed(1)} KB
                    </td>
                    <td className="py-3.5 px-4 font-mono text-[11px] text-slate-500">
                      {doc.encrypted_file_hash ? `${doc.encrypted_file_hash.slice(0, 16)}...` : 'N/A'}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className="px-2 py-0.5 rounded-full text-[11px] bg-cyan-950/80 text-cyan-400 border border-cyan-800/60 font-medium">
                        {doc.share_count} recipient(s)
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(doc.created_at).toLocaleDateString()}
                    </td>
                    <td className="py-3.5 px-4 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => onOpenPreview(doc)}
                          title="Decrypt & View In-Browser"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 border border-transparent hover:border-cyan-800 transition-colors"
                        >
                          <Eye className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => onOpenShare(doc.id)}
                          title="Share Access"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-teal-300 hover:bg-teal-950/40 border border-transparent hover:border-teal-800 transition-colors"
                        >
                          <Share2 className="w-4 h-4" />
                        </button>
                        <button
                          onClick={() => handleDelete(doc.id, doc.name)}
                          title="Delete Document"
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-400 hover:bg-rose-950/40 border border-transparent hover:border-rose-800 transition-colors"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="py-12 text-center text-slate-500">
                    <FileText className="w-10 h-10 mx-auto mb-2 text-slate-600" />
                    <p className="font-medium text-slate-400">No documents found</p>
                    <p className="text-xs text-slate-500 mt-1">Upload a document to encrypt it client-side.</p>
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
