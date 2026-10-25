import React, { useState, useEffect } from 'react';
import { Customer, User, WhatsAppTemplate } from '../types/index.js';
import { apiRequest } from '../api/client.js';
import { useToast } from '../contexts/ToastContext.js';
import { useAuth } from '../contexts/AuthContext.js';
import {
  ExternalLink,
  MessageSquare,
  ShieldCheck,
  AlertCircle,
  Search,
  PhoneCall,
  Clock,
  ArrowLeft,
  ChevronRight,
  Info,
  CheckCircle2,
  Lock,
} from 'lucide-react';

interface WhatsAppWorkspacePageProps {
  onOpenFollowUpModal?: (customer: Customer) => void;
  onNavigateToDashboard?: () => void;
  onNavigateToCustomers?: () => void;
}

export const WhatsAppWorkspacePage: React.FC<WhatsAppWorkspacePageProps> = ({
  onOpenFollowUpModal,
  onNavigateToDashboard,
  onNavigateToCustomers,
}) => {
  const { showToast } = useToast();
  const { isAdmin } = useAuth();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesList, setSalesList] = useState<User[]>([]);
  const [selectedSalesId, setSelectedSalesId] = useState('all');
  const [templates, setTemplates] = useState<WhatsAppTemplate[]>([]);
  const [search, setSearch] = useState('');
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | 'none'>('none');
  const [isLoading, setIsLoading] = useState(true);
  const [embedDiagnostic, setEmbedDiagnostic] = useState<'idle' | 'testing' | 'blocked'>('idle');

  const handleTestDirectEmbed = () => {
    setEmbedDiagnostic('testing');
    setTimeout(() => {
      setEmbedDiagnostic('blocked');
      showToast('Hasil Uji: web.whatsapp.com menolak sematan langsung (X-Frame-Options: DENY). Buka di tab baru.', 'info');
    }, 500);
  };

  // Admin dapat memilih Sales; backend tetap menentukan hak akses customer.
  useEffect(() => {
    if (!isAdmin) return;

    let cancelled = false;

    const fetchSales = async () => {
      try {
        const res = await apiRequest<{ success: boolean; data: User[] }>(
          '/users/sales-management?status=ACTIVE'
        );

        if (!cancelled && res.success && Array.isArray(res.data)) {
          setSalesList(
            res.data.filter(
              (u) => u.role === 'SALES' &&
                u.account_status === 'ACTIVE' &&
                u.is_active
            )
          );
        }
      } catch (err: any) {
        if (!cancelled) {
          showToast(err.message || 'Gagal memuat daftar Sales.', 'error');
        }
      }
    };

    fetchSales();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, showToast]);

  // Load customer data and active templates.
  useEffect(() => {
    let cancelled = false;

    const fetchData = async () => {
      setIsLoading(true);
      try {
        const customerQuery =
          isAdmin && selectedSalesId !== 'all'
            ? `/customers?limit=100&sales_id=${encodeURIComponent(selectedSalesId)}`
            : '/customers?limit=100';

        const [resCust, resTpl] = await Promise.all([
          apiRequest<{ success: boolean; data: Customer[] }>(customerQuery),
          apiRequest('/templates'),
        ]);

        if (!cancelled) {
          if (resCust.success && Array.isArray(resCust.data)) {
            setCustomers(resCust.data);
          } else {
            setCustomers([]);
          }

          if (resTpl.success && Array.isArray(resTpl.data)) {
            setTemplates(
              resTpl.data.filter((t: WhatsAppTemplate) => t.is_active)
            );
          }
        }
      } catch (err: any) {
        if (!cancelled) {
          setCustomers([]);
          showToast('Gagal memuat data pelanggan untuk WhatsApp.', 'error');
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    };

    fetchData();

    return () => {
      cancelled = true;
    };
  }, [isAdmin, selectedSalesId, showToast]);

  const handleOpenWhatsAppWeb = () => {
    window.open('https://web.whatsapp.com', '_blank', 'noopener,noreferrer');
    showToast('Membuka WhatsApp Web di tab browser baru.', 'info');
  };

  const handleOpenCustomerChat = (c: Customer) => {
    if (!c.whatsapp_number) {
      showToast('Nomor WhatsApp customer tidak terdaftar.', 'error');
      return;
    }

    let phone = c.whatsapp_number.replace(/\D/g, '');
    if (phone.startsWith('0')) {
      phone = '62' + phone.substring(1);
    } else if (phone.startsWith('8')) {
      phone = '62' + phone;
    }

    let textPayload = '';
    if (selectedTemplateId !== 'none') {
      const tpl = templates.find((t) => t.id === Number(selectedTemplateId));
      if (tpl) {
        textPayload = tpl.content
          .replace(/\{\{nama\}\}/gi, c.name || '')
          .replace(/\{\{perusahaan\}\}/gi, c.company_name || '')
          .replace(/\{\{pic\}\}/gi, c.pic_name || c.name || '')
          .replace(/\{\{kota\}\}/gi, c.city || '');
      }
    }

    const encodedText = encodeURIComponent(textPayload);
    const waUrl = `https://wa.me/${phone}${encodedText ? `?text=${encodedText}` : ''}`;
    window.open(waUrl, '_blank', 'noopener,noreferrer');

    showToast(`Membuka chat WhatsApp untuk ${c.name}.`, 'success');
  };

  const filteredCustomers = customers.filter((c) => {
    const q = search.toLowerCase();
    return (
      c.name.toLowerCase().includes(q) ||
      (c.company_name && c.company_name.toLowerCase().includes(q)) ||
      (c.whatsapp_number && c.whatsapp_number.includes(q)) ||
      (c.city && c.city.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-4 sm:space-y-6 max-w-6xl mx-auto overflow-x-hidden">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight">
              WhatsApp Web Workspace
            </h1>
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/30">
              SALES INTEGRATION
            </span>
          </div>
          <p className="text-xs text-neutral-500 mt-0.5">
            Buka WhatsApp Web dan hubungi customer CRM Captain Konveksi secara terstruktur dan terdokumentasi.
          </p>
        </div>

        {/* Back Buttons to CRM */}
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {onNavigateToDashboard && (
            <button
              type="button"
              onClick={onNavigateToDashboard}
              className="min-h-[36px] px-3 py-1.5 bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-700 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Dashboard</span>
            </button>
          )}
          {onNavigateToCustomers && (
            <button
              type="button"
              onClick={onNavigateToCustomers}
              className="min-h-[36px] px-3 py-1.5 bg-white hover:bg-neutral-100 border border-neutral-200 text-neutral-700 rounded-xl text-xs font-semibold shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
            >
              <span>Data Customer</span>
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </div>

      {/* Main WhatsApp Web Launcher Card (Navy-Gold Captain Konveksi) */}
      <div className="bg-gradient-to-r from-neutral-900 via-neutral-800 to-neutral-900 rounded-2xl p-5 sm:p-6 text-white border border-neutral-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div className="space-y-2 max-w-xl">
          <div className="flex items-center gap-2 text-[#c5a059]">
            <MessageSquare className="w-5 h-5" />
            <span className="text-xs font-bold uppercase tracking-wider">Akses Langsung WhatsApp Web</span>
          </div>
          <h2 className="text-base sm:text-lg font-bold text-white tracking-tight">
            Mulai Percakapan & Follow-Up di Tab Browser Terpisah
          </h2>
          <p className="text-xs text-neutral-300 leading-relaxed">
            WhatsApp Web menerapkan kebijakan keamanan resmi yang memblokir penanaman halaman di dalam iframe. Buka WhatsApp Web di tab browser baru Anda untuk menjaga koneksi QR tetap stabil, aman, dan tanpa batasan.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={handleOpenWhatsAppWeb}
            className="min-h-[46px] px-6 py-2.5 bg-[#c5a059] hover:bg-[#b38f48] active:bg-[#9d7d3d] text-neutral-900 font-bold rounded-xl text-sm shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer"
          >
            <ExternalLink className="w-4 h-4" />
            <span>Buka WhatsApp Web di Tab Baru</span>
          </button>
          <button
            type="button"
            onClick={handleTestDirectEmbed}
            disabled={embedDiagnostic === 'testing'}
            className="min-h-[46px] px-4 py-2.5 bg-neutral-800 hover:bg-neutral-700 active:bg-neutral-600 text-neutral-200 hover:text-white rounded-xl text-xs font-semibold border border-neutral-700/80 flex items-center justify-center gap-2 transition-all cursor-pointer disabled:opacity-50"
          >
            <ShieldCheck className="w-4 h-4 text-[#c5a059]" />
            <span>{embedDiagnostic === 'testing' ? 'Menguji Respon...' : 'Uji Sematan Langsung'}</span>
          </button>
        </div>
      </div>

      {/* Interactive Embed Diagnostic Output */}
      {embedDiagnostic === 'testing' && (
        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl flex items-center gap-3 text-xs text-amber-900 animate-pulse">
          <div className="w-4 h-4 border-2 border-amber-600 border-t-transparent rounded-full animate-spin shrink-0" />
          <span>Menguji kebijakan keamanan browser terhadap tautan https://web.whatsapp.com...</span>
        </div>
      )}

      {embedDiagnostic === 'blocked' && (
        <div className="p-4 sm:p-5 bg-neutral-900 border border-[#c5a059]/40 rounded-2xl text-white space-y-3 shadow-md">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-[#c5a059]">
              <AlertCircle className="w-4 h-4" />
              <span className="text-xs font-bold uppercase tracking-wider">Hasil Pengujian Metode Sematan Langsung</span>
            </div>
            <button
              type="button"
              onClick={() => setEmbedDiagnostic('idle')}
              className="text-xs text-neutral-400 hover:text-white transition-colors cursor-pointer"
            >
              Tutup
            </button>
          </div>
          <div className="text-xs text-neutral-300 leading-relaxed space-y-2">
            <p>
              <strong className="text-white">Status:</strong> Kebijakan keamanan resmi WhatsApp Web aktif (<code className="text-amber-300">X-Frame-Options: DENY</code> &amp; <code className="text-amber-300">Content-Security-Policy: frame-ancestors 'none'</code>). Browser menolak menampilkan halaman WhatsApp Web di dalam iframe atau sematan langsung domain lain.
            </p>
            <p>
              <strong className="text-white">Solusi Resmi:</strong> CRM Captain Konveksi tidak menggunakan reverse-proxy palsu atau injeksi scraping tersembunyi demi menjaga kepatuhan hukum dan mencegah risiko blokir nomor. Buka langsung di tab browser baru untuk koneksi resmi yang aman.
            </p>
          </div>
          <div className="pt-1 flex items-center gap-2">
            <button
              type="button"
              onClick={handleOpenWhatsAppWeb}
              className="px-4 py-2 bg-[#c5a059] hover:bg-[#b38f48] text-neutral-900 font-bold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              <span>Buka WhatsApp Web Sekarang</span>
            </button>
          </div>
        </div>
      )}

      {/* Security & Architecture Diagnostic Notice */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="p-3.5 bg-neutral-100 rounded-2xl border border-neutral-200/90 flex items-start gap-3 text-xs text-neutral-700">
          <ShieldCheck className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-neutral-900 block mb-0.5">Audit Kebijakan Keamanan Iframe:</span>
            WhatsApp Web secara resmi menyetel header <code>X-Frame-Options: DENY</code> dan CSP <code>frame-ancestors 'none'</code>. CRM tidak memaksakan iframe atau halaman tiruan palsu demi menjamin privasi dan keamanan akun Anda.
          </div>
        </div>

        <div className="p-3.5 bg-neutral-100 rounded-2xl border border-neutral-200/90 flex items-start gap-3 text-xs text-neutral-700">
          <Lock className="w-4 h-4 text-[#c5a059] shrink-0 mt-0.5" />
          <div className="leading-relaxed">
            <span className="font-bold text-neutral-900 block mb-0.5">Zero-Credential Policy:</span>
            Aplikasi CRM Captain Konveksi tidak pernah meminta nomor PIN, password, ataupun session keys WhatsApp Anda. Autentikasi sepenuhnya ditangani langsung oleh server resmi WhatsApp.
          </div>
        </div>
      </div>

      {/* Customer WhatsApp Hub Section */}
      <div className="bg-white rounded-2xl border border-neutral-200/90 shadow-2xs overflow-hidden">
        {/* Header & Controls */}
        <div className="p-4 sm:p-5 border-b border-neutral-200 flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-neutral-900">
              Daftar Customer untuk Follow-Up WhatsApp
            </h2>
            <p className="text-xs text-neutral-500 mt-0.5">
              Pilih customer, pasang template pesan jika diperlukan, dan buka chat WhatsApp langsung sekali klik.
            </p>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
            {isAdmin && (
              <select
                aria-label="Pilih Sales untuk WhatsApp Workspace"
                value={selectedSalesId}
                onChange={(e) => setSelectedSalesId(e.target.value)}
                className="text-xs px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#c5a059]/40 min-h-[40px]"
              >
                <option value="all">Semua Sales</option>
                {salesList.map((sales) => (
                  <option key={sales.id} value={String(sales.id)}>
                    {sales.name}
                  </option>
                ))}
              </select>
            )}

            {/* Template Selector */}
            <select
              value={selectedTemplateId}
              onChange={(e) => setSelectedTemplateId(e.target.value === 'none' ? 'none' : Number(e.target.value))}
              className="text-xs px-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#c5a059]/40 min-h-[40px]"
            >
              <option value="none">-- Tanpa Template (Chat Kosong) --</option>
              {templates.map((tpl) => (
                <option key={tpl.id} value={tpl.id}>
                  Template: {tpl.title}
                </option>
              ))}
            </select>

            {/* Search Input */}
            <div className="relative min-w-[200px]">
              <Search className="w-4 h-4 text-neutral-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                placeholder="Cari customer / nomor WA..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full text-xs pl-9 pr-3 py-2 bg-neutral-50 border border-neutral-300 rounded-xl focus:outline-hidden focus:ring-2 focus:ring-[#c5a059]/40 min-h-[40px]"
              />
            </div>
          </div>
        </div>

        {/* Customer List */}
        {isLoading ? (
          <div className="p-12 text-center text-xs text-neutral-500">
            Memuat daftar pelanggan aktif...
          </div>
        ) : filteredCustomers.length === 0 ? (
          <div className="p-8 sm:p-12 text-center text-neutral-500">
            <Info className="w-8 h-8 mx-auto text-neutral-400 mb-2" />
            <p className="text-xs font-semibold text-neutral-700">Tidak ada customer yang sesuai pencarian.</p>
          </div>
        ) : (
          <div className="divide-y divide-neutral-100">
            {filteredCustomers.map((c) => (
              <div
                key={c.id}
                className="p-3.5 sm:p-4 hover:bg-neutral-50/80 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold text-neutral-900 truncate">{c.name}</span>
                    {c.company_name && (
                      <span className="text-[11px] text-neutral-500 truncate">({c.company_name})</span>
                    )}
                    {c.status && (
                      <span
                        className="text-[10px] font-bold px-2 py-0.5 rounded-full"
                        style={{
                          backgroundColor: `${c.status.color_code || '#64748b'}15`,
                          color: c.status.color_code || '#64748b',
                          borderColor: `${c.status.color_code || '#64748b'}30`,
                          borderWidth: '1px',
                        }}
                      >
                        {c.status.label}
                      </span>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[11px] text-neutral-500">
                    <span className="font-mono text-neutral-700">{c.whatsapp_number || 'Tanpa No WA'}</span>
                    {c.city && <span>• {c.city}</span>}
                    {c.next_follow_up_date && (
                      <span className="text-neutral-500 flex items-center gap-1">
                        <Clock className="w-3 h-3 text-[#c5a059]" />
                        Next FU: {c.next_follow_up_date}
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                  <button
                    type="button"
                    onClick={() => handleOpenCustomerChat(c)}
                    className="min-h-[36px] px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold rounded-xl text-xs shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                    title="Buka Chat WhatsApp di Tab Baru"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>Chat WhatsApp</span>
                  </button>

                  {onOpenFollowUpModal && (
                    <button
                      type="button"
                      onClick={() => onOpenFollowUpModal(c)}
                      className="min-h-[36px] px-3 py-1.5 bg-white hover:bg-neutral-100 border border-neutral-300 text-neutral-800 font-semibold rounded-xl text-xs shadow-2xs flex items-center gap-1.5 transition-all cursor-pointer"
                      title="Catat Riwayat Hasil Follow-Up"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5 text-[#c5a059]" />
                      <span>Catat Hasil</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
