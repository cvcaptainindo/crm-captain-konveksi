import React from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmModalProps {
  isOpen: boolean;
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
  isDanger?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

export const ConfirmModal: React.FC<ConfirmModalProps> = ({
  isOpen,
  title,
  message,
  confirmLabel = 'Konfirmasi',
  cancelLabel = 'Batal',
  isDanger = false,
  onConfirm,
  onCancel,
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-0 sm:p-4 bg-neutral-900/60 backdrop-blur-xs">
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl border border-neutral-200 overflow-hidden animate-in slide-in-from-bottom-4 sm:fade-in duration-200">
        <div className="p-4 sm:p-5 flex items-start gap-3.5">
          <div
            className={`w-10 h-10 rounded-2xl flex items-center justify-center shrink-0 ${
              isDanger ? 'bg-rose-100 text-rose-600' : 'bg-amber-100 text-amber-600'
            }`}
          >
            <AlertTriangle className="w-5 h-5" />
          </div>

          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-bold text-neutral-900 leading-tight">{title}</h3>
            <p className="mt-1 text-xs text-neutral-600 leading-relaxed">{message}</p>
          </div>

          <button
            type="button"
            onClick={onCancel}
            className="min-h-[38px] min-w-[38px] flex items-center justify-center text-neutral-400 hover:text-neutral-600 p-1 rounded-lg"
            aria-label="Tutup"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <div className="px-4 sm:px-5 py-3.5 bg-neutral-50 border-t border-neutral-100 flex items-center justify-end gap-2 safe-area-bottom">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 sm:flex-initial min-h-[44px] px-4 py-2 text-xs font-semibold text-neutral-700 bg-white border border-neutral-300 rounded-xl hover:bg-neutral-100 active:bg-neutral-200 transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className={`flex-1 sm:flex-initial min-h-[44px] px-4 py-2 text-xs font-bold text-white rounded-xl shadow-xs transition-colors ${
              isDanger
                ? 'bg-rose-600 hover:bg-rose-700 active:bg-rose-800'
                : 'bg-neutral-900 hover:bg-neutral-800 active:bg-neutral-950'
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
