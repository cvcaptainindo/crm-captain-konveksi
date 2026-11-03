import React, { useState, useEffect } from 'react';
import { Customer, SalesDocument, SalesDocumentItem, DocType } from '../../types/index.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { apiRequest } from '../../api/client.js';
import {
  X,
  Plus,
  Trash2,
  FileText,
  Calculator,
  Calendar,
  AlertCircle,
  CheckCircle,
} from 'lucide-react';

interface DocumentFormModalProps {
  isOpen: boolean;
  docType: DocType;
  customer: Customer;
  editingDoc?: SalesDocument | null;
  onClose: () => void;
  onSuccess: () => void;
}

interface FormItem {
  product_name: string;
  quantity: number | string;
  unit: string;
  unit_price: number | string;
  notes?: string;
}

const COMMON_UNITS = ['Meter', 'Pcs', 'Roll', 'Lusin', 'Set', 'Kg', 'Yard', 'Paket'];

export const DocumentFormModal: React.FC<DocumentFormModalProps> = ({
  isOpen,
  docType,
  customer,
  editingDoc,
  onClose,
  onSuccess,
}) => {
  const { user } = useAuth();
  const { showToast } = useToast();

  const todayStr = new Date(Date.now() + 7 * 60 * 60 * 1000).toISOString().split('T')[0];
  const [docDate, setDocDate] = useState(todayStr);
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState<'DRAFT' | 'SENT'>('DRAFT');
  const [notes, setNotes] = useState('');
  const [terms, setTerms] = useState(
    docType === 'QUOTATION'
      ? '1. Harga berlaku selama 14 hari sejak tanggal penawaran diterbitkan.\n2. Pembayaran DP 50% saat PO disetujui, pelunasan 50% sebelum barang dikirim.\n3. Waktu pengerjaan dihitung setelah approval sample & DP diterima.'
      : '1. Pembayaran ditransfer ke rekening resmi CV Captain Indo / Captain Konveksi.\n2. Bukti transfer mohon dikirimkan via WhatsApp kepada Sales bersangkutan.\n3. Barang yang sudah diterima tidak dapat dikembalikan kecuali terdapat cacat produksi.'
  );

  const [items, setItems] = useState<FormItem[]>([
    { product_name: '', quantity: 1, unit: 'Pcs', unit_price: 0, notes: '' },
  ]);
  const [discount, setDiscount] = useState<number | string>(0);
  const [tax, setTax] = useState<number | string>(0);
  const [docNumberPreview, setDocNumberPreview] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (isOpen) {
      if (editingDoc) {
        setDocDate(editingDoc.doc_date);
        setDueDate(editingDoc.due_date || '');
        setStatus((editingDoc.status as any) || 'DRAFT');
        setNotes(editingDoc.notes || '');
        setTerms(editingDoc.terms || '');
        setDiscount(editingDoc.discount || 0);
        setTax(editingDoc.tax || 0);
        setDocNumberPreview(editingDoc.doc_number);
        if (editingDoc.items && editingDoc.items.length > 0) {
          setItems(
            editingDoc.items.map(it => ({
              product_name: it.product_name,
              quantity: it.quantity,
              unit: it.unit || 'Pcs',
              unit_price: it.unit_price,
              notes: it.notes || '',
            }))
          );
        }
      } else {
        setDocDate(todayStr);
        setDueDate('');
        setStatus('DRAFT');
        setNotes('');
        setDiscount(0);
        setTax(0);
        setItems([{ product_name: '', quantity: 1, unit: 'Pcs', unit_price: 0, notes: '' }]);
        fetchDocNumberPreview(docType);
      }
    }
  }, [isOpen, editingDoc, docType]);

  const fetchDocNumberPreview = async (type: DocType) => {
    try {
      const res = await apiRequest(`/documents/preview-number?type=${type}`);
      if (res.success && res.doc_number) {
        setDocNumberPreview(res.doc_number);
      }
    } catch {
      setDocNumberPreview(type === 'QUOTATION' ? 'QUO-AUTO' : 'INV-AUTO');
    }
  };

  if (!isOpen) return null;

  // Add Item
  const handleAddItem = () => {
    setItems(prev => [
      ...prev,
      { product_name: '', quantity: 1, unit: 'Pcs', unit_price: 0, notes: '' },
    ]);
  };

  // Remove Item
  const handleRemoveItem = (index: number) => {
    if (items.length <= 1) {
      showToast('Dokumen wajib memiliki minimal satu baris produk.', 'error');
      return;
    }
    setItems(prev => prev.filter((_, idx) => idx !== index));
  };

  // Update Item field
  const handleItemChange = (index: number, field: keyof FormItem, val: any) => {
    setItems(prev => {
      const next = [...prev];
      next[index] = { ...next[index], [field]: val };
      return next;
    });
  };

  // Computations
  let subtotal = 0;
  let totalQty = 0;
  items.forEach(it => {
    const q = Number(it.quantity) || 0;
    const p = Number(it.unit_price) || 0;
    subtotal += q * p;
    totalQty += q;
  });

  const numDiscount = Math.max(0, Number(discount) || 0);
  const numTax = Math.max(0, Number(tax) || 0);
  const grandTotal = Math.max(0, subtotal - numDiscount + numTax);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Validations
    if (!docDate) {
      showToast('Tanggal dokumen wajib diisi.', 'error');
      return;
    }

    for (let i = 0; i < items.length; i++) {
      const it = items[i];
      if (!it.product_name.trim()) {
        showToast(`Baris #${i + 1}: Nama produk wajib diisi.`, 'error');
        return;
      }
      const q = Number(it.quantity);
      if (isNaN(q) || q <= 0) {
        showToast(`Baris #${i + 1}: Kuantitas harus lebih besar dari 0.`, 'error');
        return;
      }
      const p = Number(it.unit_price);
      if (isNaN(p) || p < 0) {
        showToast(`Baris #${i + 1}: Harga satuan tidak boleh negatif.`, 'error');
        return;
      }
    }

    if (numDiscount > subtotal) {
      showToast('Diskon tidak boleh melebihi subtotal.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        doc_type: docType,
        customer_id: customer.id,
        doc_date: docDate,
        due_date: dueDate || null,
        status,
        notes,
        terms,
        discount: numDiscount,
        tax: numTax,
        items: items.map(it => ({
          product_name: it.product_name.trim(),
          quantity: Number(it.quantity),
          unit: it.unit || 'Pcs',
          unit_price: Number(it.unit_price),
          notes: it.notes?.trim() || null,
        })),
      };

      if (editingDoc) {
        const res = await apiRequest(`/documents/${editingDoc.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        if (res.success) {
          showToast(`Dokumen #${editingDoc.doc_number} berhasil diperbarui.`, 'success');
          onSuccess();
          onClose();
        }
      } else {
        const res = await apiRequest('/documents', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (res.success) {
          showToast(
            `${docType === 'QUOTATION' ? 'Penawaran' : 'Invoice'} baru berhasil dibuat (${res.data?.doc_number || docNumberPreview}).`,
            'success'
          );
          onSuccess();
          onClose();
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan dokumen.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-neutral-950/70 backdrop-blur-xs overflow-y-auto">
      <div className="w-full max-w-4xl bg-white rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[94vh] animate-in fade-in duration-200">
        {/* Header */}
        <div className="px-5 py-3.5 bg-neutral-900 text-white flex items-center justify-between border-b border-neutral-800 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#c5a059]/20 text-[#c5a059] flex items-center justify-center font-bold">
              <FileText className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold tracking-tight">
                {editingDoc ? 'Edit' : 'Buat'}{' '}
                {docType === 'QUOTATION' ? 'Penawaran (Quotation)' : 'Invoice Penjualan'}
              </h2>
              <div className="text-[11px] text-neutral-400 font-mono">
                No. Dokumen: <span className="text-[#c5a059] font-bold">{docNumberPreview || 'Otomatis'}</span>
              </div>
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5">
          {/* Top Info Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3.5 bg-neutral-50 rounded-xl border border-neutral-200 text-xs">
            <div>
              <span className="text-neutral-500 block text-[11px]">Customer & Perusahaan:</span>
              <strong className="text-neutral-900 block truncate">{customer.name}</strong>
              <span className="text-neutral-600 block text-[11px] truncate">{customer.company_name || 'Personal'}</span>
              <span className="font-mono text-[10px] text-neutral-400">{customer.whatsapp_number}</span>
            </div>

            <div>
              <span className="text-neutral-500 block text-[11px]">Sales PIC Penanggung Jawab:</span>
              <strong className="text-neutral-900 block">{user?.name || '-'}</strong>
              <span className="text-neutral-500 text-[10px] font-mono">{user?.email}</span>
            </div>

            <div>
              <label className="text-neutral-500 block text-[11px] font-medium mb-1">
                Status Dokumen:
              </label>
              <select
                value={status}
                onChange={e => setStatus(e.target.value as any)}
                className="w-full text-xs font-semibold px-2.5 py-1.5 bg-white border border-neutral-300 rounded-lg focus:outline-hidden focus:ring-1 focus:ring-[#c5a059]"
              >
                <option value="DRAFT">DRAFT (Konsep)</option>
                <option value="SENT">SENT (Terkirim ke Customer)</option>
                {docType === 'QUOTATION' && <option value="APPROVED">APPROVED (Disetujui)</option>}
              </select>
            </div>
          </div>

          {/* Dates */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                <span>Tanggal Dokumen <strong className="text-rose-500">*</strong></span>
              </label>
              <input
                type="date"
                required
                value={docDate}
                onChange={e => setDocDate(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-neutral-300 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-[#c5a059]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1 flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                <span>{docType === 'QUOTATION' ? 'Masa Berlaku Hingga' : 'Jatuh Tempo (Due Date)'}</span>
              </label>
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                className="w-full text-xs px-3 py-2 bg-white border border-neutral-300 rounded-xl focus:outline-hidden focus:ring-1 focus:ring-[#c5a059]"
              />
            </div>
          </div>

          {/* Detail Produk Multi Item */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold text-neutral-900 flex items-center gap-1.5 uppercase tracking-wider font-mono">
                <Calculator className="w-3.5 h-3.5 text-neutral-600" />
                <span>Detail Produk ({items.length} Item)</span>
              </h3>
              <button
                type="button"
                onClick={handleAddItem}
                className="px-3 py-1.5 bg-[#c5a059]/15 hover:bg-[#c5a059]/25 text-neutral-900 border border-[#c5a059]/40 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors"
              >
                <Plus className="w-3.5 h-3.5 text-[#c5a059]" />
                <span>+ Tambah Produk</span>
              </button>
            </div>

            {/* Table of items */}
            <div className="overflow-x-auto border border-neutral-200 rounded-xl">
              <table className="w-full text-left text-xs">
                <thead className="text-[11px] text-neutral-500 uppercase bg-neutral-50/80 border-b border-neutral-200">
                  <tr>
                    <th className="py-2.5 px-3 w-8 text-center">#</th>
                    <th className="py-2.5 px-3 min-w-[200px]">Nama Produk / Spesifikasi</th>
                    <th className="py-2.5 px-3 w-24">Qty</th>
                    <th className="py-2.5 px-3 w-28">Satuan</th>
                    <th className="py-2.5 px-3 w-36">Harga Satuan (Rp)</th>
                    <th className="py-2.5 px-3 w-36 text-right">Subtotal (Rp)</th>
                    <th className="py-2.5 px-2 w-10 text-center">Aksi</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-100">
                  {items.map((item, idx) => {
                    const rowQty = Number(item.quantity) || 0;
                    const rowPrice = Number(item.unit_price) || 0;
                    const rowSubtotal = rowQty * rowPrice;

                    return (
                      <tr key={idx} className="hover:bg-neutral-50/60">
                        <td className="py-2 px-3 text-center text-neutral-400 font-mono text-[11px]">
                          {idx + 1}
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            required
                            placeholder="Contoh: Kemeja PDL Drill, Jaket Bomber..."
                            value={item.product_name}
                            onChange={e => handleItemChange(idx, 'product_name', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs focus:outline-hidden focus:border-[#c5a059]"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="0.01"
                            step="any"
                            required
                            value={item.quantity}
                            onChange={e => handleItemChange(idx, 'quantity', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-mono text-center focus:outline-hidden focus:border-[#c5a059]"
                          />
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="text"
                            list={`units-list-${idx}`}
                            value={item.unit}
                            onChange={e => handleItemChange(idx, 'unit', e.target.value)}
                            placeholder="Satuan"
                            className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs text-center focus:outline-hidden focus:border-[#c5a059]"
                          />
                          <datalist id={`units-list-${idx}`}>
                            {COMMON_UNITS.map(u => (
                              <option key={u} value={u} />
                            ))}
                          </datalist>
                        </td>
                        <td className="py-2 px-3">
                          <input
                            type="number"
                            min="0"
                            step="100"
                            required
                            value={item.unit_price}
                            onChange={e => handleItemChange(idx, 'unit_price', e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-neutral-200 rounded-lg text-xs font-mono text-right focus:outline-hidden focus:border-[#c5a059]"
                          />
                        </td>
                        <td className="py-2 px-3 text-right font-mono font-semibold text-neutral-900 whitespace-nowrap">
                          Rp {rowSubtotal.toLocaleString('id-ID')}
                        </td>
                        <td className="py-2 px-2 text-center">
                          <button
                            type="button"
                            onClick={() => handleRemoveItem(idx)}
                            disabled={items.length <= 1}
                            className={`p-1.5 rounded-lg text-neutral-400 transition-colors ${
                              items.length <= 1
                                ? 'opacity-30 cursor-not-allowed'
                                : 'hover:text-rose-600 hover:bg-rose-50'
                            }`}
                            title="Hapus baris produk"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Calculation Summary Box */}
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 p-3.5 bg-neutral-50/90 rounded-xl border border-neutral-200 text-xs">
              <div className="text-[11px] text-neutral-500 font-mono">
                Total Kuantitas: <strong className="text-neutral-900">{totalQty.toLocaleString('id-ID')} unit/satuan</strong>
              </div>

              <div className="w-full sm:w-72 space-y-1.5 font-mono text-[11px]">
                <div className="flex items-center justify-between">
                  <span className="text-neutral-500">Subtotal Produk:</span>
                  <strong className="text-neutral-900">Rp {subtotal.toLocaleString('id-ID')}</strong>
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500">Diskon (Rp):</span>
                  <input
                    type="number"
                    min="0"
                    value={discount}
                    onChange={e => setDiscount(e.target.value)}
                    className="w-28 px-2 py-0.5 text-right font-mono text-xs bg-white border border-neutral-300 rounded focus:outline-hidden focus:border-[#c5a059]"
                  />
                </div>

                <div className="flex items-center justify-between gap-2">
                  <span className="text-neutral-500">Pajak / PPN (Rp):</span>
                  <input
                    type="number"
                    min="0"
                    value={tax}
                    onChange={e => setTax(e.target.value)}
                    className="w-28 px-2 py-0.5 text-right font-mono text-xs bg-white border border-neutral-300 rounded focus:outline-hidden focus:border-[#c5a059]"
                  />
                </div>

                <div className="pt-1.5 border-t border-neutral-300 flex items-center justify-between text-xs sm:text-sm font-bold text-neutral-950">
                  <span>TOTAL DOKUMEN:</span>
                  <span className="text-[#c5a059] font-black text-sm sm:text-base">
                    Rp {grandTotal.toLocaleString('id-ID')}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Notes and Terms */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1">
                Catatan Tambahan (Opsional):
              </label>
              <textarea
                rows={3}
                placeholder="Catatan pesanan, detail bordir/sablon, packing..."
                value={notes}
                onChange={e => setNotes(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs focus:outline-hidden focus:ring-1 focus:ring-[#c5a059]"
              />
            </div>

            <div>
              <label className="block text-[11px] font-medium text-neutral-700 mb-1">
                Syarat & Ketentuan Pembayaran:
              </label>
              <textarea
                rows={3}
                value={terms}
                onChange={e => setTerms(e.target.value)}
                className="w-full px-3 py-2 bg-white border border-neutral-300 rounded-xl text-xs focus:outline-hidden focus:ring-1 focus:ring-[#c5a059]"
              />
            </div>
          </div>
        </form>

        {/* Modal Footer */}
        <div className="px-5 py-3 bg-neutral-100 border-t border-neutral-200 flex items-center justify-between shrink-0">
          <div className="text-[11px] text-neutral-500 font-mono hidden sm:block">
            {docType === 'QUOTATION'
              ? 'Penawaran tidak mempengaruhi laporan omzet sampai disetujui & menjadi Invoice Closing.'
              : 'Invoice yang belum berstatus CLOSING tidak dihitung dalam laporan omzet.'}
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-50 transition-colors"
            >
              Batal
            </button>

            <button
              type="button"
              onClick={handleSubmit}
              disabled={isSubmitting}
              className="px-5 py-2 bg-neutral-900 hover:bg-neutral-800 text-white rounded-xl text-xs font-bold shadow-xs flex items-center gap-1.5 transition-colors disabled:opacity-50"
            >
              {isSubmitting ? (
                <span>Menyimpan...</span>
              ) : (
                <>
                  <CheckCircle className="w-3.5 h-3.5 text-[#c5a059]" />
                  <span>Simpan {docType === 'QUOTATION' ? 'Penawaran' : 'Invoice'}</span>
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
