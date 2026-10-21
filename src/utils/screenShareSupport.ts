/**
 * Utility to verify browser compatibility for screen capture (getDisplayMedia).
 * Mobile browsers and non-secure HTTP contexts do not support getDisplayMedia.
 */
export interface ScreenShareSupportResult {
  supported: boolean;
  reason?: string;
}

export interface ScreenShareEnv {
  isSecureContext?: boolean;
  mediaDevices?: {
    getDisplayMedia?: (...args: any[]) => any;
    [key: string]: any;
  };
}

export function checkScreenShareSupport(env?: ScreenShareEnv): ScreenShareSupportResult {
  if (typeof window === 'undefined' && env === undefined) {
    return {
      supported: false,
      reason: 'Browser atau perangkat ini belum mendukung berbagi layar. Silakan gunakan browser dan perangkat yang kompatibel.',
    };
  }

  const isSecure = env !== undefined
    ? !!env.isSecureContext
    : typeof window !== 'undefined'
    ? !!window.isSecureContext
    : false;

  // getDisplayMedia requires a secure context (HTTPS or localhost)
  if (!isSecure) {
    return {
      supported: false,
      reason: 'Berbagi layar memerlukan koneksi aman (HTTPS). Silakan akses aplikasi melalui HTTPS.',
    };
  }

  const mediaDevices = env !== undefined
    ? env.mediaDevices
    : typeof navigator !== 'undefined'
    ? navigator.mediaDevices
    : undefined;

  const hasDisplayMedia = !!mediaDevices && typeof mediaDevices.getDisplayMedia === 'function';

  if (!hasDisplayMedia) {
    return {
      supported: false,
      reason: 'Browser atau perangkat ini belum mendukung berbagi layar. Silakan gunakan browser dan perangkat yang kompatibel.',
    };
  }

  return { supported: true };
}
