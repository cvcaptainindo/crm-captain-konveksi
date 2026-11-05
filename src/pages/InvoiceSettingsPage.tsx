import React, { useState, useEffect } from 'react';
import {
  Building2 as BuildingOffice2Icon,
  CreditCard as CreditCardIcon,
  FileCheck as DocumentCheckIcon,
  UserCheck as IdentificationIcon,
  Plus as PlusIcon,
  Trash2 as TrashIcon,
  Edit2 as PencilSquareIcon,
  CheckCircle2 as CheckCircleIcon,
  AlertCircle as ExclamationCircleIcon,
  RefreshCw as ArrowPathIcon,
  Image as PhotoIcon,
  ShieldCheck as ShieldCheckIcon,
} from 'lucide-react';
import type { InvoiceSettings, InvoiceTerm } from '../types';

export const InvoiceSettingsPage: React.FC = () => {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Form states - canonical database fields only (fully customizable, no hardcoded locks)
  const [companyName, setCompanyName] = useState('');
  const [companyLegalName, setCompanyLegalName] = useState('');
  const [companyLogoUrl, setCompanyLogoUrl] = useState<string | null>(null);
  const [companyAddress, setCompanyAddress] = useState('');
  const [companyPhone, setCompanyPhone] = useState('');
  const [companyWhatsapp, setCompanyWhatsapp] = useState('');
  const [companyEmail, setCompanyEmail] = useState('');
  const [companyWebsite, setCompanyWebsite] = useState('');
  const [nib, setNib] = useState('');
  const [npwp, setNpwp] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccountNumber, setBankAccountNumber] = useState('');
  const [bankAccountHolder, setBankAccountHolder] = useState('');
  const [signatoryName, setSignatoryName] = useState('');
  const [signatoryRole, setSignatoryRole] = useState('');
  const [signatorySignatureUrl, setSignatorySignatureUrl] = useState<string | null>(null);
  const [companyStampUrl, setCompanyStampUrl] = useState<string | null>(null);

  // Terms state
  const [terms, setTerms] = useState<InvoiceTerm[]>([]);
  const [newTermText, setNewTermText] = useState('');
  const [editingTermId, setEditingTermId] = useState<number | null>(null);
  const [editingTermText, setEditingTermText] = useState('');

  // Active tab inside settings
  const [activeTab, setActiveTab] = useState<'company' | 'bank' | 'signatory' | 'terms' | 'preview'>('company');

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    setLoading(true);
    setErrorMessage(null);
    try {
      const token = localStorage.getItem('captain_crm_token');
      const res = await fetch('/api/admin/invoice-settings', {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      if (!res.ok) {
        if (res.status === 403) {
          throw new Error('Akses ditolak: Hanya Admin yang dapat mengakses menu pengaturan invoice.');
        }
        throw new Error('Gagal memuat pengaturan invoice dari server.');
      }

      const json = await res.json();
      if (json.success && json.data) {
        const d: any = json.data;
        setCompanyName(d.company_name || '');
        setCompanyLegalName(d.company_legal_name || d.legal_name || '');
        setCompanyLogoUrl(d.company_logo_url || null);
        setCompanyAddress(d.company_address || '');
        setCompanyPhone(d.company_phone || '');
        setCompanyWhatsapp(d.company_whatsapp || '');
        setCompanyEmail(d.company_email || '');
        setCompanyWebsite(d.company_website || '');
        setNib(d.nib || '');
        setNpwp(d.npwp || '');
        setBankName(d.bank_name || '');
        setBankAccountNumber(d.bank_account_number || '');
        setBankAccountHolder(d.bank_account_holder || '');
        setSignatoryName(d.signatory_name || '');
        setSignatoryRole(d.signatory_role || d.signatory_title || '');
        setSignatorySignatureUrl(d.signatory_signature_url || d.signature_image_url || null);
        setCompanyStampUrl(d.company_stamp_url || d.stamp_image_url || null);
        setTerms(d.terms || []);
      }
    } catch (err: any) {
      console.error(err);
      setErrorMessage(err.message || 'Terjadi kesalahan saat memuat pengaturan.');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveSettings = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setSaving(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const token = localStorage.getItem('captain_crm_token');
      const payload = {
        company_name: companyName.trim(),
        company_legal_name: companyLegalName.trim() || null,
        company_logo_url: companyLogoUrl,
        company_address: companyAddress.trim() || null,
        company_phone: companyPhone.trim() || null,
        company_whatsapp: companyWhatsapp.trim() || null,
        company_email: companyEmail.trim() || null,
        company_website: companyWebsite.trim() || null,
        nib: nib.trim() || null,
        npwp: npwp.trim() || null,
        bank_name: bankName.trim() || null,
        bank_account_number: bankAccountNumber.trim() || null,
        bank_account_holder: bankAccountHolder.trim() || null,
        signatory_name: signatoryName.trim() || null,
        signatory_role: signatoryRole.trim() || null,
        signatory_signature_url: signatorySignatureUrl,
        company_stamp_url: companyStampUrl,
        // Legacy aliases
        legal_name: companyLegalName.trim() || null,
        signatory_title: signatoryRole.trim() || null,
        signature_image_url: signatorySignatureUrl,
        stamp_image_url: companyStampUrl,
      };

      const res = await fetch('/api/admin/invoice-settings', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify(payload),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menyimpan pengaturan.');
      }

      setSuccessMessage('Pengaturan invoice dan identitas perusahaan berhasil disimpan secara permanen.');
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || 'Terjadi kesalahan saat menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  // Image Upload handler (converts to base64 for reliable standalone preview and persistence)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, target: 'signature' | 'stamp' | 'logo') => {
    const file = e.target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) {
      alert('Ukuran file maksimal 2MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      if (target === 'signature') {
        setSignatorySignatureUrl(result);
      } else if (target === 'stamp') {
        setCompanyStampUrl(result);
      } else {
        setCompanyLogoUrl(result);
      }
    };
    reader.readAsDataURL(file);
  };

  // Terms handlers
  const handleAddTerm = async () => {
    if (!newTermText.trim()) return;
    try {
      const token = localStorage.getItem('captain_crm_token');
      const res = await fetch('/api/admin/invoice-settings/terms', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          term_text: newTermText.trim(),
          sort_order: terms.length + 1,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menambahkan syarat.');
      }

      setTerms(prev => [...prev, json.data]);
      setNewTermText('');
    } catch (err: any) {
      alert(err.message || 'Gagal menambah syarat.');
    }
  };

  const handleUpdateTerm = async (id: number) => {
    if (!editingTermText.trim()) return;
    try {
      const token = localStorage.getItem('captain_crm_token');
      const target = terms.find(t => t.id === id);
      const res = await fetch(`/api/admin/invoice-settings/terms/${id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          term_text: editingTermText.trim(),
          sort_order: target?.sort_order || target?.term_order || 1,
          is_active: target?.is_active ?? 1,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal mengubah syarat.');
      }

      setTerms(prev => prev.map(t => (t.id === id ? { ...t, term_text: editingTermText.trim() } : t)));
      setEditingTermId(null);
      setEditingTermText('');
    } catch (err: any) {
      alert(err.message || 'Gagal memperbarui syarat.');
    }
  };

  const handleDeleteTerm = async (id: number) => {
    if (!confirm('Hapus syarat & ketentuan ini?')) return;
    try {
      const token = localStorage.getItem('captain_crm_token');
      const res = await fetch(`/api/admin/invoice-settings/terms/${id}`, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });

      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.message || 'Gagal menghapus syarat.');
      }

      setTerms(prev => prev.filter(t => t.id !== id));
    } catch (err: any) {
      alert(err.message || 'Gagal menghapus syarat.');
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[500px]">
        <ArrowPathIcon className="w-10 h-10 text-blue-600 animate-spin mb-3" />
        <p className="text-gray-600 font-medium">Memuat pengaturan invoice perusahaan...</p>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 py-8">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-6 border-b border-gray-200 mb-8 gap-4">
        <div>
          <div className="flex items-center gap-2 text-blue-600 mb-1">
            <ShieldCheckIcon className="w-5 h-5" />
            <span className="text-xs font-semibold tracking-wider uppercase">Menu Khusus Admin (RBAC Strict)</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold text-gray-900 tracking-tight">
            Pengaturan Master Invoice
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            Kelola identitas perusahaan, rekening bank resmi, syarat & ketentuan, serta tanda tangan & stempel.
          </p>
        </div>

        <button
          onClick={() => handleSaveSettings()}
          disabled={saving}
          className="inline-flex items-center justify-center gap-2 px-6 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-lg shadow-sm transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <ArrowPathIcon className="w-5 h-5 animate-spin" />
              <span>Menyimpan...</span>
            </>
          ) : (
            <>
              <CheckCircleIcon className="w-5 h-5" />
              <span>Simpan Perubahan</span>
            </>
          )}
        </button>
      </div>

      {/* Notifications */}
      {successMessage && (
        <div className="mb-6 p-4 rounded-lg bg-green-50 border border-green-200 flex items-start gap-3 text-green-800">
          <CheckCircleIcon className="w-5 h-5 text-green-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm font-medium">{successMessage}</div>
        </div>
      )}

      {errorMessage && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 border border-red-200 flex items-start gap-3 text-red-800">
          <ExclamationCircleIcon className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="text-sm font-medium">{errorMessage}</div>
        </div>
      )}

      {/* Tab Navigation */}
      <div className="flex border-b border-gray-200 mb-6 overflow-x-auto">
        <button
          onClick={() => setActiveTab('company')}
          className={`flex items-center gap-2 py-3 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'company'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <BuildingOffice2Icon className="w-4 h-4" />
          Identitas Perusahaan
        </button>
        <button
          onClick={() => setActiveTab('bank')}
          className={`flex items-center gap-2 py-3 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'bank'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <CreditCardIcon className="w-4 h-4" />
          Rekening Bank
        </button>
        <button
          onClick={() => setActiveTab('signatory')}
          className={`flex items-center gap-2 py-3 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'signatory'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <IdentificationIcon className="w-4 h-4" />
          Penandatangan & Stempel
        </button>
        <button
          onClick={() => setActiveTab('terms')}
          className={`flex items-center gap-2 py-3 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'terms'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <DocumentCheckIcon className="w-4 h-4" />
          Syarat & Ketentuan ({terms.length})
        </button>
        <button
          onClick={() => setActiveTab('preview')}
          className={`flex items-center gap-2 py-3 px-4 font-medium text-sm border-b-2 transition-colors whitespace-nowrap ${
            activeTab === 'preview'
              ? 'border-blue-600 text-blue-600'
              : 'border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300'
          }`}
        >
          <PhotoIcon className="w-4 h-4" />
          Live Preview A4
        </button>
      </div>

      {/* TAB 1: IDENTITAS PERUSAHAAN */}
      {activeTab === 'company' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <BuildingOffice2Icon className="w-5 h-5 text-blue-600" />
            Informasi Legal & Operasional Perusahaan
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Data ini dapat disesuaikan sepenuhnya oleh Admin dan akan dicetak pada kop surat invoice & dokumen transaksi.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Logo Upload */}
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Logo Perusahaan (Opsional)
              </label>
              <div className="flex items-center gap-4">
                {companyLogoUrl ? (
                  <div className="relative border border-gray-200 rounded-lg p-2 bg-gray-50 flex items-center justify-center h-20 w-36">
                    <img src={companyLogoUrl} alt="Logo Perusahaan" className="max-h-16 max-w-full object-contain" />
                    <button
                      type="button"
                      onClick={() => setCompanyLogoUrl('')}
                      className="absolute -top-2 -right-2 bg-red-600 text-white rounded-full p-1 hover:bg-red-700 shadow-sm"
                      title="Hapus Logo"
                    >
                      <TrashIcon className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ) : (
                  <div className="h-20 w-36 border-2 border-dashed border-gray-300 rounded-lg flex items-center justify-center text-xs text-gray-400 bg-gray-50">
                    Belum ada logo
                  </div>
                )}
                <div>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/svg+xml,image/webp"
                    id="logo-upload-input"
                    onChange={e => handleFileUpload(e, 'logo')}
                    className="hidden"
                  />
                  <label
                    htmlFor="logo-upload-input"
                    className="cursor-pointer inline-flex items-center gap-2 px-3.5 py-2 border border-gray-300 rounded-lg text-xs font-semibold text-gray-700 bg-white hover:bg-gray-50 shadow-sm"
                  >
                    <ArrowUpTrayIcon className="w-4 h-4" />
                    Upload Logo Baru (PNG/JPG/SVG max 2MB)
                  </label>
                  <p className="text-xs text-gray-400 mt-1">Logo akan tampil di bagian header/kop invoice.</p>
                </div>
              </div>
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nama Brand / Perusahaan <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={companyName}
                onChange={e => setCompanyName(e.target.value)}
                placeholder="Nama brand atau perusahaan"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nama Resmi Badan Usaha / Hukum (PT, CV, dll)
              </label>
              <input
                type="text"
                value={companyLegalName}
                onChange={e => setCompanyLegalName(e.target.value)}
                placeholder="Contoh: PT Kreasi Indo Mandiri / CV Berkah Jaya"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Alamat Workshop / Kantor Pusat
              </label>
              <textarea
                rows={3}
                value={companyAddress}
                onChange={e => setCompanyAddress(e.target.value)}
                placeholder="Alamat lengkap perusahaan beserta kota dan kode pos"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nomor Telepon Kantor
              </label>
              <input
                type="text"
                value={companyPhone}
                onChange={e => setCompanyPhone(e.target.value)}
                placeholder="Contoh: (021) 1234567 atau 08123456789"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nomor WhatsApp / Hotline Perusahaan
              </label>
              <input
                type="text"
                value={companyWhatsapp}
                onChange={e => setCompanyWhatsapp(e.target.value)}
                placeholder="Contoh: 081234567890"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Email Resmi Perusahaan
              </label>
              <input
                type="email"
                value={companyEmail}
                onChange={e => setCompanyEmail(e.target.value)}
                placeholder="info@perusahaan.com"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Website Resmi Perusahaan
              </label>
              <input
                type="text"
                value={companyWebsite}
                onChange={e => setCompanyWebsite(e.target.value)}
                placeholder="www.perusahaan.com"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nomor Induk Berusaha (NIB)
              </label>
              <input
                type="text"
                value={nib}
                onChange={e => setNib(e.target.value)}
                placeholder="Nomor NIB resmi"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                NPWP Perusahaan
              </label>
              <input
                type="text"
                value={npwp}
                onChange={e => setNpwp(e.target.value)}
                placeholder="Nomor NPWP resmi"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: REKENING BANK */}
      {activeTab === 'bank' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-2 flex items-center gap-2">
            <CreditCardIcon className="w-5 h-5 text-blue-600" />
            Rekening Bank Resmi Perusahaan
          </h2>
          <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-lg mb-6 text-xs text-amber-800">
            <strong>Peringatan Integritas:</strong> Sistem melarang penggunaan nomor rekening dummy/palsu. Jika rekening belum dikonfigurasi, invoice akan menampilkan keterangan &quot;Belum Dikonfigurasi&quot; tanpa data fiktif.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nama Bank <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={bankName}
                onChange={e => setBankName(e.target.value)}
                placeholder="Contoh: BCA / Mandiri / BNI / BRI"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nomor Rekening <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={bankAccountNumber}
                onChange={e => setBankAccountNumber(e.target.value)}
                placeholder="Nomor rekening bank resmi"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Atas Nama Rekening <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={bankAccountHolder}
                onChange={e => setBankAccountHolder(e.target.value)}
                placeholder="Nama pemilik rekening bank"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 3: PENANDATANGAN & STEMPEL */}
      {activeTab === 'signatory' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <h2 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
            <IdentificationIcon className="w-5 h-5 text-blue-600" />
            Identitas Penandatangan, Tanda Tangan & Stempel Resmi
          </h2>
          <p className="text-sm text-gray-500 mb-6">
            Tanda tangan dan stempel akan diletakkan di bagian bawah dokumen Invoice / Penawaran dengan format rapi dan tidak terpotong.
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Nama Penandatangan
              </label>
              <input
                type="text"
                value={signatoryName}
                onChange={e => setSignatoryName(e.target.value)}
                placeholder="Nama pejabat penandatangan resmi"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-semibold text-gray-700 mb-1">
                Jabatan Penandatangan
              </label>
              <input
                type="text"
                value={signatoryRole}
                onChange={e => setSignatoryRole(e.target.value)}
                placeholder="Contoh: Pimpinan / Penanggung Jawab Keuangan"
                className="w-full px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-6 border-t border-gray-200">
            {/* Tanda Tangan */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <span className="block text-sm font-bold text-gray-800 mb-2">Upload Gambar Tanda Tangan</span>
              <p className="text-xs text-gray-500 mb-3">Format PNG/JPG transparan direkomendasikan. Maks 2MB.</p>

              {signatorySignatureUrl ? (
                <div className="relative border border-gray-300 rounded-lg bg-white p-3 flex flex-col items-center mb-3">
                  <img
                    src={signatorySignatureUrl}
                    alt="Tanda Tangan"
                    className="h-24 object-contain max-w-full"
                  />
                  <button
                    type="button"
                    onClick={() => setSignatorySignatureUrl(null)}
                    className="mt-2 text-xs text-red-600 hover:text-red-700 font-medium"
                  >
                    Hapus Gambar Tanda Tangan
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-white mb-3">
                  <PhotoIcon className="w-8 h-8 text-gray-400 mx-auto mb-1" />
                  <span className="text-xs text-gray-500">Belum ada tanda tangan diunggah</span>
                </div>
              )}

              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={e => handleFileUpload(e, 'signature')}
                className="block w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>

            {/* Stempel */}
            <div className="p-4 bg-gray-50 border border-gray-200 rounded-xl">
              <span className="block text-sm font-bold text-gray-800 mb-2">Upload Gambar Stempel Perusahaan</span>
              <p className="text-xs text-gray-500 mb-3">Format PNG transparan direkomendasikan. Maks 2MB.</p>

              {companyStampUrl ? (
                <div className="relative border border-gray-300 rounded-lg bg-white p-3 flex flex-col items-center mb-3">
                  <img
                    src={companyStampUrl}
                    alt="Stempel Perusahaan"
                    className="h-24 object-contain max-w-full"
                  />
                  <button
                    type="button"
                    onClick={() => setCompanyStampUrl(null)}
                    className="mt-2 text-xs text-red-600 hover:text-red-700 font-medium"
                  >
                    Hapus Gambar Stempel
                  </button>
                </div>
              ) : (
                <div className="border-2 border-dashed border-gray-300 rounded-lg p-6 text-center bg-white mb-3">
                  <PhotoIcon className="w-8 h-8 text-gray-400 mx-auto mb-1" />
                  <span className="text-xs text-gray-500">Belum ada stempel diunggah</span>
                </div>
              )}

              <input
                type="file"
                accept="image/png, image/jpeg, image/webp"
                onChange={e => handleFileUpload(e, 'stamp')}
                className="block w-full text-xs text-gray-500 file:mr-3 file:py-2 file:px-3 file:rounded-md file:border-0 file:text-xs file:font-semibold file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
              />
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SYARAT & KETENTUAN */}
      {activeTab === 'terms' && (
        <div className="bg-white rounded-xl border border-gray-200 p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                <DocumentCheckIcon className="w-5 h-5 text-blue-600" />
                Daftar Syarat & Ketentuan Invoice
              </h2>
              <p className="text-sm text-gray-500">
                Poin-poin ini otomatis disalin ke invoice baru dan tersimpan dalam snapshot permanen.
              </p>
            </div>
          </div>

          {/* Add new term input */}
          <div className="flex gap-2 mb-6">
            <input
              type="text"
              value={newTermText}
              onChange={e => setNewTermText(e.target.value)}
              placeholder="Ketik syarat atau ketentuan baru..."
              className="flex-1 px-3.5 py-2.5 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              onKeyDown={e => e.key === 'Enter' && handleAddTerm()}
            />
            <button
              type="button"
              onClick={handleAddTerm}
              className="px-4 py-2.5 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg text-sm flex items-center gap-1.5 transition-colors"
            >
              <PlusIcon className="w-4 h-4" />
              <span>Tambah</span>
            </button>
          </div>

          {/* List of terms */}
          <div className="space-y-3">
            {terms.length === 0 ? (
              <div className="text-center py-8 text-gray-500 text-sm border-2 border-dashed border-gray-200 rounded-lg">
                Belum ada syarat & ketentuan yang ditambahkan.
              </div>
            ) : (
              terms.map((term, index) => (
                <div
                  key={term.id}
                  className="flex items-center justify-between p-3.5 bg-gray-50 border border-gray-200 rounded-lg hover:border-gray-300 transition-colors"
                >
                  <div className="flex items-start gap-3 flex-1">
                    <span className="w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-bold flex-shrink-0 mt-0.5">
                      {index + 1}
                    </span>

                    {editingTermId === term.id ? (
                      <div className="flex-1 flex gap-2">
                        <input
                          type="text"
                          value={editingTermText}
                          onChange={e => setEditingTermText(e.target.value)}
                          className="flex-1 px-3 py-1.5 border border-blue-400 rounded-md text-sm bg-white"
                          onKeyDown={e => e.key === 'Enter' && handleUpdateTerm(term.id)}
                        />
                        <button
                          onClick={() => handleUpdateTerm(term.id)}
                          className="px-3 py-1 bg-green-600 text-white rounded text-xs font-medium"
                        >
                          Simpan
                        </button>
                        <button
                          onClick={() => {
                            setEditingTermId(null);
                            setEditingTermText('');
                          }}
                          className="px-3 py-1 bg-gray-300 text-gray-700 rounded text-xs font-medium"
                        >
                          Batal
                        </button>
                      </div>
                    ) : (
                      <span className="text-sm text-gray-800 leading-relaxed font-normal">
                        {term.term_text}
                      </span>
                    )}
                  </div>

                  {editingTermId !== term.id && (
                    <div className="flex items-center gap-1 ml-3 flex-shrink-0">
                      <button
                        onClick={() => {
                          setEditingTermId(term.id);
                          setEditingTermText(term.term_text);
                        }}
                        className="p-1.5 text-gray-500 hover:text-blue-600 hover:bg-blue-50 rounded"
                        title="Edit Syarat"
                      >
                        <PencilSquareIcon className="w-4 h-4" />
                      </button>
                      <button
                        onClick={() => handleDeleteTerm(term.id)}
                        className="p-1.5 text-gray-500 hover:text-red-600 hover:bg-red-50 rounded"
                        title="Hapus Syarat"
                      >
                        <TrashIcon className="w-4 h-4" />
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </div>
      )}

      {/* TAB 5: LIVE PREVIEW A4 */}
      {activeTab === 'preview' && (
        <div className="bg-white rounded-xl border border-gray-200 p-8 shadow-sm">
          <div className="mb-4 pb-3 border-b border-gray-200 flex justify-between items-center">
            <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
              <PhotoIcon className="w-5 h-5 text-blue-600" />
              Preview Tampilan Invoice A4 (Master Template)
            </h2>
            <span className="text-xs bg-blue-50 text-blue-700 px-2.5 py-1 rounded-full font-semibold">
              Format Standar A4
            </span>
          </div>

          {/* Mock A4 Paper Container */}
          <div className="max-w-3xl mx-auto bg-white border border-gray-300 rounded-lg p-8 shadow-md font-sans text-gray-800">
            {/* Header */}
            <div className="flex justify-between items-start border-b-2 border-gray-800 pb-5 mb-6">
              <div className="flex items-start gap-4">
                {companyLogoUrl && (
                  <img
                    src={companyLogoUrl}
                    alt="Logo Perusahaan"
                    className="h-16 max-w-[120px] object-contain rounded"
                  />
                )}
                <div>
                  <h1 className="text-2xl font-black text-gray-950 tracking-wider">
                    {companyName || 'NAMA PERUSAHAAN'}
                  </h1>
                  {companyLegalName && (
                    <p className="text-xs font-semibold text-gray-600 tracking-wide mt-0.5">
                      {companyLegalName}
                    </p>
                  )}
                  {companyAddress && (
                    <p className="text-xs text-gray-600 max-w-sm mt-1 leading-relaxed">
                      {companyAddress}
                    </p>
                  )}
                  <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-gray-600 mt-2 font-medium">
                    {companyWhatsapp && <span>WA: {companyWhatsapp}</span>}
                    {companyPhone && <span>Telp: {companyPhone}</span>}
                    {companyEmail && <span>Email: {companyEmail}</span>}
                    {companyWebsite && <span>Web: {companyWebsite}</span>}
                    {nib && <span>NIB: {nib}</span>}
                    {npwp && <span>NPWP: {npwp}</span>}
                  </div>
                </div>
              </div>

              <div className="text-right">
                <span className="inline-block px-3 py-1 bg-gray-900 text-white font-bold text-xs uppercase tracking-widest rounded">
                  INVOICE
                </span>
                <p className="text-xs font-mono font-semibold text-gray-700 mt-2">INV-2026-0001</p>
                <p className="text-xs text-gray-500 mt-1">Tanggal: 01/01/2026</p>
              </div>
            </div>

            {/* Bank details box */}
            <div className="bg-blue-50/70 border border-blue-200 rounded-lg p-4 mb-6">
              <span className="block text-xs font-bold text-blue-900 uppercase tracking-wider mb-2">
                Informasi Pembayaran / Rekening Bank:
              </span>
              {bankName && bankAccountNumber ? (
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <div>
                    <span className="text-gray-500">Bank:</span>{' '}
                    <strong className="text-gray-900">{bankName}</strong>
                  </div>
                  <div>
                    <span className="text-gray-500">No. Rekening:</span>{' '}
                    <strong className="font-mono text-gray-900 text-sm">{bankAccountNumber}</strong>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-500">Atas Nama:</span>{' '}
                    <strong className="text-gray-900">{bankAccountHolder || companyName}</strong>
                  </div>
                </div>
              ) : (
                <div className="text-xs text-gray-500 italic">
                  Rekening bank resmi belum dikonfigurasi oleh Admin.
                </div>
              )}
            </div>

            {/* Terms section */}
            <div className="border border-gray-200 rounded-lg p-4 mb-6 bg-gray-50/50">
              <span className="block text-xs font-bold text-gray-800 uppercase tracking-wider mb-2">
                Syarat & Ketentuan:
              </span>
              {terms.length > 0 ? (
                <ol className="list-decimal list-inside space-y-1 text-xs text-gray-700 leading-relaxed">
                  {terms.map(t => (
                    <li key={t.id}>{t.term_text}</li>
                  ))}
                </ol>
              ) : (
                <p className="text-xs text-gray-400 italic">Belum ada syarat dan ketentuan yang diatur.</p>
              )}
            </div>

            {/* Signature & Stamp Section */}
            {(signatoryName || signatorySignatureUrl || companyStampUrl) ? (
              <div className="flex justify-end pt-4">
                <div className="text-center w-56">
                  <p className="text-xs text-gray-600 mb-1">Hormat Kami,</p>
                  <p className="text-xs font-bold text-gray-900">{companyName || 'Perusahaan'}</p>

                  {/* Stamped & Signed Area */}
                  <div className="relative h-24 my-2 flex items-center justify-center">
                    {signatorySignatureUrl && (
                      <img
                        src={signatorySignatureUrl}
                        alt="Signature"
                        className="absolute max-h-20 max-w-[140px] object-contain z-10"
                      />
                    )}
                    {companyStampUrl && (
                      <img
                        src={companyStampUrl}
                        alt="Stamp"
                        className="absolute max-h-20 max-w-[140px] object-contain opacity-85 pointer-events-none"
                      />
                    )}
                  </div>

                  {signatoryName && (
                    <p className="text-xs font-bold text-gray-900 underline">
                      {signatoryName}
                    </p>
                  )}
                  {signatoryRole && (
                    <p className="text-[11px] text-gray-500">
                      {signatoryRole}
                    </p>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-right pt-4 text-xs text-gray-400 italic">
                (Tanda tangan resmi belum dikonfigurasi)
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
