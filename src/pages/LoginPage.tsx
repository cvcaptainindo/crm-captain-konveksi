import React, { useState } from 'react';
import { useAuth } from '../contexts/AuthContext.js';
import { useToast } from '../contexts/ToastContext.js';
import { apiRequest } from '../api/client.js';
import { User, ArrowRight, Lock, Mail, Phone, UserCheck, AlertCircle, CheckCircle2 } from 'lucide-react';

export const LoginPage: React.FC = () => {
  const { login } = useAuth();
  const { showToast } = useToast();

  const [activeTab, setActiveTab] = useState<'login' | 'register'>('login');

  // Login form state
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regPassword, setRegPassword] = useState('');
  const [regConfirmPassword, setRegConfirmPassword] = useState('');
  const [isRegistering, setIsRegistering] = useState(false);
  const [registeredSuccessInfo, setRegisteredSuccessInfo] = useState<string | null>(null);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) {
      showToast('Email dan password wajib diisi.', 'error');
      return;
    }

    setIsLoading(true);
    try {
      await login(email, password);
      showToast('Selamat datang di CRM Captain Konveksi.', 'success');
    } catch (err: any) {
      showToast(err.message || 'Login gagal. Periksa kembali email dan password.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!regName.trim() || !regEmail.trim() || !regPassword) {
      showToast('Nama, email, dan password wajib diisi.', 'error');
      return;
    }

    if (regPassword.length < 6) {
      showToast('Password minimal 6 karakter.', 'error');
      return;
    }

    if (regPassword !== regConfirmPassword) {
      showToast('Konfirmasi password tidak cocok dengan password.', 'error');
      return;
    }

    setIsRegistering(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string; data?: any }>('/auth/register', {
        method: 'POST',
        body: JSON.stringify({
          name: regName.trim(),
          email: regEmail.trim(),
          phone: regPhone.trim(),
          password: regPassword,
          confirmPassword: regConfirmPassword,
        }),
      });

      if (res.success) {
        setRegisteredSuccessInfo(
          `Pendaftaran berhasil! Akun Sales "${regName}" berhasil dibuat dengan status PENDING. Silakan hubungi Admin / Owner Captain Konveksi untuk verifikasi dan persetujuan akun sebelum Anda dapat login.`
        );
        showToast('Pendaftaran Sales berhasil! Menunggu persetujuan Admin.', 'success');
        // Reset form
        setRegName('');
        setRegEmail('');
        setRegPhone('');
        setRegPassword('');
        setRegConfirmPassword('');
      }
    } catch (err: any) {
      showToast(err.message || 'Pendaftaran gagal.', 'error');
    } finally {
      setIsRegistering(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-900 flex flex-col justify-center items-center p-3 sm:p-4 safe-area-bottom safe-area-top">
      {/* Container */}
      <div className="w-full max-w-md bg-white rounded-3xl sm:rounded-2xl shadow-2xl border border-neutral-800/20 overflow-hidden">
        {/* Header with Logo */}
        <div className="p-5 sm:p-7 text-center bg-neutral-950 text-white relative border-b border-neutral-800">
          <img
            src="/logo.jpg"
            alt="Captain Konveksi"
            className="w-16 h-16 sm:w-20 sm:h-20 rounded-2xl object-cover mx-auto mb-2.5 shadow-xl border-2 border-[#c5a059]/40"
          />
          <h1 className="text-base sm:text-lg font-bold tracking-tight text-white">CRM CAPTAIN KONVEKSI</h1>
          <p className="text-[11px] sm:text-xs text-neutral-400 mt-0.5">Sistem Manajemen & Follow-Up Customer Konveksi</p>

          {/* Tab Switcher: Login vs Register Sales */}
          <div className="grid grid-cols-2 p-1 bg-neutral-900 border border-neutral-800 rounded-xl mt-4 max-w-xs mx-auto">
            <button
              type="button"
              onClick={() => {
                setActiveTab('login');
                setRegisteredSuccessInfo(null);
              }}
              className={`min-h-[38px] py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'login'
                  ? 'bg-[#c5a059] text-neutral-950 font-bold shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Masuk (Login)
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('register');
                setRegisteredSuccessInfo(null);
              }}
              className={`min-h-[38px] py-1.5 px-3 rounded-lg text-xs font-semibold transition-all ${
                activeTab === 'register'
                  ? 'bg-[#c5a059] text-neutral-950 font-bold shadow-xs'
                  : 'text-neutral-400 hover:text-white'
              }`}
            >
              Daftar Sales
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="p-5 sm:p-7">
          {registeredSuccessInfo && (
            <div className="mb-5 p-3.5 bg-neutral-50 border border-neutral-200 rounded-2xl flex items-start gap-2.5 text-neutral-900 text-xs leading-relaxed">
              <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
              <div>
                <div className="font-bold text-neutral-900 mb-0.5">Akun Terdaftar (Status PENDING)</div>
                <div className="text-neutral-600">{registeredSuccessInfo}</div>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('login');
                    setRegisteredSuccessInfo(null);
                  }}
                  className="mt-2 text-[11px] font-bold text-neutral-900 underline block"
                >
                  Kembali ke Halaman Login →
                </button>
              </div>
            </div>
          )}

          {activeTab === 'login' ? (
            /* LOGIN FORM */
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Email Akun</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    inputMode="email"
                    autoComplete="email"
                    required
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="cvcaptainindo@gmail.com"
                    className="w-full min-h-[46px] pl-10 pr-3 py-2.5 text-sm sm:text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Password</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                  <input
                    type="password"
                    autoComplete="current-password"
                    required
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full min-h-[46px] pl-10 pr-3 py-2.5 text-sm sm:text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] font-mono"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="w-full min-h-[48px] py-3 px-4 bg-neutral-900 hover:bg-neutral-800 active:bg-black text-[#c5a059] border border-[#c5a059]/40 text-xs sm:text-sm font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50"
              >
                <span>{isLoading ? 'Memeriksa Kredensial...' : 'Masuk ke Dashboard'}</span>
                <ArrowRight className="w-4 h-4 text-[#c5a059]" />
              </button>
            </form>
          ) : (
            /* PUBLIC SALES REGISTRATION FORM */
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl text-neutral-700 text-[11px] leading-relaxed flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-[#c5a059] shrink-0 mt-0.5" />
                <div>
                  Pendaftaran ini dikhususkan bagi <strong>Sales Baru</strong>. Akun yang baru didaftarkan akan berstatus <strong>PENDING</strong> dan harus disetujui Owner/Admin sebelum dapat mengakses CRM.
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Nama Lengkap</label>
                <div className="relative">
                  <User className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    value={regName}
                    onChange={e => setRegName(e.target.value)}
                    placeholder="Contoh: Rian Anggara"
                    className="w-full min-h-[44px] pl-10 pr-3 py-2 text-sm sm:text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Email Sales</label>
                <div className="relative">
                  <Mail className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                  <input
                    type="email"
                    inputMode="email"
                    required
                    value={regEmail}
                    onChange={e => setRegEmail(e.target.value)}
                    placeholder="nama.sales@captainkonveksi.com"
                    className="w-full min-h-[44px] pl-10 pr-3 py-2 text-sm sm:text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Nomor WhatsApp Aktif</label>
                <div className="relative">
                  <Phone className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                  <input
                    type="tel"
                    inputMode="tel"
                    required
                    value={regPhone}
                    onChange={e => setRegPhone(e.target.value)}
                    placeholder="081234567890"
                    className="w-full min-h-[44px] pl-10 pr-3 py-2 text-sm sm:text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      value={regPassword}
                      onChange={e => setRegPassword(e.target.value)}
                      placeholder="Min. 6 digit"
                      className="w-full min-h-[44px] pl-10 pr-3 py-2 text-sm sm:text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-neutral-700 mb-1">Konfirmasi Password</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      value={regConfirmPassword}
                      onChange={e => setRegConfirmPassword(e.target.value)}
                      placeholder="Ulangi password"
                      className="w-full min-h-[44px] pl-10 pr-3 py-2 text-sm sm:text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] font-mono"
                    />
                  </div>
                </div>
              </div>

              <button
                type="submit"
                disabled={isRegistering}
                className="w-full min-h-[48px] py-3 px-4 bg-neutral-900 hover:bg-neutral-800 active:bg-black text-[#c5a059] border border-[#c5a059]/40 text-xs sm:text-sm font-bold rounded-xl shadow-xs flex items-center justify-center gap-2 transition-all disabled:opacity-50 mt-2"
              >
                <UserCheck className="w-4 h-4 text-[#c5a059]" />
                <span>{isRegistering ? 'Mendaftarkan Akun...' : 'Daftar Sebagai Sales'}</span>
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
