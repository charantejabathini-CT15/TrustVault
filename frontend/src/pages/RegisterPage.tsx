import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, AlertCircle, CheckCircle2 } from 'lucide-react';

export const RegisterPage: React.FC = () => {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [orgName, setOrgName] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // Password requirements check
  const hasMinLength = password.length >= 8;
  const hasUpper = /[A-Z]/.test(password);
  const hasLower = /[a-z]/.test(password);
  const hasDigit = /\d/.test(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!hasMinLength || !hasUpper || !hasLower || !hasDigit) {
      setError('Please satisfy all password complexity requirements.');
      return;
    }

    setError('');
    setLoading(true);

    try {
      await register(email, password, displayName, orgName);
      navigate('/dashboard');
    } catch (err: any) {
      const detail = err?.response?.data?.detail;
      if (typeof detail === 'string') {
        setError(detail);
      } else if (Array.isArray(detail)) {
        setError(detail.map((d: any) => d.msg || JSON.stringify(d)).join(', '));
      } else {
        setError(err?.message || 'Registration failed. Email may already be in use.');
      }
    } finally {
      setLoading(false);
    }
  };

  const isDuplicateEmail = error.toLowerCase().includes('already registered') || error.toLowerCase().includes('already in use');

  return (
    <div className="min-h-screen bg-[#070b14] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] shadow-2xl text-slate-200">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-teal-400 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-cyan-500/20">
            <Shield className="w-7 h-7 text-[#070b14]" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Create Organization</h1>
          <p className="text-xs text-slate-400 mt-1">
            Register your workspace as an Organization Owner
          </p>
        </div>

        {error && (
          <div className="p-3 mb-5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-xs text-rose-300 space-y-1.5">
            <div className="flex items-center gap-2.5">
              <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
              <span>{error}</span>
            </div>
            {isDuplicateEmail && (
              <div className="pl-6">
                <Link to="/login" className="text-cyan-400 hover:underline font-semibold flex items-center gap-1">
                  Click here to sign in with this email &rarr;
                </Link>
              </div>
            )}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Organization Name
            </label>
            <input
              type="text"
              required
              value={orgName}
              onChange={(e) => setOrgName(e.target.value)}
              placeholder="e.g. Acme Cyber Defense Inc."
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Your Full Name
            </label>
            <input
              type="text"
              required
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="Alice Johnson"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Work Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="alice@acmedefense.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1">
              Account Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Min 8 chars, 1 uppercase, 1 digit"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          {/* Password complexity indicators */}
          <div className="grid grid-cols-2 gap-1.5 p-3 rounded-xl bg-[#111a2e] border border-[#1e2c4a] text-[11px]">
            <div className={`flex items-center gap-1.5 ${hasMinLength ? 'text-emerald-400' : 'text-slate-500'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>8+ characters</span>
            </div>
            <div className={`flex items-center gap-1.5 ${hasUpper ? 'text-emerald-400' : 'text-slate-500'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Uppercase letter</span>
            </div>
            <div className={`flex items-center gap-1.5 ${hasLower ? 'text-emerald-400' : 'text-slate-500'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Lowercase letter</span>
            </div>
            <div className={`flex items-center gap-1.5 ${hasDigit ? 'text-emerald-400' : 'text-slate-500'}`}>
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Numeric digit</span>
            </div>
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password || !orgName || !displayName}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-50 text-[#070b14] font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-cyan-500/20 pt-3"
          >
            {loading ? 'Creating Organization...' : 'Register Workspace'}
          </button>
        </form>

        <div className="mt-6 text-center text-xs text-slate-400">
          Already registered?{' '}
          <Link to="/login" className="text-cyan-400 hover:underline font-medium">
            Sign in here
          </Link>
        </div>
      </div>
    </div>
  );
};
