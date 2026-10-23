import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { Shield, Lock, AlertCircle, ArrowRight } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setError(err?.response?.data?.detail || 'Invalid email or password');
    } finally {
      setLoading(false);
    }
  };

  const handleQuickFill = (eMail: string) => {
    setEmail(eMail);
    setPassword('DemoPass1');
  };

  return (
    <div className="min-h-screen bg-[#070b14] flex flex-col justify-center items-center p-4">
      <div className="w-full max-w-md p-8 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] shadow-2xl text-slate-200">
        <div className="text-center mb-6">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-cyan-500 to-teal-400 flex items-center justify-center mx-auto mb-3 shadow-lg shadow-cyan-500/20">
            <Shield className="w-7 h-7 text-[#070b14]" />
          </div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Sign In to TrustVault</h1>
          <p className="text-xs text-slate-400 mt-1">
            Zero-knowledge authentication and encrypted session
          </p>
        </div>

        {error && (
          <div className="p-3 mb-5 rounded-xl bg-rose-500/10 border border-rose-500/30 flex items-center gap-2.5 text-xs text-rose-300">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-400" />
            <span>{error}</span>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Email Address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@organization.com"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-slate-300 mb-1.5">
              Account Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••••••"
              className="w-full px-3.5 py-2.5 rounded-xl bg-[#111a2e] border border-[#1e2c4a] focus:border-cyan-500 text-sm text-slate-100 placeholder-slate-500 outline-none transition-colors"
            />
          </div>

          <button
            type="submit"
            disabled={loading || !email || !password}
            className="w-full py-2.5 px-4 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 disabled:opacity-50 text-[#070b14] font-semibold text-sm transition-all flex items-center justify-center gap-2 shadow-md shadow-cyan-500/20"
          >
            {loading ? 'Authenticating with Argon2id...' : 'Sign In'}
          </button>
        </form>

        {/* Demo Quick-Fill */}
        <div className="mt-6 pt-5 border-t border-[#1e2c4a] text-center">
          <p className="text-[11px] text-slate-400 mb-2 font-medium">Quick Demo Credentials:</p>
          <div className="flex flex-wrap justify-center gap-1.5 text-xs">
            {['alice', 'bob', 'carol', 'dave'].map((name) => (
              <button
                key={name}
                type="button"
                onClick={() => handleQuickFill(`${name}@trustvault.demo`)}
                className="px-2.5 py-1 rounded-lg bg-[#111a2e] hover:bg-[#17233d] border border-[#1e2c4a] text-slate-300 hover:text-cyan-400 transition-colors capitalize font-mono text-[11px]"
              >
                {name}
              </button>
            ))}
          </div>
        </div>

        <div className="mt-6 text-center text-xs text-slate-400">
          Need an account?{' '}
          <Link to="/register" className="text-cyan-400 hover:underline font-medium">
            Register your organization
          </Link>
        </div>
      </div>
    </div>
  );
};
