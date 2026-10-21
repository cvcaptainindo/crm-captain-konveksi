import React from 'react';
import { ExternalLink, MessageSquareText, ShieldCheck } from 'lucide-react';

export const SalesWhatsAppConnectPage: React.FC = () => {
  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <div>
        <h1 className="text-xl font-bold text-neutral-900">
          Hubungkan WhatsApp Web
        </h1>
        <p className="mt-1 text-sm text-neutral-500">
          Buka WhatsApp Web untuk menangani percakapan pelanggan dan
          catat hasil tindak lanjut melalui CRM.
        </p>
      </div>

      <div className="rounded-2xl border border-neutral-200 bg-white p-5 sm:p-6 space-y-4">
        <div className="flex items-start gap-3">
          <div className="rounded-xl bg-neutral-100 p-3">
            <MessageSquareText className="h-6 w-6 text-neutral-700" />
          </div>
          <div>
            <h2 className="font-semibold text-neutral-900">WhatsApp Web</h2>
            <p className="mt-1 text-sm text-neutral-600">
              Gunakan tab WhatsApp Web untuk berkomunikasi dengan pelanggan.
              Login dilakukan langsung di situs resmi WhatsApp.
            </p>
          </div>
        </div>

        <a
          href="https://web.whatsapp.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center justify-center gap-2 rounded-xl bg-neutral-900 px-5 py-3 text-sm font-semibold text-white hover:bg-neutral-700"
        >
          Buka WhatsApp Web
          <ExternalLink className="h-4 w-4" />
        </a>

        <div className="flex items-start gap-2 rounded-xl bg-neutral-50 p-3 text-sm text-neutral-600">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-neutral-700" />
          <p>
            CRM tidak meminta kata sandi WhatsApp dan tidak membagikan
            tampilan layar. Catat aktivitas follow-up pelanggan di CRM
            sesuai prosedur kerja.
          </p>
        </div>
      </div>
    </div>
  );
};
