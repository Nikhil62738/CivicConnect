import React, { useState, useEffect } from 'react';
import { maharashtraDistricts } from './constants';

export default function UserProfile({ user, onClose, onUpdate }) {
  const [formData, setFormData] = useState({
    name: user?.name || '',
    email: user?.email || '',
    phone: user?.phone || '',
    password: '',
    otp: ''
  });

  const [stats, setStats] = useState({ total: 0, resolved: 0 });
  const [currentUser, setCurrentUser] = useState(user);
  const [loading, setLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [otpSent, setOtpSent] = useState(false);
  const [message, setMessage] = useState(null);
  const [error, setError] = useState(null);

  const categories = ['pothole', 'garbage', 'water', 'streetlight', 'flood', 'fire', 'other'];
  const categoryLabels = {
    pothole: 'Potholes',
    garbage: 'Garbage collection',
    water: 'Water leakage',
    streetlight: 'Streetlight not working',
    flood: 'Flood',
    fire: 'Fire',
    other: 'Other'
  };

  const fetchStats = async () => {
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/user/profile', {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (data.user) setCurrentUser(data.user);
      if (data.stats) setStats(data.stats);
    } catch (e) { }
  };

  useEffect(() => {
    fetchStats();
  }, [user]);

  const sendOtp = async () => {
    setLoading(true);
    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/auth/profile-otp', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });
      const data = await res.json();
      if (res.ok) {
        setOtpSent(true);
        setMessage(data.message);
      } else {
        setError(data.error);
      }
    } catch (e) {
      setError("Failed to connect to server");
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (formData.password.trim() && !otpSent) {
      setError("Please verify with OTP first");
      return;
    }

    setLoading(true);
    setMessage(null);
    setError(null);

    const updatePayload = {
      name: formData.name,
      email: formData.email,
      phone: formData.phone
    };

    if (formData.password.trim()) {
      updatePayload.password = formData.password;
      updatePayload.otp = formData.otp;
    }

    try {
      const token = localStorage.getItem('token');
      const res = await fetch('http://localhost:5000/api/auth/profile', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify(updatePayload)
      });

      const data = await res.json();
      if (res.ok) {
        setMessage('Profile updated successfully!');
        const updated = { ...currentUser, ...data.user };
        setCurrentUser(updated);
        if (onUpdate) onUpdate(updated);
        localStorage.setItem('user', JSON.stringify(updated));
        setFormData(prev => ({ ...prev, password: '', otp: '' }));
        setOtpSent(false);
      } else {
        setError(data.error || 'Failed to update profile');
      }
    } catch (err) {
      setError('Could not connect to server');
    } finally {
      setLoading(false);
    }
  };

  const handleAccountDelete = async () => {
    const email = currentUser?.email || formData.email;
    const confirmText = `Delete your account${email ? ` (${email})` : ''}? This will permanently remove your profile and reports.`;
    if (!window.confirm(confirmText)) return;

    setDeleteLoading(true);
    setError(null);
    setMessage(null);

    try {
      const token = localStorage.getItem('token');
      if (!token) throw new Error('Please login again.');

      const res = await fetch('http://localhost:5000/api/auth/account', {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Account deletion failed');

      localStorage.removeItem('token');
      localStorage.removeItem('user');
      localStorage.removeItem('loginType');

      if (onClose) onClose();
      window.location.reload();
    } catch (err) {
      setError(err.message || 'Account deletion failed');
    } finally {
      setDeleteLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-slate-900/80 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="glass-card p-10 max-w-xl w-full relative animate-in zoom-in-95 duration-200 shadow-2xl overflow-y-auto max-h-[90vh]">
        <button onClick={onClose} className="absolute top-4 right-4 text-slate-400 hover:text-white bg-slate-800 p-2 rounded-full transition-colors z-10 w-8 h-8 flex items-center justify-center">✕</button>

        <div className="flex items-center gap-5 mb-8">
          <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-primary to-indigo-400 flex items-center justify-center text-3xl font-black shadow-lg text-white group relative overflow-hidden">
            <span className="z-10">{currentUser?.name?.charAt(0) || 'C'}</span>
            <div className="absolute inset-x-0 bottom-0 bg-black/40 text-[9px] text-center font-black uppercase py-0.5 tracking-tighter">LVL {Math.floor((currentUser?.points || 0) / 100) + 1}</div>
          </div>
          <div className="flex-1">
            <h2 className="text-2xl font-black text-white leading-none mb-2">{currentUser?.name}</h2>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-primary text-[8px] uppercase font-black tracking-widest bg-primary/10 px-2 py-1 rounded border border-primary/20">{currentUser?.role}</span>
              <span className="text-amber-400 text-[8px] uppercase font-black tracking-widest bg-amber-400/10 px-2 py-1 rounded border border-amber-400/20">{currentUser?.points || 0} Points</span>
              <span className="text-emerald-400 text-[8px] uppercase font-black tracking-widest bg-emerald-400/10 px-2 py-1 rounded border border-emerald-400/20">🏅 {currentUser?.badge || 'Newcomer'}</span>
            </div>
          </div>
        </div>

        {/* Contribution Summary */}
        <div className="grid grid-cols-2 gap-4 mb-8">
          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 flex flex-col items-center">
            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Total Reports</span>
            <span className="text-2xl font-black text-white">{stats.total}</span>
          </div>
          <div className="bg-slate-900/50 p-4 rounded-xl border border-slate-700/50 flex flex-col items-center">
            <span className="text-[10px] text-slate-500 font-black uppercase tracking-widest mb-1">Resolved</span>
            <span className="text-2xl font-black text-emerald-400">{stats.resolved}</span>
          </div>
        </div>

        {message && <div className="mb-4 bg-emerald-500/20 text-emerald-400 p-3 rounded-lg text-sm font-semibold border border-emerald-500/30">{message}</div>}
        {error && <div className="mb-4 bg-red-500/20 text-red-400 p-3 rounded-lg text-sm font-semibold border border-red-500/30">{error}</div>}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Full Name</label>
            <input
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary transition-colors focus:ring-1 focus:ring-primary"
              type="text"
              value={formData.name}
              onChange={e => setFormData({ ...formData, name: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Email Address</label>
            <input
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary transition-colors focus:ring-1 focus:ring-primary"
              type="email"
              value={formData.email}
              onChange={e => setFormData({ ...formData, email: e.target.value })}
              required
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">Mobile Number</label>
            <input
              className="w-full px-4 py-2.5 bg-slate-900 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary transition-colors focus:ring-1 focus:ring-primary"
              type="tel"
              value={formData.phone}
              onChange={e => setFormData({ ...formData, phone: e.target.value })}
            />
          </div>

          <div className="pt-2">
            <label className="block text-xs font-bold text-slate-400 uppercase tracking-widest mb-1.5">New Password <span className="text-[10px] text-slate-500 normal-case ml-1">(Requires Verification)</span></label>
            <div className="flex gap-2">
              <input
                className="flex-1 px-4 py-2.5 bg-slate-900 border border-slate-700/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-primary transition-colors focus:ring-1 focus:ring-primary"
                type="password"
                placeholder="Enter new password"
                value={formData.password}
                onChange={e => setFormData({ ...formData, password: e.target.value })}
              />
              {!otpSent && formData.password.trim() && (
                <button type="button" onClick={sendOtp} className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-[10px] font-black uppercase tracking-widest rounded-lg text-white">Send OTP</button>
              )}
            </div>
          </div>

          {otpSent && (
            <div className="animate-in slide-in-from-top-2">
              <label className="block text-[10px] font-black text-indigo-400 uppercase tracking-widest mb-1.5">Mail Verification Code</label>
              <input
                className="w-full px-4 py-2.5 bg-indigo-500/10 border border-indigo-500/30 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition-all font-mono tracking-[1em] text-center"
                type="text"
                maxLength="6"
                placeholder="000000"
                value={formData.otp}
                onChange={e => setFormData({ ...formData, otp: e.target.value })}
              />
              <p className="text-[10px] text-slate-500 mt-2 text-center italic">A 6-digit code has been sent to your primary email address.</p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className={`btn w-full mt-4 py-3 bg-primary hover:bg-indigo-500 text-white font-bold rounded-lg shadow-lg hover:shadow-primary/30 transition-all ${loading ? 'opacity-70 cursor-not-allowed' : 'active:scale-95'}`}
          >
            {loading ? 'Processing...' : (formData.password.trim() ? 'Verify & Update' : 'Update Profile')}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-slate-700/50">
          <button
            type="button"
            onClick={handleAccountDelete}
            disabled={deleteLoading || loading}
            className={`w-full px-4 py-3 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${deleteLoading || loading
                ? 'opacity-60 cursor-not-allowed bg-red-500/10 text-red-400 border border-red-500/30'
                : 'bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/30'
              }`}
          >
            {deleteLoading ? 'Deleting...' : 'Delete Account'}
          </button>
          <p className="text-[10px] text-slate-500 mt-2 text-center">
            Permanent action. Use with care.
          </p>
        </div>
      </div>
    </div>
  );
}
