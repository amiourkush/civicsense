import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Shield, Eye, EyeOff, AlertCircle, Server } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isMockMode, API_BASE_URL } from '../lib/api';

export function LoginPage() {
  const { login, isLoading, error } = useAuth();
  const navigate = useNavigate();

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPwd, setShowPwd] = useState(false);
  const [localError, setLocalError] = useState('');

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLocalError('');
    try {
      await login(email, password);
      navigate('/dashboard');
    } catch (err: any) {
      setLocalError(err?.message || 'Login failed. Please check credentials or backend connection.');
    }
  }

  function fillDemo(userEmail: string, pwd: string) {
    setEmail(userEmail);
    setPassword(pwd);
  }

  const displayError = localError || error;

  return (
    <div className="min-h-screen bg-gradient-to-br from-govblue-950 via-govblue-900 to-govblue-800 flex items-center justify-center p-4">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -left-40 w-96 h-96 bg-govblue-700/20 rounded-full blur-3xl" />
        <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-govblue-600/20 rounded-full blur-3xl" />
      </div>

      <div className="relative w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-govblue-600 shadow-lg shadow-govblue-900/50 mb-4">
            <Shield size={32} className="text-white" />
          </div>
          <h1 className="text-3xl font-bold text-white tracking-tight">CivicSense</h1>
          <p className="text-govblue-300 mt-1 text-sm">Civic Complaint Administration Portal</p>
        </div>

        {/* Login card */}
        <div className="bg-white rounded-2xl shadow-2xl shadow-black/30 p-8">
          <h2 className="text-lg font-semibold text-slate-800 mb-1">Sign in to your account</h2>
          <p className="text-sm text-slate-500 mb-6">Enter your credentials to access the admin portal.</p>

          {displayError && (
            <div className="flex items-start gap-2 bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm text-red-700">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

          {/* Mode Indicator */}
          <div className="mb-4 flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 text-xs">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <span className={`w-2 h-2 rounded-full ${isMockMode ? 'bg-purple-500' : 'bg-emerald-500 animate-pulse'}`} />
              Mode: <strong className="text-slate-800">{isMockMode ? 'Mock Simulator' : 'Live Spring Boot'}</strong>
            </span>
            <span className="font-mono text-[11px] text-slate-400">
              {isMockMode ? 'In-Memory DB' : API_BASE_URL}
            </span>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label htmlFor="login-email" className="block text-sm font-medium text-slate-700 mb-1">
                Email address
              </label>
              <input
                id="login-email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder={isMockMode ? 'you@civicsense.gov' : 'admin@example.com'}
                className="w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-govblue-500 focus:border-govblue-500 transition-colors"
              />
            </div>

            <div>
              <label htmlFor="login-password" className="block text-sm font-medium text-slate-700 mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  id="login-password"
                  type={showPwd ? 'text' : 'password'}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full rounded-lg border border-slate-300 px-3 py-2.5 pr-10 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-govblue-500 focus:border-govblue-500 transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPwd(!showPwd)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                >
                  {showPwd ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full bg-govblue-600 hover:bg-govblue-700 text-white font-medium py-2.5 rounded-lg text-sm transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {isLoading ? (
                <>
                  <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : (
                'Sign in'
              )}
            </button>
          </form>

          {/* Quick Fill Credentials */}
          <div className="mt-6 pt-5 border-t border-slate-100">
            <p className="text-xs font-medium text-slate-500 mb-3 uppercase tracking-wide">
              {isMockMode ? 'Demo accounts' : 'Backend accounts (API Contract)'}
            </p>
            <div className="space-y-2">
              {(isMockMode
                ? [
                    { label: 'Super Admin', email: 'priya.sharma@civicsense.gov', pwd: 'admin123' },
                    { label: 'Dept Officer (Sanitation)', email: 'rahul.mehta@civicsense.gov', pwd: 'officer123' },
                    { label: 'Field Agent', email: 'suresh.kumar@civicsense.gov', pwd: 'agent123' },
                  ]
                : [
                    { label: 'Administrator (Spring Boot)', email: 'admin@example.com', pwd: 'password' },
                    { label: 'Field Worker (Spring Boot)', email: 'worker@example.com', pwd: 'password' },
                  ]
              ).map((demo) => (
                <button
                  key={demo.email}
                  type="button"
                  onClick={() => fillDemo(demo.email, demo.pwd)}
                  className="w-full flex items-center justify-between px-3 py-2 rounded-lg bg-slate-50 hover:bg-govblue-50 border border-slate-200 hover:border-govblue-200 transition-colors text-left group"
                >
                  <div>
                    <div className="text-xs font-semibold text-slate-700 group-hover:text-govblue-700">{demo.label}</div>
                    <div className="text-xs text-slate-400">{demo.email}</div>
                  </div>
                  <span className="text-xs text-govblue-600 font-medium opacity-0 group-hover:opacity-100 transition-opacity">
                    Use →
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>

        <p className="text-center text-xs text-govblue-400 mt-6">
          © 2026 CivicSense · Government Demo Platform
        </p>
      </div>
    </div>
  );
}
