const BASE_URL = '/api/v1';

export class ApiError extends Error {
  status: number;
  data: any;

  constructor(message: string, status: number, data?: any) {
    super(message);
    this.status = status;
    this.data = data;
    this.name = 'ApiError';
  }
}

export async function apiRequest<T = any>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = localStorage.getItem('captain_crm_token');
  const headers = new Headers(options.headers || {});

  if (!headers.has('Content-Type') && !(options.body instanceof FormData)) {
    headers.set('Content-Type', 'application/json');
  }

  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const url = `${BASE_URL}${endpoint}`;
  const response = await fetch(url, {
    ...options,
    headers,
  });

  if (response.status === 401) {
    // If unauthorized, clear token and notify auth state
    localStorage.removeItem('captain_crm_token');
    localStorage.removeItem('captain_crm_user');
    window.dispatchEvent(new Event('auth:unauthorized'));
  }

  // Handle blob or json
  const contentType = response.headers.get('content-type');
  if (contentType && (contentType.includes('spreadsheet') || contentType.includes('csv') || contentType.includes('octet-stream'))) {
    if (!response.ok) {
      throw new ApiError('Export failed', response.status);
    }
    const blob = await response.blob();
    return blob as unknown as T;
  }

  const result = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new ApiError(result.message || 'Terjadi kesalahan pada server', response.status, result);
  }

  return result as T;
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.style.display = 'none';
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(a);
}
