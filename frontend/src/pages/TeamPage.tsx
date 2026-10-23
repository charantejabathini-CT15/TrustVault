import React, { useState, useEffect } from 'react';
import { teamApi } from '../services/api';
import type { OrgMemberItem } from '../types';
import { Users, UserPlus, Shield, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

export const TeamPage: React.FC = () => {
  const [members, setMembers] = useState<OrgMemberItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('member');
  const [displayName, setDisplayName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');

  const loadMembers = async () => {
    setLoading(true);
    try {
      const data = await teamApi.getMembers();
      const list = Array.isArray(data) ? data : (data?.members || []);
      setMembers(list);
    } catch (err) {
      console.error('Failed to load members', err);
      setMembers([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadMembers();
  }, []);

  const handleAddMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setSubmitting(true);
    setError('');
    setSuccess('');

    try {
      await teamApi.addMember({
        email,
        role,
        display_name: displayName || undefined,
      });
      setSuccess(`Added ${email} to organization with role ${role}!`);
      setEmail('');
      setDisplayName('');
      loadMembers();
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Failed to add member');
    } finally {
      setSubmitting(false);
    }
  };

  const roleBadge = (r: string) => {
    switch (r) {
      case 'owner':
        return 'bg-cyan-950/80 text-cyan-400 border-cyan-800/80';
      case 'admin':
        return 'bg-teal-950/80 text-teal-400 border-teal-800/80';
      case 'auditor':
        return 'bg-purple-950/80 text-purple-400 border-purple-800/80';
      default:
        return 'bg-slate-800 text-slate-300 border-slate-700';
    }
  };

  return (
    <div className="p-6 md:p-8 space-y-8 max-w-7xl mx-auto">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Users className="w-5 h-5 text-cyan-400" />
          <h1 className="text-2xl font-bold text-white tracking-tight">Team & Members</h1>
        </div>
        <p className="text-xs text-slate-400">
          Manage workspace members, role-based controls, and organization boundaries
        </p>
      </div>

      {/* Role Definitions Card */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { role: 'Owner', desc: 'Full workspace authority, member management & retention' },
          { role: 'Admin', desc: 'Can run access policy simulator & manage members' },
          { role: 'Member', desc: 'Uploads documents, encrypts files, and grants sharing' },
          { role: 'Auditor', desc: 'Inspects verified audit trails (no automatic decryption)' },
        ].map((item) => (
          <div key={item.role} className="p-4 rounded-xl bg-[#0d1322] border border-[#1e2c4a] space-y-1">
            <span className="text-xs font-bold uppercase tracking-wider text-cyan-300">
              {item.role}
            </span>
            <p className="text-[11px] text-slate-400 leading-relaxed">{item.desc}</p>
          </div>
        ))}
      </div>

      {/* Add Member Form */}
      <div className="p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] shadow-xl space-y-4">
        <div className="flex items-center gap-2 pb-3 border-b border-[#1e2c4a]">
          <UserPlus className="w-4 h-4 text-cyan-400" />
          <h3 className="text-xs font-bold text-white uppercase tracking-wider">
            Invite or Add Member
          </h3>
        </div>

        {error && (
          <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center gap-2 text-xs text-emerald-300">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <form onSubmit={handleAddMember} className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Member Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="colleague@organization.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] text-xs text-slate-100 focus:border-cyan-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Display Name (Optional)
            </label>
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Sarah Connor"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] text-xs text-slate-100 focus:border-cyan-500 outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Assigned Role
            </label>
            <div className="flex gap-2">
              <select
                value={role}
                onChange={(e) => setRole(e.target.value)}
                className="flex-1 px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] text-xs text-slate-100 focus:border-cyan-500 outline-none"
              >
                <option value="member">Member</option>
                <option value="admin">Admin</option>
                <option value="auditor">Auditor</option>
                <option value="owner">Owner</option>
              </select>

              <button
                type="submit"
                disabled={submitting || !email}
                className="px-4 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-50 text-[#070b14] font-semibold text-xs transition-all shrink-0"
              >
                {submitting ? 'Adding...' : 'Add Member'}
              </button>
            </div>
          </div>
        </form>
      </div>

      {/* Members Table */}
      <div className="rounded-2xl bg-[#0d1322] border border-[#1e2c4a] overflow-hidden shadow-xl">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-[#111a2e] border-b border-[#1e2c4a] text-slate-400 uppercase tracking-wider font-semibold">
              <tr>
                <th className="py-3.5 px-4">Member</th>
                <th className="py-3.5 px-4">Email</th>
                <th className="py-3.5 px-4">Role</th>
                <th className="py-3.5 px-4">Joined Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1e2c4a] text-slate-300">
              {loading ? (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    <RefreshCw className="w-6 h-6 animate-spin mx-auto mb-2 text-cyan-400" />
                    <span>Loading members...</span>
                  </td>
                </tr>
              ) : members.length > 0 ? (
                members.map((m) => (
                  <tr key={m.id} className="hover:bg-[#111a2e]/40 transition-colors">
                    <td className="py-3.5 px-4 font-medium text-slate-200">
                      {m.display_name}
                    </td>
                    <td className="py-3.5 px-4 text-slate-400 font-mono">
                      {m.email}
                    </td>
                    <td className="py-3.5 px-4">
                      <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider border ${roleBadge(m.role)}`}>
                        {m.role}
                      </span>
                    </td>
                    <td className="py-3.5 px-4 text-slate-400">
                      {new Date(m.joined_at).toLocaleDateString()}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={4} className="py-8 text-center text-slate-500">
                    No members found.
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
