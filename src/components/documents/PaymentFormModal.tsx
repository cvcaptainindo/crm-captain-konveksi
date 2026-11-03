import React, { useState } from 'react';
import { SalesDocument } from '../../types/index.js';
import { useToast } from '../../contexts/ToastContext.js';
import { apiRequest } from '../../api/client.js';
import { X, DollarSign, Calendar, CreditCard, FileText, CheckCircle2 } from 'lucide-react';

interface PaymentFormModalProps {
  isOpen: boolean;
  document: SalesDocument | null;
  onClose: () => void;
  onSuccess: () => void;
}

export const PaymentFormModal: React.FC<PaymentFormModalProps> = ({
  isOpen,
  document,
  onClose,
  onSuccess,
}) => {
  const { showToast } = useToast();
  const todayStr = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];

  const [paymentDate, setPaymentDate] = useState(todayStr);
  const [amount, setAmount] = useState<number | string>('');
  const [paymentMethod, setPaymentMethod] = useState('TRANSFER');
  const [referenceNumber, setReferenceNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!isOpen || !document) return null;

  const totalAmount = Number(document.total_amount) || 0;
  const paidAmount = Number(document.paid_amount) || 0;
  const remainingBalance = Math.max(0, Math.round((totalAmount - paidAmount) * 100) / 100);

  const handleQuickPayFull = () => {
    setAmount(remainingBalance);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount <= 0) {
      showToast('Nominal pembayaran harus lebih besar dari 0.', 'error');
      return;
    }

    if (!paymentDate) {
      showToast('Tanggal pembayaran wajib diisi.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await apiRequest(`/documents/${document.id}/payments`, {
        method: 'POST',
        body: JSON.stringify({
          amount: numAmount,
          payment_date: paymentDate,
          payment_method: paymentMethod,
          reference_number: referenceNumber.trim() || null,
          notes: notes.trim() || null,
        }),
      });

      if (res.success) {
        showToast(
          `Pembayaran Rp ${numAmount.toLocaleString('id-ID')} berhasil dicatat!`,
          'success'
        );
        onSuccess();
        onClose();
      } else {
        showToast(res.message || 'Gagal mencatat pembayaran.', 'error');
      }
    } catch (err: any) {
      showToast(err.message || 'Terjadi kesalahan sistem saat mencatat pembayaran.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-neutral-950/75 backdrop-blur-xs">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="px-5 py-4 bg-neutral-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 border border-emerald-500/30 flex items-center justify-center">
              <DollarSign className="w-4 h-4 text-emerald-400" />
            </div>
            <div>
              <h3 className="text-sm font-bold">Catat Pembayaran Invoice</h3>
              <p className="text-[11px] text-neutral-400 font-mono">#{document.doc_number}</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-neutral-400 hover:text-white rounded-lg hover:bg-neutral-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Invoice Summary Box */}
        <div className="p-4 bg-neutral-50 border-b border-neutral-200 grid grid-cols-3 gap-2 text-center text-xs">
          <div className="p-2.5 bg-white rounded-xl border border-neutral-200 shadow-2xs">
            <span className="text-[10px] text-neutral-400 uppercase font-bold block">Total Tagihan</span>
            <span className="font-mono font-bold text-neutral-900 mt-0.5 block">
              Rp {totalAmount.toLocaleString('id-ID')}
            </span>
          </div>

          <div className="p-2.5 bg-white rounded-xl border border-neutral-200 shadow-2xs">
            <span className="text-[10px] text-neutral-400 uppercase font-bold block">Sudah Dibayar</span>
            <span className="font-mono font-bold text-emerald-600 mt-0.5 block">
              Rp {paidAmount.toLocaleString('id-ID')}
            </span>
          </div>

          <div className="p-2.5 bg-white rounded-xl border border-neutral-200 shadow-2xs">
            <span className="text-[10px] text-neutral-400 uppercase font-bold block">Sisa Tagihan</span>
            <span className="font-mono font-black text-rose-600 mt-0.5 block">
              Rp {remainingBalance.toLocaleString('id-ID')}
            </span>
          </div>
        </div>

        {/* Payment Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-bold text-neutral-800">
                Nominal Pembayaran (Rp) <span className="text-rose-500">*</span>
              </label>
              {remainingBalance > 0 && (
                <button
                  type="button"
                  onClick={handleQuickPayFull}
                  className="text-[11px] font-bold text-[#c5a059] hover:underline"
                >
                  Bayar Lunas (Rp {remainingBalance.toLocaleString('id-ID')})
                </button>
              )}
            </div>
            <div className="relative">
              <span className="absolute left-3 top-2.5 text-xs font-bold text-neutral-400">Rp</span>
              <input
                type="number"
                min="1"
                step="any"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder={String(remainingBalance)}
                className="w-full pl-9 pr-3 py-2 text-sm font-mono font-bold border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#c5a059] focus:border-transparent outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                Tanggal Pembayaran <span className="text-rose-500">*</span>
              </label>
              <input
                type="date"
                value={paymentDate}
                onChange={e => setPaymentDate(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#c5a059] focus:border-transparent outline-none font-mono"
                required
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-neutral-800 mb-1.5">
                Metode Pembayaran
              </label>
              <select
                value={paymentMethod}
                onChange={e => setPaymentMethod(e.target.value)}
                className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#c5a059] focus:border-transparent outline-none"
              >
                <option value="TRANSFER">Transfer Bank</option>
                <option value="CASH">Tunai (Cash)</option>
                <option value="GIRO">Giro / Cek</option>
                <option value="QRIS">QRIS</option>
                <option value="OTHER">Lainnya</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              Nomor Referensi / Bukti Transfer
            </label>
            <input
              type="text"
              value={referenceNumber}
              onChange={e => setReferenceNumber(e.target.value)}
              placeholder="Contoh: TRF-BCA-981729 atau No. Bukti Setor"
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#c5a059] focus:border-transparent outline-none"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-neutral-800 mb-1.5">
              Catatan Pembayaran (Opsional)
            </label>
            <textarea
              rows={2}
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Contoh: DP 50% produksi seragam PDH"
              className="w-full px-3 py-2 text-xs border border-neutral-300 rounded-xl focus:ring-2 focus:ring-[#c5a059] focus:border-transparent outline-none resize-none"
            />
          </div>

          <div className="flex items-center justify-end gap-2 pt-3 border-t border-neutral-100">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-neutral-100 hover:bg-neutral-200 rounded-xl transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-bold text-white bg-emerald-600 hover:bg-emerald-700 rounded-xl flex items-center gap-1.5 transition-colors shadow-xs disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{isSubmitting ? 'Menyimpan...' : 'Simpan Pembayaran'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
