import React, { useState } from 'react';

export default function Login({ onLogin, onSwitchToRegister }) {
    const [mode, setMode] = useState('user'); // 'user' | 'admin'
    const [loginFlow, setLoginFlow] = useState('password');
    const [step, setStep] = useState('credentials'); // 'credentials' | 'otp-verify'

    const [formData, setFormData] = useState({ email: '', password: '' });
    const [otpEmail, setOtpEmail] = useState('');
    const [otp, setOtp] = useState('');

    const [error, setError] = useState('');
    const [info, setInfo] = useState('');
    const [loading, setLoading] = useState(false);

    // ─── Password Login ───────────────────────────────────────────────────────
    const submitPassword = async (e) => {
        e.preventDefault();
        setError('');
        setInfo('');
        setLoading(true);

        // EXTRA SECURITY: Hard-filter Gov portal to only allow the official Master ID
        if (mode === 'admin' && formData.email !== 'gov@city.org') {
            setError('Invalid Credentials');
            setLoading(false);
            return;
        }

        try {
            const res = await fetch('http://localhost:5000/api/auth/login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email: formData.email, password: formData.password })
            });
            const data = await res.json();
            if (res.ok) {
                // Ensure if they logged in through Gov mode, they actually ARE an admin
                if (mode === 'admin' && data.user.role !== 'admin') {
                   setError('Invalid Credentials');
                   setLoading(false);
                   return;
                }
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                localStorage.setItem('loginType', data.user.role);
                onLogin(data.user, data.token, data.user.role);
            } else {
                setError(data.error || 'Invalid Credentials');
            }
        } catch {
            setError('Cannot connect to the backend server.');
        } finally {
            setLoading(false);
        }
    };

    // ─── Request Simple OTP (6-digits) ───────────────────────────────────────
    const requestOtp = async (e) => {
        if (e) e.preventDefault();
        setError('');
        setInfo('');
        setLoading(true);

        try {
            const res = await fetch('http://localhost:5000/api/auth/send-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: otpEmail })
            });

            const data = await res.json();
            if (res.ok) {
                setInfo(data.message || `OTP sent successfully!`);
                setStep('otp-verify');
            } else {
                setError(data.error || 'Failed to send code.');
            }
        } catch (err) {
            setError('Connection error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    // ─── Verify Simple OTP (6-digits) ────────────────────────────────────────
    const verifyOtp = async (e) => {
        e.preventDefault();
        setError('');
        setLoading(true);
        try {
            const res = await fetch('http://localhost:5000/api/auth/verify-otp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ identifier: otpEmail, otp })
            });
            const data = await res.json();
            if (res.ok) {
                localStorage.setItem('token', data.token);
                localStorage.setItem('user', JSON.stringify(data.user));
                onLogin(data.user, data.token, 'user');
            } else {
                setError(data.error || 'Invalid or expired OTP.');
            }
        } catch (err) {
            setError('Connection error: ' + err.message);
        } finally {
            setLoading(false);
        }
    };

    const reset = () => {
        setStep('credentials');
        setOtp('');
        setError('');
        setInfo('');
    };

    // ─── OTP Verify Screen (shared by both flows) ─────────────────────────────
    if (step === 'otp-verify') {
        const displayEmail = loginFlow === 'otp' ? otpEmail : formData.email;
        const isFirebaseFlow = loginFlow === 'otp';

        return (
            <div className="min-h-screen flex items-center justify-center py-12 px-6 relative">
                <div className="absolute top-[-10%] right-[-10%] w-[40%] h-[40%] rounded-full bg-secondary/20 blur-[120px] pointer-events-none"></div>

                <div className="glass-card p-10 max-w-sm w-full flex flex-col gap-4 z-10 animate-in slide-in-from-right-8">
                    {/* Icon */}
                    <div className={`w-16 h-16 rounded-2xl ${isFirebaseFlow ? 'bg-indigo-500/20 border-indigo-500/30' : 'bg-primary/20 border-primary/30'} border flex items-center justify-center mx-auto mb-1`}>
                        {isFirebaseFlow ? (
                            <svg className="w-8 h-8 text-indigo-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                            </svg>
                        ) : (
                            <svg className="w-8 h-8 text-primary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 11c0 3.517-1.009 6.799-2.753 9.571m-3.44-2.132A10.503 10.503 0 003.512 11M4 11c0-1.879.351-3.676.993-5.332m3.01 10.457A10.502 10.502 0 0112 18.5c.873 0 1.716-.106 2.52-.303m2.264-1.127A10.502 10.502 0 0018.488 11M19 11c0-1.879-.351-3.676-.993-5.332m-3.01 10.457A10.502 10.502 0 0112 3.5c-.873 0-1.716.106-2.52.303" />
                            </svg>
                        )}
                    </div>

                    <h2 className="text-2xl font-black text-center bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
                        {isFirebaseFlow ? 'Check Your Email' : 'Enter OTP'}
                    </h2>
                    <p className="text-xs text-center text-slate-400">
                        {isFirebaseFlow 
                            ? "We've sent a secure login link to:" 
                            : "A 6-digit code was sent to:"}<br />
                        <span className="text-white font-bold">{displayEmail}</span>
                    </p>

                    {info && (
                        <div className="bg-indigo-500/20 text-indigo-300 p-3 rounded-lg text-sm font-semibold border border-indigo-500/30 flex items-start gap-2">
                            <span>📨</span>
                            <span>{info}</span>
                        </div>
                    )}
                    {error && (
                        <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm font-semibold border border-red-500/30">
                            ⚠️ {error}
                        </div>
                    )}

                    <form onSubmit={verifyOtp} className="flex flex-col gap-4">
                        <div>
                            <label className="block text-sm text-slate-400 mb-2 text-center">Enter 6-Digit Code</label>
                            <input
                                className="input-field text-center text-3xl tracking-[0.6em] font-mono"
                                type="text"
                                placeholder="000000"
                                maxLength={6}
                                required
                                autoFocus
                                value={otp}
                                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                            />
                        </div>

                        <button
                            disabled={loading || otp.length < 6}
                            className={`btn mt-1 py-3 text-lg flex items-center justify-center gap-2 ${(loading || otp.length < 6) ? 'opacity-60 cursor-not-allowed' : ''}`}
                        >
                            {loading ? (
                                <><svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Verifying...</>
                            ) : 'Verify & Sign In →'}
                        </button>

                        <button 
                            type="button"
                            onClick={requestOtp}
                            disabled={loading}
                            className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors font-semibold mx-auto"
                        >
                            Didn't get it? Resend Code
                        </button>
                    </form>

                    <button
                        type="button"
                        onClick={reset}
                        className="text-slate-400 hover:text-white text-sm text-center transition-colors mt-1"
                    >
                        ← Back to Login
                    </button>
                </div>
            </div>
        );
    }

    // ─── OTP Request Screen (passwordless) ───────────────────────────────────
    if (loginFlow === 'otp' && step === 'credentials') {
        return (
            <div className="min-h-screen flex items-center justify-center py-12 px-6 relative">
                <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] pointer-events-none"></div>

                <form onSubmit={requestOtp} className="glass-card p-10 max-w-sm w-full flex flex-col gap-4 z-10 animate-in slide-in-from-left-8">
                    <button type="button" onClick={() => { setLoginFlow('password'); setError(''); setInfo(''); }} className="text-slate-400 hover:text-white text-sm flex items-center gap-1 w-fit transition-colors">
                        ← Back to Password Login
                    </button>

                    {/* Icon */}
                    <div className="w-16 h-16 rounded-2xl bg-secondary/20 border border-secondary/30 flex items-center justify-center mx-auto">
                        <svg className="w-8 h-8 text-secondary" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                    </div>

                    <h2 className="text-2xl font-black text-center bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
                        Login with OTP
                    </h2>
                    <p className="text-xs text-center text-slate-400">
                        Enter your registered email. We'll send a one-time code to your <strong className="text-slate-300">email & mobile number</strong>.
                    </p>

                    {error && (
                        <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm font-semibold border border-red-500/30">
                            ⚠️ {error}
                        </div>
                    )}

                    <div>
                        <label className="block text-sm text-slate-400 mb-1">Registered Email</label>
                        <input
                            className="input-field"
                            type="email"
                            placeholder="user@gmail.com"
                            required
                            autoFocus
                            value={otpEmail}
                            onChange={(e) => setOtpEmail(e.target.value)}
                        />
                    </div>

                    <button
                        disabled={loading}
                        className={`btn mt-1 py-3 text-lg flex items-center justify-center gap-2 ${loading ? 'opacity-60 cursor-not-allowed' : ''}`}
                    >
                        {loading ? (
                            <><svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Sending OTP...</>
                        ) : '📨 Send OTP'}
                    </button>

                    <p className="text-sm text-center text-slate-400 mt-1">
                        New here?{' '}
                        <button type="button" onClick={onSwitchToRegister} className="text-primary hover:text-indigo-400 font-bold transition-colors">
                            Register
                        </button>
                    </p>
                </form>
            </div>
        );
    }

    // ─── Password Login Screen (default) ─────────────────────────────────────
    return (
        <div className="min-h-screen flex items-center justify-center py-12 px-6 relative">
            <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] rounded-full bg-primary/20 blur-[120px] pointer-events-none"></div>
            <div className="absolute bottom-[-10%] right-[-10%] w-[30%] h-[30%] rounded-full bg-secondary/10 blur-[100px] pointer-events-none"></div>

            <form onSubmit={submitPassword} className="glass-card p-10 max-w-sm w-full flex flex-col gap-4 z-10 animate-in slide-in-from-bottom-8">
                <h2 className="text-3xl font-black text-center bg-clip-text text-transparent bg-gradient-to-r from-primary to-secondary">
                    Welcome Back
                </h2>
                <p className="text-xs text-center text-slate-400 mb-1">Sign in to report and track civic issues</p>

                {/* Citizen / Government Toggle */}
                <div className="flex bg-slate-800 rounded-lg p-1 gap-1">
                    <button
                        type="button"
                        onClick={() => { setMode('user'); setError(''); setFormData({ email: '', password: '' }); }}
                        className={`flex-1 py-2 rounded-md text-xs font-bold transition-colors ${mode === 'user' ? 'bg-primary text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        👤 Citizen
                    </button>
                    <button
                        type="button"
                        onClick={() => { setMode('admin'); setError(''); setFormData({ email: 'gov@city.org', password: '' }); }}
                        className={`flex-1 py-2 rounded-md text-xs font-bold transition-colors ${mode === 'admin' ? 'bg-amber-500 text-white shadow' : 'text-slate-400 hover:text-white'}`}
                    >
                        🏛️ Government
                    </button>
                </div>

                {error && (
                    <div className="bg-red-500/20 text-red-400 p-3 rounded-lg text-sm font-semibold border border-red-500/30">
                        ⚠️ {error}
                    </div>
                )}

                <div>
                    <label className="block text-sm text-slate-400 mb-1">Email</label>
                    <input
                        className="input-field"
                        type="email"
                        placeholder={mode === 'admin' ? 'gov@city.org' : 'user@gmail.com'}
                        required
                        value={formData.email}
                        onChange={(e) => setFormData({ ...formData, email: e.target.value })}
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

                <button
                    disabled={loading}
                    className={`btn mt-1 py-3 text-lg flex items-center justify-center gap-2
            ${loading ? 'opacity-60 cursor-not-allowed' : ''}
            ${mode === 'admin' ? 'bg-amber-500 hover:bg-amber-400' : ''}`}
                >
                    {loading ? (
                        <><svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"></path></svg> Signing in...</>
                    ) : mode === 'admin' ? 'Access Portal ➔' : 'Login'}
                </button>

                {/* OTP Login link — only for citizens */}
                {mode === 'user' && (
                    <button
                        type="button"
                        onClick={() => { setLoginFlow('otp'); setOtpEmail(formData.email); setError(''); setInfo(''); }}
                        className="text-sm text-center text-secondary hover:text-purple-400 font-semibold transition-colors -mt-1 flex items-center justify-center gap-1"
                    >
                        📱 Login with OTP instead
                    </button>
                )}

                {mode === 'user' && (
                    <p className="text-sm text-center text-slate-400 mt-1">
                        New to CivicConnect?{' '}
                        <button type="button" onClick={onSwitchToRegister} className="text-primary hover:text-indigo-400 font-bold transition-colors">
                            Register
                        </button>
                    </p>
                )}
            </form>
        </div>
    );
}
