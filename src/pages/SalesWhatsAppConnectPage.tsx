import React from 'react';
import { SalesScreenSharePanel } from '../components/screenMonitoring/SalesScreenSharePanel.js';
import { Radio, ShieldCheck, HelpCircle, ExternalLink } from 'lucide-react';

export const SalesWhatsAppConnectPage: React.FC = () => {
  return (
    <div className="space-y-4 sm:space-y-6 max-w-4xl mx-auto overflow-x-hidden">
      {/* Page Title */}
      <div>
        <div className="flex items-center gap-2">
          <h1 className="text-lg sm:text-xl font-bold text-neutral-900 tracking-tight leading-tight">
            Hubungkan WhatsApp Web
          </h1>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[#c5a059]/20 text-[#c5a059] border border-[#c5a059]/30">
            SALES WORKSPACE
          </span>
        </div>
        <p className="text-xs text-neutral-500 mt-0.5">
          Bagikan tampilan layar tab WhatsApp Web kerja Anda secara langsung kepada Admin Supervisor.
        </p>
      </div>

      {/* Main Panel */}
      <SalesScreenSharePanel />

      {/* Help & Information Section */}
      <div className="bg-white rounded-2xl border border-neutral-200/90 p-4 sm:p-5 shadow-2xs space-y-3">
        <h3 className="text-xs font-bold text-neutral-800 uppercase tracking-wider flex items-center gap-1.5">
          <HelpCircle className="w-4 h-4 text-[#c5a059]" />
          Petunjuk Teknis & Tanya Jawab
        </h3>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 space-y-1">
            <h4 className="font-bold text-neutral-800">1. Tab mana yang harus saya pilih?</h4>
            <p className="text-neutral-600 leading-relaxed">
              Saat browser menampilkan pilihan jendela, pastikan memilih tab <strong className="text-neutral-800">"WhatsApp"</strong> atau <strong className="text-neutral-800">"WhatsApp Web"</strong>, bukan seluruh layar komputer Anda.
            </p>
          </div>

          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 space-y-1">
            <h4 className="font-bold text-neutral-800">2. Apakah chat pribadi atau suara saya terekam?</h4>
            <p className="text-neutral-600 leading-relaxed">
              <strong>Tidak sama sekali.</strong> Sistem hanya mentransmisikan visual tab WhatsApp Web yang dipilih. Mikrofon, audio, dan aplikasi lain tidak dapat diakses.
            </p>
          </div>

          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 space-y-1">
            <h4 className="font-bold text-neutral-800">3. Apakah kuota internet saya akan boros?</h4>
            <p className="text-neutral-600 leading-relaxed">
              Sistem telah diatur otomatis pada kecepatan transmisi hemat kuota (10 frame per detik) yang sangat ringan dan ramah jaringan seluler.
            </p>
          </div>

          <div className="p-3 bg-neutral-50 rounded-xl border border-neutral-200/70 space-y-1">
            <h4 className="font-bold text-neutral-800">4. Kapan saya harus menghentikan berbagi?</h4>
            <p className="text-neutral-600 leading-relaxed">
              Tekan tombol <strong className="text-rose-700">"Hentikan Berbagi"</strong> setelah jam kerja selesai atau saat beristirahat.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
