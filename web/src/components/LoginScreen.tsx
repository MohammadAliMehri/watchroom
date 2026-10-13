import React, { useState } from 'react';
import { Film, Lock, Mail, ArrowRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '../hooks/useAuth';

interface LoginScreenProps {
  onNavigateToSignup: () => void;
  onSuccess: () => void;
}

export const LoginScreen: React.FC<LoginScreenProps> = ({ onNavigateToSignup, onSuccess }) => {
  const { login } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ email, password }),
      });

      if (!res.ok) {
        // Spec 9: Show "Email or password is incorrect" on failure.
        setError('Email or password is incorrect');
        return;
      }

      const data = await res.json();
      login(data.user);
      onSuccess();
    } catch {
      setError('Email or password is incorrect');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-[#0b0d12] px-4 py-12">
      <div className="w-full max-w-md flex flex-col items-center">
        {/* Brand header */}
        <div className="flex items-center gap-3 mb-8">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-violet-600 to-cyan-500 flex items-center justify-center text-white shadow-lg shadow-violet-600/30">
            <Film className="w-5 h-5" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-white tracking-tight">WatchRoom</h1>
            <p className="text-xs text-violet-400">Synchronized Watch Parties</p>
          </div>
        </div>

        <Card className="w-full bg-[#131722]/90 border-white/10 backdrop-blur-xl shadow-2xl">
          <CardHeader className="space-y-1 text-center">
            <CardTitle className="text-xl font-bold text-white">Sign In</CardTitle>
            <CardDescription className="text-gray-400 text-xs">
              Enter your credentials to access your rooms
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              {error && (
                <div className="p-3 text-xs bg-red-950/60 border border-red-500/40 text-red-300 rounded-lg animate-in fade-in">
                  {error}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
                  <Mail className="w-3.5 h-3.5 text-violet-400" />
                  <span>Email address</span>
                </label>
                <Input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="bg-[#0b0d12] border-white/10 text-white placeholder:text-gray-600 focus:border-violet-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300 flex items-center gap-1.5">
                  <Lock className="w-3.5 h-3.5 text-violet-400" />
                  <span>Password</span>
                </label>
                <Input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="bg-[#0b0d12] border-white/10 text-white placeholder:text-gray-600 focus:border-violet-500"
                />
              </div>

              <Button
                type="submit"
                disabled={submitting}
                className="w-full bg-violet-600 hover:bg-violet-500 text-white text-xs font-semibold h-10 mt-2 shadow-lg shadow-violet-600/25"
              >
                <span>{submitting ? 'Signing in…' : 'Sign In'}</span>
                <ArrowRight className="w-4 h-4 ml-2" />
              </Button>
            </form>

            <div className="mt-6 text-center text-xs text-gray-400 border-t border-white/5 pt-4">
              Don't have an account?{' '}
              <button
                type="button"
                onClick={onNavigateToSignup}
                className="text-violet-400 hover:text-violet-300 font-medium underline underline-offset-4 ml-1"
              >
                Create account
              </button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
