import React, { useState, useEffect } from 'react';
import { Customer, WhatsAppTemplate, CustomerStatus } from '../../types/index.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { apiRequest } from '../../api/client.js';
import {
  X,
  PhoneCall,
  ExternalLink,
  CheckSquare,
  Clock,
  Sparkles,
  MessageSquare,
  CheckCircle2,
} from 'lucide-react';

interface FollowUpActionModalProps {
  isOpen: boolean;
  customer: Customer | null;
  templates: WhatsAppTemplate[];
  statuses: CustomerStatus[];
  onClose: () => void;
  onSuccess: () => void;
}

export const FollowUpActionModal: React.FC<FollowUpActionModalProps> = ({
  isOpen,
  customer,
  templates,
  statuses,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
  const [customProduct, setCustomProduct] = useState('seragam kemeja/kaos konveksi');
  const [message, setMessage] = useState('');
  const [channel, setChannel] = useState<'WHATSAPP' | 'PHONE' | 'EMAIL' | 'MEETING' | 'OTHER'>('WHATSAPP');
  const [resultStatus, setResultStatus] = useState('Masih Pertimbangan');
  const [notes, setNotes] = useState('');
  const [newStatusId, setNewStatusId] = useState<number>(0);
  const [advanceStep, setAdvanceStep] = useState(true);
  const [customNextDate, setCustomNextDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasOpenedWhatsApp, setHasOpenedWhatsApp] = useState(false);

  useEffect(() => {
    if (customer && isOpen) {
      setNewStatusId(customer.status_id);
      setCustomProduct('seragam kemeja / polo shirt');
      setNotes('');
      setResultStatus('Masih Pertimbangan');
      setCustomNextDate('');
      setAdvanceStep(true);
      setHasOpenedWhatsApp(false);

      const defaultTpl = templates.find(t => t.is_active);
      if (defaultTpl) {
        setSelectedTemplateId(String(defaultTpl.id));
        applyTemplateVariables(defaultTpl.content, 'seragam kemeja / polo shirt');
      } else {
        setMessage(`Halo Bapak/Ibu ${customer.name}, salam dari Captain Konveksi. Izin follow-up pesanan konveksi.`);
      }
    }
  }, [customer, isOpen, templates]);

  if (!isOpen || !customer) return null;

  const applyTemplateVariables = (tplContent: string, productVal: string) => {
    const todayFormatted = new Date().toLocaleDateString('id-ID', {
      day: 'numeric',
      month: 'long',
      year: 'numeric',
    });

    const parsed = tplContent
      .split('{{nama_customer}}').join(customer.name || customer.pic_name || 'Bapak/Ibu')
      .split('{{perusahaan}}').join(customer.company_name || '-')
      .split('{{nama_sales}}').join(user?.name || 'Captain Konveksi')
      .split('{{produk}}').join(productVal || 'pesanan konveksi')
      .split('{{tanggal}}').join(todayFormatted);

    setMessage(parsed);
  };

  const handleTemplateChange = (tplIdStr: string) => {
    setSelectedTemplateId(tplIdStr);
    if (!tplIdStr) return;
    const tpl = templates.find(t => t.id === parseInt(tplIdStr, 10));
    if (tpl) {
      applyTemplateVariables(tpl.content, customProduct);
    }
  };

  const handleProductChange = (prodVal: string) => {
    setCustomProduct(prodVal);
    const tpl = templates.find(t => t.id === parseInt(selectedTemplateId, 10));
    if (tpl) {
      applyTemplateVariables(tpl.content, prodVal);
    }
  };

  const cleanPhone = (phone: string) => {
    let cleaned = phone.replace(/[^0-9]/g, '');
    if (cleaned.startsWith('0')) cleaned = '62' + cleaned.substring(1);
    if (cleaned.startsWith('8')) cleaned = '62' + cleaned;
    return cleaned;
  };

  const waLink = `https://wa.me/${cleanPhone(customer.whatsapp_number)}?text=${encodeURIComponent(message)}`;

  const handleOpenWhatsApp = () => {
    setHasOpenedWhatsApp(true);
    window.open(waLink, '_blank', 'noopener,noreferrer');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!resultStatus.trim()) {
      showToast('Status hasil follow-up wajib dipilih.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest<{ success: boolean; message: string }>('/follow-ups/activities', {
        method: 'POST',
        body: JSON.stringify({
          customer_id: customer.id,
          channel,
          template_id: selectedTemplateId ? parseInt(selectedTemplateId, 10) : null,
          message_sent: message,
          result_status: resultStatus,
          notes,
          new_status_id: newStatusId !== customer.status_id ? newStatusId : undefined,
          custom_next_date: customNextDate || undefined,
          advance_step: advanceStep,
        }),
      });

      showToast(res.message || 'Aktivitas follow-up berhasil dicatat & customer diperbarui.', 'success');
      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan follow-up.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-900/70 backdrop-blur-xs">
      <div className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[94vh] sm:max-h-[88vh] animate-in slide-in-from-bottom-4 sm:fade-in duration-200">
        {/* Sticky Header */}
        <div className="px-4 sm:px-6 py-3 border-b border-neutral-800 bg-neutral-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center text-emerald-400 shrink-0">
              <PhoneCall className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-sm sm:text-base font-bold tracking-tight truncate">
                Follow-Up: {customer.name}
              </h2>
              <p className="text-[11px] text-neutral-400 truncate">
                {customer.company_name || 'Personal'} · WA: <span className="font-mono text-emerald-400 font-semibold">{customer.whatsapp_number}</span>
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-neutral-400 hover:text-white active:bg-neutral-800 rounded-xl"
            aria-label="Tutup"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body: 5-Step Mobile Follow-Up Flow */}
        <form onSubmit={handleSubmit} id="followup-form" className="flex-1 p-4 sm:p-6 space-y-4 overflow-y-auto">
          {/* STEP 1: PILIH TEMPLATE & PESAN */}
          <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <span className="w-5 h-5 rounded-full bg-neutral-900 text-white text-[11px] font-bold flex items-center justify-center">1</span>
                <span>PILIH TEMPLATE & PESAN</span>
              </span>
              <span className="text-[10px] text-neutral-500">Otomatis terisi</span>
            </div>

            {/* Template Selection */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Pilih Template WhatsApp</label>
              <select
                value={selectedTemplateId}
                onChange={e => handleTemplateChange(e.target.value)}
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] bg-white"
              >
                <option value="">-- Buat Pesan Kustom --</option>
                {templates.filter(t => t.is_active).map(t => (
                  <option key={t.id} value={t.id}>
                    {t.title}
                  </option>
                ))}
              </select>
            </div>

            {/* Custom Product Variable */}
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Kebutuhan Produk (<code className="text-amber-800 font-mono text-[11px]">&#123;&#123;produk&#125;&#125;</code>)
              </label>
              <input
                type="text"
                value={customProduct}
                onChange={e => handleProductChange(e.target.value)}
                placeholder="Contoh: 150 pcs Polo Shirt Lacoste CVC..."
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] bg-white"
              />
            </div>

            {/* Message Preview & Direct Edit */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="block text-xs font-semibold text-neutral-700">Preview & Edit Teks Pesan</label>
                <span className="text-[10px] text-neutral-400">Dapat disunting bebas</span>
              </div>
              <textarea
                rows={4}
                value={message}
                onChange={e => setMessage(e.target.value)}
                className="w-full p-3 text-xs sm:text-sm font-mono border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] leading-relaxed bg-white"
              />
            </div>
          </div>

          {/* STEP 2: OPEN WHATSAPP (Unmissable Giant Button for Owner) */}
          <div className="p-3.5 bg-emerald-50/90 border-2 border-emerald-400 rounded-2xl space-y-2.5 shadow-2xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-emerald-950 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <span className="w-5 h-5 rounded-full bg-emerald-600 text-white text-[11px] font-bold flex items-center justify-center">2</span>
                <span>BUKA WHATSAPP CUSTOMER</span>
              </span>
              {hasOpenedWhatsApp && (
                <span className="text-[10px] font-bold text-emerald-700 bg-emerald-100 px-2 py-0.5 rounded-full flex items-center gap-1">
                  <CheckCircle2 className="w-3 h-3" /> WA Sudah Dibuka
                </span>
              )}
            </div>

            <p className="text-[11px] text-emerald-900 leading-tight">
              Klik tombol hijau di bawah untuk membuka aplikasi WhatsApp. Pesan sudah diprefill (terisi otomatis), Anda tinggal menekan kirim di WhatsApp.
            </p>

            <button
              type="button"
              onClick={handleOpenWhatsApp}
              className="w-full min-h-[50px] px-5 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-xl text-sm font-bold shadow-md flex items-center justify-center gap-2.5 transition-all active:scale-98"
            >
              <ExternalLink className="w-5 h-5" />
              <span>BUKA WHATSAPP SEKARANG</span>
            </button>
          </div>

          {/* STEP 3: CATAT HASIL FOLLOW-UP & UPDATE CRM */}
          <div className="p-3.5 bg-neutral-50 rounded-2xl border border-neutral-200 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold text-neutral-900 uppercase tracking-wider flex items-center gap-1.5 font-mono">
                <span className="w-5 h-5 rounded-full bg-neutral-900 text-white text-[11px] font-bold flex items-center justify-center">3</span>
                <span>CATAT HASIL & UPDATE CRM</span>
              </span>
              <span className="text-[10px] text-neutral-500">Wajib diisi</span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">
                  Hasil Respon Customer <span className="text-rose-500">*</span>
                </label>
                <select
                  required
                  value={resultStatus}
                  onChange={e => {
                    const val = e.target.value;
                    setResultStatus(val);
                    if (val.includes('Deal')) {
                      const dealStatus = statuses.find(s => s.code === 'CLOSING');
                      if (dealStatus) setNewStatusId(dealStatus.id);
                    }
                  }}
                  className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] bg-white"
                >
                  <option value="Masih Pertimbangan">Masih Pertimbangan</option>
                  <option value="Deal / Closing (Customer)">Deal / Closing (Customer)</option>
                  <option value="Minta Sampel Kain / Mockup">Minta Sampel Kain / Mockup</option>
                  <option value="Minta Penawaran Revisi">Minta Penawaran Revisi</option>
                  <option value="Tawaran Ditolak / Batal">Tawaran Ditolak / Batal</option>
                  <option value="Tidak Ada Balasan / Centang 1">Tidak Ada Balasan / Centang 1</option>
                  <option value="Minta Dihubungi Kembali Nanti">Minta Dihubungi Kembali Nanti</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-neutral-700 mb-1">Update Status Customer</label>
                <select
                  value={newStatusId}
                  onChange={e => setNewStatusId(parseInt(e.target.value, 10))}
                  className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] bg-white"
                >
                  {statuses.map(s => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Catatan Tambahan Sales</label>
              <input
                type="text"
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Misal: Customer minta sampel warna navy & bordir logo dada..."
                className="w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] bg-white"
              />
            </div>

            {/* Follow-up Next Step Options */}
            <div className="p-3 bg-white rounded-xl border border-neutral-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-neutral-800 flex items-center gap-1.5 font-mono">
                  <Clock className="w-3.5 h-3.5 text-[#c5a059] shrink-0" />
                  Jadwal Follow-Up Berikutnya
                </span>
                <span className="text-[11px] text-neutral-500 font-mono">
                  Saat ini: <strong>Step {customer.current_rule_step || 1}</strong>
                </span>
              </div>

              <label className="flex items-center gap-2 text-xs text-neutral-700 cursor-pointer pt-1 min-h-[38px]">
                <input
                  type="checkbox"
                  checked={advanceStep}
                  onChange={e => setAdvanceStep(e.target.checked)}
                  className="w-4 h-4 rounded text-neutral-900 focus:ring-[#c5a059]"
                />
                <span>Lanjut ke step follow-up berikutnya secara otomatis</span>
              </label>

              <div className="flex flex-col sm:flex-row sm:items-center gap-1.5 pt-1 text-xs">
                <span className="text-neutral-500 text-[11px]">Tanggal kustom (opsional):</span>
                <input
                  type="date"
                  value={customNextDate}
                  onChange={e => setCustomNextDate(e.target.value)}
                  className="min-h-[40px] px-2.5 py-1 text-xs border border-neutral-300 rounded-lg bg-white font-mono"
                />
              </div>
            </div>
          </div>
        </form>

        {/* Sticky Footer */}
        <div className="px-4 sm:px-6 py-3 border-t border-neutral-200 bg-white flex items-center justify-end gap-2 shrink-0 shadow-lg safe-area-bottom">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 sm:flex-initial min-h-[46px] px-4 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 active:bg-neutral-100 transition-colors"
          >
            Batal
          </button>
          <button
            type="submit"
            form="followup-form"
            disabled={isSubmitting}
            className="flex-1 sm:flex-initial min-h-[46px] px-5 py-2.5 text-xs sm:text-sm font-bold text-[#c5a059] bg-neutral-900 hover:bg-neutral-800 active:bg-black rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-2 border border-[#c5a059]/40"
          >
            <CheckSquare className="w-4 h-4 text-[#c5a059]" />
            <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Aktivitas CRM'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
