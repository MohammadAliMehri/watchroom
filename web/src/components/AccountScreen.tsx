import React, { useState } from 'react';
import { User, Lock, Trash2, LogOut, Check, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '../hooks/useAuth';

export const AccountScreen: React.FC = () => {
  const { user, logout, refreshUser } = useAuth();

  // Display Name Update State
  const [displayName, setDisplayName] = useState(user?.displayName || '');
  const [nameSuccess, setNameSuccess] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [savingName, setSavingName] = useState(false);

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [savingPassword, setSavingPassword] = useState(false);

  // Delete Account State
  const [deletePassword, setDeletePassword] = useState('');
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    setNameError(null);
    setNameSuccess(false);

    if (displayName.trim().length < 2 || displayName.trim().length > 30) {
      setNameError('Display name must be between 2 and 30 characters.');
      return;
    }

    setSavingName(true);
    try {
      const res = await fetch('/api/account', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ displayName: displayName.trim() }),
      });

      if (!res.ok) {
        const data = await res.json();
        setNameError(data.error || 'Failed to update display name.');
        return;
      }

      await refreshUser();
      setNameSuccess(true);
      setTimeout(() => setNameSuccess(false), 3000);
    } catch {
      setNameError('Failed to update display name.');
    } finally {
      setSavingName(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(false);

    if (newPassword.length < 8) {
      setPasswordError('New password must be at least 8 characters.');
      return;
    }

    setSavingPassword(true);
    try {
      const res = await fetch('/api/account/password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ currentPassword, newPassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        setPasswordError(data.error || 'Failed to update password.');
        return;
      }

      setPasswordSuccess(true);
      setCurrentPassword('');
      setNewPassword('');
      setTimeout(() => setPasswordSuccess(false), 3000);
    } catch {
      setPasswordError('Failed to update password.');
    } finally {
      setSavingPassword(false);
    }
  };

  const handleDeleteAccount = async () => {
    if (!deletePassword) {
      setDeleteError('Please enter your password to confirm account deletion.');
      return;
    }

    setDeleting(true);
    setDeleteError(null);
    try {
      const res = await fetch('/api/account', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'same-origin',
        body: JSON.stringify({ password: deletePassword }),
      });

      if (!res.ok) {
        const data = await res.json();
        setDeleteError(data.error || 'Failed to delete account.');
        setDeleting(false);
        return;
      }

      await logout();
    } catch {
      setDeleteError('Failed to delete account.');
      setDeleting(false);
    }
  };

  return (
    <div className="w-full max-w-4xl mx-auto space-y-8 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
        <div>
          <h1 className="text-2xl font-bold text-white tracking-tight">Account Settings</h1>
          <p className="text-xs text-gray-400 mt-1">Manage your identity, security, and preferences</p>
        </div>
        <Button
          onClick={() => logout()}
          variant="secondary"
          size="sm"
          className="bg-white/5 border border-white/10 text-gray-300 hover:bg-white/10 hover:text-white"
        >
          <LogOut className="w-4 h-4 mr-2" />
          <span>Sign Out</span>
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Profile Card */}
        <Card className="bg-[#131722]/80 border-white/10">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <User className="w-4 h-4 text-violet-400" />
              <span>Profile Information</span>
            </CardTitle>
            <CardDescription className="text-xs text-gray-400">
              Update how your name appears in rooms and chat
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleUpdateName} className="space-y-4">
              {nameSuccess && (
                <div className="p-3 text-xs bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 rounded-lg flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Display name updated successfully!</span>
                </div>
              )}
              {nameError && (
                <div className="p-3 text-xs bg-red-950/60 border border-red-500/40 text-red-300 rounded-lg">
                  {nameError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-400">Email Address</label>
                <Input
                  disabled
                  value={user?.email || ''}
                  className="bg-[#0b0d12]/50 border-white/5 text-gray-400 cursor-not-allowed"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300">Display Name</label>
                <Input
                  value={displayName}
                  onChange={(e) => setDisplayName(e.target.value)}
                  className="bg-[#0b0d12] border-white/10 text-white focus:border-violet-500"
                />
              </div>

              <Button
                type="submit"
                disabled={savingName}
                size="sm"
                className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium"
              >
                {savingName ? 'Saving…' : 'Save Changes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Password Card */}
        <Card className="bg-[#131722]/80 border-white/10">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-white flex items-center gap-2">
              <Lock className="w-4 h-4 text-violet-400" />
              <span>Security & Password</span>
            </CardTitle>
            <CardDescription className="text-xs text-gray-400">
              Updating your password logs out all other devices
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleChangePassword} className="space-y-4">
              {passwordSuccess && (
                <div className="p-3 text-xs bg-emerald-950/60 border border-emerald-500/40 text-emerald-300 rounded-lg flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>Password changed successfully!</span>
                </div>
              )}
              {passwordError && (
                <div className="p-3 text-xs bg-red-950/60 border border-red-500/40 text-red-300 rounded-lg">
                  {passwordError}
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300">Current Password</label>
                <Input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="bg-[#0b0d12] border-white/10 text-white focus:border-violet-500"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-300">New Password</label>
                <Input
                  type="password"
                  required
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="bg-[#0b0d12] border-white/10 text-white focus:border-violet-500"
                />
                <p className="text-[11px] text-gray-500">At least 8 characters</p>
              </div>

              <Button
                type="submit"
                disabled={savingPassword}
                size="sm"
                className="bg-violet-600 hover:bg-violet-500 text-white text-xs font-medium"
              >
                {savingPassword ? 'Updating…' : 'Update Password'}
              </Button>
            </form>
          </CardContent>
        </Card>
      </div>

      {/* Danger Zone: Delete Account */}
      <Card className="bg-red-950/20 border-red-900/30">
        <CardHeader>
          <CardTitle className="text-base font-semibold text-red-400 flex items-center gap-2">
            <Trash2 className="w-4 h-4 text-red-400" />
            <span>Delete Account</span>
          </CardTitle>
          <CardDescription className="text-xs text-gray-400">
            Permanently delete your account, owned rooms, playlists, and message history. This cannot be undone.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {deleteError && (
            <div className="p-3 text-xs bg-red-950/80 border border-red-500/50 text-red-300 rounded-lg">
              {deleteError}
            </div>
          )}

          {!isConfirmingDelete ? (
            <Button
              onClick={() => setIsConfirmingDelete(true)}
              variant="destructive"
              size="sm"
              className="bg-red-600/80 hover:bg-red-600 text-white text-xs font-semibold"
            >
              <Trash2 className="w-4 h-4 mr-2" />
              <span>Delete My Account</span>
            </Button>
          ) : (
            <div className="p-4 rounded-xl border border-red-500/50 bg-red-950/40 space-y-4 animate-in fade-in">
              <div className="flex items-center gap-2 text-xs font-semibold text-red-300">
                <AlertTriangle className="w-4 h-4 text-red-400 shrink-0" />
                <span>Confirm Account Deletion</span>
              </div>
              <p className="text-xs text-gray-300">
                To proceed, enter your current password below to permanently erase your profile and rooms.
              </p>
              <Input
                type="password"
                placeholder="Enter your password to confirm"
                value={deletePassword}
                onChange={(e) => setDeletePassword(e.target.value)}
                className="bg-[#0b0d12] border-red-500/50 text-white placeholder:text-gray-600 focus:border-red-400 max-w-sm"
              />
              <div className="flex items-center gap-3">
                <Button
                  onClick={handleDeleteAccount}
                  disabled={deleting}
                  variant="destructive"
                  size="sm"
                  className="bg-red-600 hover:bg-red-500 text-white text-xs font-semibold"
                >
                  {deleting ? 'Deleting…' : 'I Understand, Delete Everything'}
                </Button>
                <Button
                  onClick={() => {
                    setIsConfirmingDelete(false);
                    setDeletePassword('');
                    setDeleteError(null);
                  }}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-white text-xs"
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
