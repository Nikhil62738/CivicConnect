import React, { useState } from 'react';

export default function Register({ onRegister, onSwitchToLogin }) {
  const [formData, setFormData] = useState({ name: '', email: '', phone: '', password: '' });
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });

      const data = await response.json();

      if (response.ok) {
        onRegister(data.user, data.token);
        localStorage.setItem('token', data.token);
        localStorage.setItem('user', JSON.stringify(data.user));
      } else {
        setError(data.error || 'Registration failed.');
      }
    } catch (err) {
      setError('Cannot connect to the backend server.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center py-12 px-6 relative">
      <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary/20 blur-[120px] pointer-events-none"></div>

      <form onSubmit={submit} className="glass-card p-10 max-w-sm w-full flex flex-col gap-4 z-10 animate-in slide-in-from-left-8">
        <h2 className="text-3xl font-black text-center mb-0 bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">Reclaim Your City</h2>
        <p className="text-xs text-center text-slate-400 mb-2">We require your contact info for real-time notifications</p>

        {error && <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm font-semibold">{error}</div>}

        <div>
          <label className="block text-sm text-slate-400 mb-1">Full Name</label>
          <input
            className="input-field"
            type="text"
            placeholder="John Doe"
            required
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Email <span className="text-[10px] text-primary ml-1">(Required for updates)</span></label>
          <input
            className="input-field"
            type="email"
            placeholder="citizen@city.com"
            required
            value={formData.email}
            onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Mobile Number <span className="text-[10px] text-primary ml-1" max-length="10" >(For SMS Alerts) </span></label>
          <input
            className="input-field"
            type="tel"
            placeholder="+1 234 567 8900"
            required
            value={formData.phone}
            onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
          />
        </div>

        <div>
          <label className="block text-sm text-slate-400 mb-1">Password</label>
          <input
            className="input-field"
            type="password"
            placeholder="••••••••"
            required
            value={formData.password}
            onChange={(e) => setFormData({ ...formData, password: e.target.value })}
          />
        </div>

        <button disabled={loading} className={`btn mt-4 py-3 text-lg ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}>
          {loading ? 'Creating Account...' : 'Create Account'}
        </button>

        <p className="text-sm text-center text-slate-400 mt-2">
          Already joined? <button type="button" onClick={onSwitchToLogin} className="text-primary hover:text-indigo-400 font-bold">Login</button>
        </p>
      </form>
    </div>
  );
}
