export interface TemplateContext {
  nama_customer?: string;
  perusahaan?: string;
  nama_sales?: string;
  produk?: string;
  tanggal?: string;
}

/**
 * Format phone number to Indonesian WhatsApp E.164 without '+' or spaces.
 * Example: '0812-3456-7890' -> '6281234567890'
 */
export function sanitizeWhatsAppPhone(phone: string): string {
  if (!phone) return '';
  // Remove non-digit characters
  let cleaned = phone.replace(/[^0-9]/g, '');

  // Convert leading 0 to 62
  if (cleaned.startsWith('0')) {
    cleaned = '62' + cleaned.substring(1);
  }

  // If starts with 8 (missing 0 or 62)
  if (cleaned.startsWith('8')) {
    cleaned = '62' + cleaned;
  }

  return cleaned;
}

/**
 * Parse WhatsApp message template with contextual variables.
 * Variable escaping is safe and replaces all instances.
 */
export function parseTemplate(templateText: string, context: TemplateContext): string {
  if (!templateText) return '';

  const now = new Date();
  const defaultDateStr = now.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  const replacements: Record<string, string> = {
    '{{nama_customer}}': context.nama_customer || 'Bapak/Ibu',
    '{{perusahaan}}': context.perusahaan || '-',
    '{{nama_sales}}': context.nama_sales || 'Captain Konveksi Team',
    '{{produk}}': context.produk || 'pesanan konveksi',
    '{{tanggal}}': context.tanggal || defaultDateStr,
  };

  let parsed = templateText;
  for (const [placeholder, val] of Object.entries(replacements)) {
    // Replace all occurrences safely
    parsed = parsed.split(placeholder).join(val);
  }

  return parsed;
}

/**
 * Build WhatsApp Click-to-Chat deep link
 */
export function buildWhatsAppLink(phone: string, message: string): string {
  const sanitized = sanitizeWhatsAppPhone(phone);
  const encodedText = encodeURIComponent(message);
  return `https://wa.me/${sanitized}?text=${encodedText}`;
}
