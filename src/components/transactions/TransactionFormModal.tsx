import React, { useState, useEffect } from 'react';
import { Transaction, Customer, User } from '../../types/index.js';
import { apiRequest } from '../../api/client.js';
import { useToast } from '../../contexts/ToastContext.js';
import { DollarSign, X, Calendar, ShoppingBag, FileText, CheckCircle2, AlertTriangle, Building2 } from 'lucide-react';

interface TransactionFormModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess: () => void;
  initialTransaction?: Transaction | null;
  preselectedCustomer?: Customer | null;
}

export const TransactionFormModal: React.FC<TransactionFormModalProps> = ({
  isOpen,
  onClose,
  onSuccess,
  initialTransaction,
  preselectedCustomer,
}) => {
  const { showToast } = useToast();

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [salesUsers, setSalesUsers] = useState<User[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>(
    preselectedCustomer?.id ? String(preselectedCustomer.id) :
    initialTransaction?.customer_id ? String(initialTransaction.customer_id) :
    initialTransaction?.customer_name_manual ? 'manual' : ''
  );
  const [manualCustomerName, setManualCustomerName] = useState(initialTransaction?.customer_name_manual || '');
  const [selectedSalesId, setSelectedSalesId] = useState<string>(
    preselectedCustomer?.assigned_sales_id ? String(preselectedCustomer.assigned_sales_id) :
    initialTransaction?.sales_id ? String(initialTransaction.sales_id) : ''
  );
  const [product, setProduct] = useState(initialTransaction?.product || '');
  const [description, setDescription] = useState(initialTransaction?.description || '');
  const [amount, setAmount] = useState<string>(
    initialTransaction ? String(initialTransaction.amount) : ''
  );
  const [status, setStatus] = useState<'CLOSING' | 'CANCEL'>(
    initialTransaction?.status || 'CLOSING'
  );
  const [transactionDate, setTransactionDate] = useState(
    initialTransaction?.transaction_date || new Date().toISOString().split('T')[0]
  );
  const [notes, setNotes] = useState(initialTransaction?.notes || '');
  const [updateCustomerStatus, setUpdateCustomerStatus] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (!isOpen) return;

    if (initialTransaction) {
      setSelectedCustomerId(
        initialTransaction.customer_id ? String(initialTransaction.customer_id) :
        initialTransaction.customer_name_manual ? 'manual' : ''
      );
      setManualCustomerName(initialTransaction.customer_name_manual || '');
      setSelectedSalesId(initialTransaction.sales_id ? String(initialTransaction.sales_id) : '');
      setProduct(initialTransaction.product);
      setDescription(initialTransaction.description || '');
      setAmount(String(initialTransaction.amount));
      setStatus(initialTransaction.status);
      setTransactionDate(initialTransaction.transaction_date);
      setNotes(initialTransaction.notes || '');
      return;
    }

    setSelectedCustomerId(preselectedCustomer?.id ? String(preselectedCustomer.id) : '');
    setManualCustomerName('');
    setSelectedSalesId(preselectedCustomer?.assigned_sales_id ? String(preselectedCustomer.assigned_sales_id) : '');
    setProduct('');
    setDescription('');
    setAmount('');
    setStatus('CLOSING');
    setTransactionDate(new Date().toISOString().split('T')[0]);
    setNotes('');

    const loadOptions = async () => {
      try {
        const requests: Promise<any>[] = [
          apiRequest<{ success: boolean; data: User[] }>('/users'),
        ];
        if (!preselectedCustomer) {
          requests.push(apiRequest<{ success: boolean; data: Customer[] }>('/customers?limit=100'));
        }
        const [usersResponse, customersResponse] = await Promise.all(requests);
        if (usersResponse.success) {
          setSalesUsers((usersResponse.data || []).filter((item: User) => item.role === 'SALES' && item.is_active));
        }
        if (!preselectedCustomer && customersResponse?.success) {
          const availableCustomers = customersResponse.data || [];
          setCustomers(availableCustomers);
        }
      } catch (err) {
        console.error('Gagal memuat opsi customer/Sales untuk transaksi.', err);
      }
    };

    loadOptions();
  }, [isOpen, initialTransaction, preselectedCustomer]);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!selectedCustomerId) {
      showToast('Pilih customer terdaftar, nama manual, atau tanpa customer.', 'error');
      return;
    }

    if (selectedCustomerId === 'manual' && !manualCustomerName.trim()) {
      showToast('Nama customer manual wajib diisi.', 'error');
      return;
    }

    if (manualCustomerName.trim().length > 120) {
      showToast('Nama customer maksimal 120 karakter.', 'error');
      return;
    }

    if (!product.trim()) {
      showToast('Nama produk / pesanan konveksi wajib diisi.', 'error');
      return;
    }

    const numericAmount = Number(amount);
    if (isNaN(numericAmount) || numericAmount < 0) {
      showToast('Nominal transaksi harus berupa angka positif.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      if (initialTransaction) {
        // Edit existing transaction
        const res = await apiRequest<{ success: boolean; message: string }>(
          `/transactions/${initialTransaction.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({
              product: product.trim(),
              description: description.trim(),
              amount: numericAmount,
              status,
              transaction_date: transactionDate,
              notes: notes.trim(),
            }),
          }
        );
        if (res.success) {
          showToast('Transaksi berhasil diperbarui.', 'success');
          onSuccess();
          onClose();
        }
      } else {
        // Create new transaction
        const res = await apiRequest<{ success: boolean; message: string }>(
          '/transactions',
          {
            method: 'POST',
            body: JSON.stringify({
              customer_id: selectedCustomerId !== 'manual' && selectedCustomerId !== 'none' ? Number(selectedCustomerId) : null,
              customer_name_manual: selectedCustomerId === 'manual' ? manualCustomerName.trim() : null,
              sales_id: selectedSalesId ? Number(selectedSalesId) : null,
              product: product.trim(),
              description: description.trim(),
              amount: numericAmount,
              status,
              transaction_date: transactionDate,
              notes: notes.trim(),
              update_customer_status: updateCustomerStatus,
            }),
          }
        );
        if (res.success) {
          showToast(res.message || 'Transaksi closing berhasil dicatat!', 'success');
          onSuccess();
          onClose();
        }
      }
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan transaksi.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-neutral-950/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-0 sm:p-4 overflow-y-auto safe-area-bottom">
      <div className="w-full sm:max-w-lg bg-white rounded-t-3xl sm:rounded-2xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden border border-neutral-200">
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-neutral-200 flex items-center justify-between shrink-0 bg-neutral-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold">
              <DollarSign className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-sm sm:text-base font-bold text-neutral-900 leading-tight">
                {initialTransaction ? 'Edit Transaksi / Closing' : 'Catat Transaksi / Closing Baru'}
              </h2>
              <p className="text-[11px] text-neutral-500">
                Pencatatan omzet deals konveksi tanpa menimpa histori
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-neutral-400 hover:text-neutral-600 active:bg-neutral-200"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-4">
          {/* Customer Selection */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Customer
            </label>
            {preselectedCustomer ? (
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs font-bold text-neutral-900">{preselectedCustomer.name}</div>
                  <div className="text-[11px] text-neutral-500">{preselectedCustomer.company_name || '-'}</div>
                </div>
                <span className="text-[10px] font-mono px-2 py-0.5 bg-neutral-200 text-neutral-700 rounded">
                  {preselectedCustomer.customer_code}
                </span>
              </div>
            ) : initialTransaction ? (
              <div className="p-3 bg-neutral-50 border border-neutral-200 rounded-xl">
                <div className="text-xs font-bold text-neutral-900">
                  {initialTransaction.customer_name || initialTransaction.customer_name_manual || 'Tanpa Customer'}
                </div>
                <div className="text-[11px] text-neutral-500">
                  {initialTransaction.company_name || '-'}
                </div>
              </div>
            ) : (
              <>
                <select
                  value={selectedCustomerId}
                  onChange={e => {
                    const value = e.target.value;
                    setSelectedCustomerId(value);
                    if (value === 'manual' || value === 'none' || !value) {
                      setSelectedSalesId('');
                    } else {
                      const customer = customers.find(item => item.id === Number(value));
                      setSelectedSalesId(customer?.assigned_sales_id ? String(customer.assigned_sales_id) : '');
                    }
                  }}
                  required
                  className="w-full min-h-[44px] px-3.5 py-2 text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] bg-white font-medium"
                >
                  <option value="">-- Pilih Opsi Customer --</option>
                  <option value="none">-- Tanpa Customer --</option>
                  <option value="manual">-- Gunakan Nama Customer Manual --</option>
                  {customers.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} {c.company_name ? `(${c.company_name})` : ''} - {c.customer_code}
                    </option>
                  ))}
                </select>
                {selectedCustomerId === 'manual' && (
                  <input
                    type="text"
                    required
                    maxLength={120}
                    value={manualCustomerName}
                    onChange={e => setManualCustomerName(e.target.value)}
                    placeholder="Masukkan nama customer"
                    className="w-full min-h-[44px] mt-2 px-3.5 py-2 text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] bg-white"
                  />
                )}
              </>
            )}
          </div>

          {!initialTransaction && (
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Sales PIC (Opsional)</label>
              <select
                value={selectedSalesId}
                onChange={e => setSelectedSalesId(e.target.value)}
                className="w-full min-h-[44px] px-3.5 py-2 text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] bg-white font-medium"
              >
                <option value="">-- Tanpa Sales PIC --</option>
                {salesUsers.map(sales => (
                  <option key={sales.id} value={sales.id}>{sales.name}</option>
                ))}
              </select>
            </div>
          )}

          {/* Status Selection (Closing vs Cancel) */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1.5">
              Status Transaksi
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setStatus('CLOSING')}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all ${
                  status === 'CLOSING'
                    ? 'bg-neutral-900 text-[#c5a059] border-[#c5a059]/50 shadow-2xs'
                    : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                <CheckCircle2 className={`w-4 h-4 ${status === 'CLOSING' ? 'text-[#c5a059]' : 'text-neutral-400'}`} />
                <span>Closing (Deal)</span>
              </button>

              <button
                type="button"
                onClick={() => setStatus('CANCEL')}
                className={`min-h-[44px] px-3 py-2 rounded-xl text-xs font-bold flex items-center justify-center gap-2 border transition-all ${
                  status === 'CANCEL'
                    ? 'bg-rose-50 text-rose-700 border-rose-300 shadow-2xs'
                    : 'bg-neutral-50 text-neutral-600 border-neutral-200 hover:bg-neutral-100'
                }`}
              >
                <AlertTriangle className={`w-4 h-4 ${status === 'CANCEL' ? 'text-rose-500' : 'text-neutral-400'}`} />
                <span>Batal / Cancel</span>
              </button>
            </div>
            {status === 'CANCEL' && (
              <p className="text-[11px] text-rose-600 mt-1">
                Catatan: Transaksi Cancel tidak akan dihitung ke dalam omzet closing.
              </p>
            )}
          </div>

          {/* Nominal Amount */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Nominal Transaksi (Rp) *
            </label>
            <div className="relative">
              <span className="absolute left-3.5 top-3 text-xs font-bold text-neutral-400">Rp</span>
              <input
                type="number"
                inputMode="numeric"
                required
                min="0"
                step="1000"
                value={amount}
                onChange={e => setAmount(e.target.value)}
                placeholder="Contoh: 25000000"
                className="w-full min-h-[46px] pl-11 pr-3 py-2.5 text-sm font-mono font-bold text-neutral-900 border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
              />
            </div>
            {amount && !isNaN(Number(amount)) && (
              <div className="text-[11px] text-neutral-500 mt-1 font-mono">
                Terbilang: Rp {Number(amount).toLocaleString('id-ID')}
              </div>
            )}
          </div>

          {/* Product Name */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Nama Produk / Rincian Pesanan *
            </label>
            <div className="relative">
              <ShoppingBag className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                required
                value={product}
                onChange={e => setProduct(e.target.value)}
                placeholder="Contoh: 150 pcs Polo Shirt Lacoste CVC 24s"
                className="w-full min-h-[44px] pl-10 pr-3 py-2 text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
              />
            </div>
          </div>

          {/* Transaction Date */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Tanggal Transaksi
            </label>
            <div className="relative">
              <Calendar className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
              <input
                type="date"
                required
                value={transactionDate}
                onChange={e => setTransactionDate(e.target.value)}
                className="w-full min-h-[44px] pl-10 pr-3 py-2 text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] font-mono"
              />
            </div>
          </div>

          {/* Description & Notes */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Deskripsi Singkat / Spesifikasi
            </label>
            <textarea
              rows={2}
              value={description}
              onChange={e => setDescription(e.target.value)}
              placeholder="Contoh: Bordir logo dada kiri dan punggung, deadline 2 minggu"
              className="w-full p-3 text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
            />
          </div>

          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">
              Catatan Internal
            </label>
            <input
              type="text"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              placeholder="Contoh: DP 50% sudah diterima via transfer BCA"
              className="w-full min-h-[44px] px-3.5 py-2 text-xs border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
            />
          </div>

          {!initialTransaction && selectedCustomerId !== '' && selectedCustomerId !== 'manual' && selectedCustomerId !== 'none' && status === 'CLOSING' && (
            <label className="flex items-center gap-2 p-3 bg-neutral-50 border border-neutral-200 rounded-xl cursor-pointer">
              <input
                type="checkbox"
                checked={updateCustomerStatus}
                onChange={e => setUpdateCustomerStatus(e.target.checked)}
                className="w-4 h-4 text-neutral-900 rounded border-neutral-300 focus:ring-[#c5a059]"
              />
              <span className="text-xs text-neutral-800 font-medium select-none">
                Otomatis update status Customer menjadi <strong>Closing (Deal)</strong>
              </span>
            </label>
          )}

          {/* Sticky Submit Bar */}
          <div className="pt-3 border-t border-neutral-100 flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 min-h-[46px] px-4 py-2 border border-neutral-300 bg-white hover:bg-neutral-50 text-neutral-700 rounded-xl text-xs font-semibold transition-colors"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex-1 min-h-[46px] px-4 py-2 bg-neutral-900 hover:bg-neutral-800 active:bg-black text-[#c5a059] border border-[#c5a059]/40 rounded-xl text-xs font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2 shadow-2xs"
            >
              <DollarSign className="w-4 h-4 text-[#c5a059]" />
              <span>{isSubmitting ? 'Menyimpan...' : initialTransaction ? 'Simpan Perubahan' : 'Simpan Transaksi'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
