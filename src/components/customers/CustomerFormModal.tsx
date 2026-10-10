import React, { useState, useEffect } from 'react';
import { Customer, CustomerStatus, User } from '../../types/index.js';
import { useAuth } from '../../contexts/AuthContext.js';
import { useToast } from '../../contexts/ToastContext.js';
import { apiRequest } from '../../api/client.js';
import { X, Plus, Trash2, Sliders, Check } from 'lucide-react';

interface CustomerFormModalProps {
  isOpen: boolean;
  customer?: Customer | null;
  statuses: CustomerStatus[];
  salesList: User[];
  onClose: () => void;
  onSuccess: () => void;
}

interface CustomRuleItem {
  step_number: number;
  interval_days: number;
}

export const CustomerFormModal: React.FC<CustomerFormModalProps> = ({
  isOpen,
  customer,
  statuses,
  salesList,
  onClose,
  onSuccess,
}) => {
  const { user, isAdmin } = useAuth();
  const { showToast } = useToast();
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    company_name: '',
    whatsapp_number: '',
    phone_number: '',
    email: '',
    address: '',
    city: '',
    pic_name: '',
    assigned_sales_id: user?.id || 1,
    status_id: 1,
    notes: '',
    use_custom_rule: false,
  });

  const [customRules, setCustomRules] = useState<CustomRuleItem[]>([
    { step_number: 1, interval_days: 3 },
    { step_number: 2, interval_days: 7 },
    { step_number: 3, interval_days: 14 },
  ]);

  useEffect(() => {
    if (customer) {
      setFormData({
        name: customer.name,
        company_name: customer.company_name || '',
        whatsapp_number: customer.whatsapp_number,
        phone_number: customer.phone_number || '',
        email: customer.email || '',
        address: customer.address || '',
        city: customer.city || '',
        pic_name: customer.pic_name || '',
        assigned_sales_id: customer.assigned_sales_id,
        status_id: customer.status_id,
        notes: customer.notes || '',
        use_custom_rule: Boolean(customer.use_custom_rule),
      });

      if (customer.custom_rules && customer.custom_rules.length > 0) {
        setCustomRules(
          customer.custom_rules.map(r => ({
            step_number: r.step_number,
            interval_days: r.interval_days,
          }))
        );
      }
    } else {
      setFormData({
        name: '',
        company_name: '',
        whatsapp_number: '',
        phone_number: '',
        email: '',
        address: '',
        city: '',
        pic_name: '',
        assigned_sales_id: user?.id || 1,
        status_id: statuses[0]?.id || 1,
        notes: '',
        use_custom_rule: false,
      });
      setCustomRules([
        { step_number: 1, interval_days: 3 },
        { step_number: 2, interval_days: 7 },
        { step_number: 3, interval_days: 14 },
      ]);
    }
  }, [customer, isOpen, user, statuses]);

  if (!isOpen) return null;

  const handleAddCustomRule = () => {
    const nextStep = customRules.length + 1;
    const lastInterval = customRules[customRules.length - 1]?.interval_days || 7;
    setCustomRules([...customRules, { step_number: nextStep, interval_days: lastInterval + 7 }]);
  };

  const handleRemoveCustomRule = (index: number) => {
    if (customRules.length <= 1) return;
    const updated = customRules.filter((_, i) => i !== index).map((r, idx) => ({ ...r, step_number: idx + 1 }));
    setCustomRules(updated);
  };

  const handleCustomRuleIntervalChange = (index: number, days: number) => {
    const updated = [...customRules];
    updated[index].interval_days = Math.max(1, days);
    setCustomRules(updated);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formData.name.trim() || !formData.whatsapp_number.trim()) {
      showToast('Nama customer dan nomor WhatsApp wajib diisi.', 'error');
      return;
    }

    setIsSubmitting(true);
    try {
      const payload = {
        ...formData,
        custom_rules: formData.use_custom_rule ? customRules : [],
      };

      if (customer) {
        await apiRequest(`/customers/${customer.id}`, {
          method: 'PUT',
          body: JSON.stringify(payload),
        });
        showToast('Data customer berhasil diperbarui.', 'success');
      } else {
        await apiRequest('/customers', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        showToast('Customer baru berhasil ditambahkan.', 'success');
      }

      onSuccess();
      onClose();
    } catch (err: any) {
      showToast(err.message || 'Gagal menyimpan data customer.', 'error');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-900/70 backdrop-blur-xs">
      <div className="w-full sm:max-w-2xl bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden flex flex-col max-h-[92vh] sm:max-h-[88vh] animate-in slide-in-from-bottom-4 sm:fade-in duration-200">
        {/* Sticky Header */}
        <div className="px-4 sm:px-6 py-3 border-b border-neutral-200 flex items-center justify-between bg-neutral-50 shrink-0">
          <div>
            <h2 className="text-sm sm:text-base font-bold text-neutral-900 leading-tight">
              {customer ? 'Edit Data Customer' : 'Tambah Customer Baru'}
            </h2>
            <p className="text-[11px] text-neutral-500">
              {customer ? `Perbarui profil ${customer.name}` : 'Input prospek atau order konveksi baru'}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] flex items-center justify-center text-neutral-400 hover:text-neutral-700 active:bg-neutral-200 rounded-xl"
            aria-label="Tutup Form"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form onSubmit={handleSubmit} id="customer-form" className="flex-1 p-4 sm:p-6 space-y-3.5 overflow-y-auto">
          {/* Row 1: Nama Customer & Perusahaan (1 col on mobile, 2 on sm+) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Nama Customer <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                required
                value={formData.name}
                onChange={e => setFormData({ ...formData, name: e.target.value })}
                placeholder="Contoh: Pak Budi Hartono"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Perusahaan / Instansi
              </label>
              <input
                type="text"
                value={formData.company_name}
                onChange={e => setFormData({ ...formData, company_name: e.target.value })}
                placeholder="Contoh: PT Sumber Makmur"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
              />
            </div>
          </div>

          {/* Row 2: WhatsApp & Telepon */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">
                Nomor WhatsApp <span className="text-rose-500">*</span>
              </label>
              <input
                type="tel"
                inputMode="tel"
                required
                value={formData.whatsapp_number}
                onChange={e => setFormData({ ...formData, whatsapp_number: e.target.value })}
                placeholder="08123456789 atau 62812..."
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] font-mono"
              />
              <span className="text-[10px] text-neutral-400 mt-0.5 block">Format otomatis diubah ke +62</span>
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Telepon Kantor / Tambahan</label>
              <input
                type="tel"
                inputMode="tel"
                value={formData.phone_number}
                onChange={e => setFormData({ ...formData, phone_number: e.target.value })}
                placeholder="021-5551234"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] font-mono"
              />
            </div>
          </div>

          {/* Row 3: PIC & Email */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">PIC Customer & Jabatan</label>
              <input
                type="text"
                value={formData.pic_name}
                onChange={e => setFormData({ ...formData, pic_name: e.target.value })}
                placeholder="Contoh: Pak Budi (Procurement Manager)"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Email</label>
              <input
                type="email"
                inputMode="email"
                value={formData.email}
                onChange={e => setFormData({ ...formData, email: e.target.value })}
                placeholder="budi@sumbermakmur.com"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
              />
            </div>
          </div>

          {/* Row 4: Kota & Status */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Kota / Domisili</label>
              <input
                type="text"
                value={formData.city}
                onChange={e => setFormData({ ...formData, city: e.target.value })}
                placeholder="Contoh: Bandung / Jakarta"
                className="w-full min-h-[44px] px-3.5 py-2.5 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-neutral-700 mb-1">Status Customer</label>
              <select
                value={formData.status_id}
                onChange={e => setFormData({ ...formData, status_id: parseInt(e.target.value, 10) })}
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

          {/* Row 5: Sales PIC */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Sales PIC Internal</label>
            <select
              disabled={!isAdmin}
              value={formData.assigned_sales_id}
              onChange={e => setFormData({ ...formData, assigned_sales_id: parseInt(e.target.value, 10) })}
              className={`w-full min-h-[44px] px-3 py-2 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059] ${
                !isAdmin ? 'bg-neutral-100 text-neutral-500 cursor-not-allowed' : 'bg-white'
              }`}
            >
              {salesList.map(s => (
                <option key={s.id} value={s.id}>
                  {s.name} ({s.role})
                </option>
              ))}
            </select>
            {!isAdmin && (
              <span className="text-[10px] text-neutral-400 mt-0.5 block">Hanya Administrator yang dapat memindahkan sales</span>
            )}
          </div>

          {/* Row 6: Alamat */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Alamat Lengkap</label>
            <textarea
              rows={2}
              value={formData.address}
              onChange={e => setFormData({ ...formData, address: e.target.value })}
              placeholder="Alamat kantor / workshop / pengiriman sampel..."
              className="w-full p-3 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
            />
          </div>

          {/* Row 7: Catatan Pesanan */}
          <div>
            <label className="block text-xs font-semibold text-neutral-700 mb-1">Catatan Kebutuhan & Spesifikasi</label>
            <textarea
              rows={2}
              value={formData.notes}
              onChange={e => setFormData({ ...formData, notes: e.target.value })}
              placeholder="Jenis seragam, bahan kain (Lacoste, Drill, Taslan), quantity, target deadline..."
              className="w-full p-3 text-base sm:text-sm border border-neutral-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-[#c5a059]/30 focus:border-[#c5a059]"
            />
          </div>

          {/* Custom Follow-Up Rule */}
          <div className="pt-2 border-t border-neutral-200">
            <div className="flex items-center justify-between min-h-[44px]">
              <div className="flex items-center gap-2">
                <Sliders className="w-4 h-4 text-[#c5a059] shrink-0" />
                <span className="text-xs font-bold text-neutral-800">Aturan Follow-Up Khusus (Custom Rule)</span>
              </div>
              <label className="relative inline-flex items-center cursor-pointer min-w-[48px] min-h-[40px] justify-end">
                <input
                  type="checkbox"
                  checked={formData.use_custom_rule}
                  onChange={e => setFormData({ ...formData, use_custom_rule: e.target.checked })}
                  className="sr-only peer"
                />
                <div className="w-11 h-6 bg-neutral-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[8px] after:right-[18px] after:bg-white after:border-neutral-300 after:border after:rounded-full after:h-4 after:w-4 after:transition-all peer-checked:bg-[#c5a059]"></div>
              </label>
            </div>

            {formData.use_custom_rule ? (
              <div className="mt-2.5 p-3.5 bg-neutral-50 border border-neutral-200 rounded-xl space-y-2.5">
                <p className="text-[11px] text-neutral-700 leading-tight">
                  Atur interval hari khusus per step untuk customer ini:
                </p>
                <div className="space-y-2">
                  {customRules.map((cr, idx) => (
                    <div key={idx} className="flex items-center gap-2 text-xs">
                      <span className="font-semibold text-neutral-700 w-16 shrink-0">Step {cr.step_number}:</span>
                      <div className="flex items-center gap-1.5 flex-1 min-w-0">
                        <input
                          type="number"
                          min={1}
                          max={365}
                          value={cr.interval_days}
                          onChange={e => handleCustomRuleIntervalChange(idx, parseInt(e.target.value, 10))}
                          className="w-16 min-h-[40px] px-2 py-1 border border-neutral-300 rounded-lg bg-white font-mono text-center text-sm"
                        />
                        <span className="text-neutral-600 text-[11px] truncate">hari sejak kontak</span>
                      </div>
                      {customRules.length > 1 && (
                        <button
                          type="button"
                          onClick={() => handleRemoveCustomRule(idx)}
                          className="min-w-[40px] min-h-[40px] flex items-center justify-center text-neutral-400 hover:text-rose-600 active:bg-rose-50 rounded-lg shrink-0"
                          aria-label="Hapus step"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  onClick={handleAddCustomRule}
                  className="min-h-[40px] text-xs font-bold text-neutral-900 hover:text-[#c5a059] flex items-center gap-1.5 pt-1"
                >
                  <Plus className="w-4 h-4 text-[#c5a059]" /> Tambah Step Interval
                </button>
              </div>
            ) : (
              <p className="text-[11px] text-neutral-500 mt-1">
                Mengikuti aturan standar perusahaan (3 → 7 → 14 → 30 hari).
              </p>
            )}
          </div>
        </form>

        {/* Sticky Footer Action Bar */}
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
            form="customer-form"
            disabled={isSubmitting}
            className="flex-1 sm:flex-initial min-h-[46px] px-5 py-2 text-xs font-bold text-white bg-neutral-900 hover:bg-neutral-800 active:bg-black rounded-xl shadow-xs transition-all disabled:opacity-50 flex items-center justify-center gap-1.5 border border-[#c5a059]/40 text-[#c5a059]"
          >
            <Check className="w-4 h-4 text-[#c5a059]" />
            <span>{isSubmitting ? 'Menyimpan...' : customer ? 'Simpan Perubahan' : 'Simpan Customer'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
