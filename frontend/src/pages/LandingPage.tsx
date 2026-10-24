import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Shield,
  Lock,
  History,
  Sliders,
  AlertTriangle,
  Key,
  FileCheck,
  CheckCircle2,
  ArrowRight,
  Cpu,
  Database,
  EyeOff,
} from 'lucide-react';

export const LandingPage: React.FC = () => {
  const { user, login } = useAuth();
  const navigate = useNavigate();

  const handleDemoLogin = async (email: string) => {
    try {
      await login(email, 'DemoPass1');
      navigate('/dashboard');
    } catch (err) {
      console.error('Demo login failed', err);
    }
  };

  return (
    <div className="min-h-screen bg-[#070b14] text-slate-100 flex flex-col selection:bg-cyan-500 selection:text-black">
      {/* Top Navigation */}
      <header className="h-20 border-b border-[#1e2c4a]/80 bg-[#070b14]/80 backdrop-blur-md px-6 md:px-12 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-teal-400 flex items-center justify-center shadow-lg shadow-cyan-500/20">
            <Shield className="w-6 h-6 text-[#070b14]" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-xl tracking-tight bg-gradient-to-r from-white via-slate-200 to-cyan-400 bg-clip-text text-transparent">
                TrustVault
              </span>
              <span className="hidden sm:inline-block text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/30">
                Zero Knowledge
              </span>
            </div>
            <div className="text-[11px] text-slate-400">
              Created by <span className="text-cyan-400 font-semibold">Charan Teja Bathini</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-4">
          {user ? (
            <Link
              to="/dashboard"
              className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-[#070b14] font-semibold text-sm transition-all flex items-center gap-2"
            >
              <span>Go to Dashboard</span>
              <ArrowRight className="w-4 h-4" />
            </Link>
          ) : (
            <>
              <Link
                to="/login"
                className="py-2 px-4 rounded-xl text-slate-300 hover:text-white font-medium text-sm transition-colors"
              >
                Sign In
              </Link>
              <Link
                to="/register"
                className="py-2.5 px-5 rounded-xl bg-gradient-to-r from-cyan-500 to-teal-500 hover:from-cyan-400 hover:to-teal-400 text-[#070b14] font-semibold text-sm transition-all shadow-md shadow-cyan-500/20"
              >
                Get Started
              </Link>
            </>
          )}
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative px-6 py-20 md:py-32 flex flex-col items-center text-center max-w-5xl mx-auto">
        <div className="absolute inset-0 -z-10 flex items-center justify-center">
          <div className="w-[600px] h-[350px] bg-gradient-to-tr from-cyan-500/10 via-teal-500/5 to-transparent blur-3xl rounded-full"></div>
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-cyan-950/60 border border-cyan-800/60 text-xs font-semibold text-cyan-400 mb-8 shadow-sm">
          <Shield className="w-3.5 h-3.5" />
          <span>Zero-Knowledge Document Sharing & Cryptographic Audit Trails</span>
        </div>

        <h1 className="text-4xl md:text-6xl lg:text-7xl font-extrabold tracking-tight text-white mb-6 leading-tight">
          Secure Document Sharing With A{' '}
          <span className="bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400 bg-clip-text text-transparent">
            Verifiable Audit Trail
          </span>
        </h1>

        <p className="text-base md:text-xl text-slate-300 max-w-3xl mb-10 leading-relaxed">
          Every document has its own access policy, and every important access decision leaves verifiable evidence. Sealed with client-side AES-256-GCM and tracked by tamper-evident hash chains.
        </p>

        {/* Demo Accounts Quick-Login Box */}
        <div className="w-full max-w-3xl p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] text-left shadow-2xl mb-12">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Key className="w-4 h-4 text-cyan-400" />
              <span className="text-xs font-bold uppercase tracking-wider text-slate-300">
                Instant Local Demo Accounts (Password: DemoPass1)
              </span>
            </div>
            <span className="text-[11px] text-slate-400">Click any user to test:</span>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {[
              { email: 'alice@trustvault.demo', name: 'Alice (Owner)', role: 'Full Control' },
              { email: 'bob@trustvault.demo', name: 'Bob (Member)', role: 'Grantee' },
              { email: 'carol@trustvault.demo', name: 'Carol (Admin)', role: 'Simulator' },
              { email: 'dave@trustvault.demo', name: 'Dave (Auditor)', role: 'Audit Verifier' },
            ].map((u) => (
              <button
                key={u.email}
                onClick={() => handleDemoLogin(u.email)}
                className="p-3 rounded-xl bg-[#111a2e] hover:bg-[#17233d] border border-[#1e2c4a] hover:border-cyan-500/50 text-left transition-all group"
              >
                <div className="font-semibold text-xs text-white group-hover:text-cyan-300 transition-colors">
                  {u.name}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">{u.role}</div>
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Core Principles Grid */}
      <section className="px-6 py-16 bg-[#0a0f1d] border-y border-[#1e2c4a]/60">
        <div className="max-w-6xl mx-auto">
          <div className="text-center mb-16">
            <h2 className="text-2xl md:text-4xl font-bold text-white mb-3">
              Built For Zero-Trust Document Workflows
            </h2>
            <p className="text-slate-400 text-sm max-w-xl mx-auto">
              Eliminating the blind spots of cloud storage with client-side cryptography and mathematical verification.
            </p>
          </div>

          <div className="grid md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] hover:border-cyan-500/30 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
                <Lock className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Browser-Side Encryption</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Files are sealed with random AES-256-GCM keys via Web Crypto API before leaving your machine. The server only stores ciphertext and encrypted key envelopes.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] hover:border-teal-500/30 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-teal-500/10 border border-teal-500/30 flex items-center justify-center text-teal-400">
                <History className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Tamper-Evident Hash Chain</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Every upload, grant, access attempt, and denial forms a SHA-256 hash chain with cryptographic sequencing. Altered or deleted records immediately fail verification.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] hover:border-emerald-500/30 transition-all space-y-3">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400">
                <Sliders className="w-5 h-5" />
              </div>
              <h3 className="font-bold text-base text-white">Access Policy Simulator</h3>
              <p className="text-xs text-slate-400 leading-relaxed">
                Interactively evaluate access decisions before sharing. Test membership, permission levels, expiration timestamps, and revocation rules with deterministic checks.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Cryptographic Architecture Summary */}
      <section className="px-6 py-20 max-w-5xl mx-auto space-y-8">
        <div className="text-center">
          <h2 className="text-2xl md:text-3xl font-bold text-white mb-2">
            The TrustVault Security Model
          </h2>
          <p className="text-xs text-slate-400">
            Real cryptographic guarantees without false claims.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-6">
          <div className="p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] space-y-4">
            <h3 className="text-sm font-bold text-cyan-300 flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-cyan-400" />
              <span>What We Cryptographically Guarantee</span>
            </h3>
            <ul className="text-xs text-slate-300 space-y-2.5">
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">•</span>
                <span>The server never receives your plaintext documents or master passphrase.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">•</span>
                <span>Each recipient receives their own RSA-wrapped document key envelope.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">•</span>
                <span>Audit events are cryptographically chained to detect deletions and tampering.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-cyan-400 font-bold">•</span>
                <span>Organizations are isolated with strict server-side scoping.</span>
              </li>
            </ul>
          </div>

          <div className="p-6 rounded-2xl bg-[#0d1322] border border-[#1e2c4a] space-y-4">
            <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-400" />
              <span>Honest Security Limitations Acknowledged</span>
            </h3>
            <ul className="text-xs text-slate-300 space-y-2.5">
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>Revocation blocks future access; it cannot un-download or erase already saved files.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>Hash chains are tamper-evident, not immune to DB admins recomputing full chains.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>Serving content does not prove a human read or understood the document.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="text-amber-400 font-bold">•</span>
                <span>Losing your vault passphrase means your private key cannot be decrypted.</span>
              </li>
            </ul>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-[#1e2c4a]/80 py-8 px-6 text-center text-xs text-slate-400">
        <p className="font-medium text-slate-300">
          TrustVault — Zero-Knowledge Secure Document Sharing with Verifiable Audit Trail.
        </p>
        <p className="mt-2 text-xs">
          Created by <span className="text-cyan-400 font-bold tracking-wide">Charan Teja Bathini</span>
        </p>
      </footer>
    </div>
  );
};
