// Configuration for POC WebRTC & Signaling
const POC_CONFIG = {
  // RTCConfiguration with STUN and optional TURN servers
  rtcConfig: {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'stun:stun.cloudflare.com:3478' },
    ],
    iceCandidatePoolSize: 2,
  },

  // Bandwidth & Video Presets tailored for WhatsApp Web text readability
  videoPresets: {
    balanced: {
      name: 'Rekomendasi (720p @ 10 FPS - ~250 Kbps)',
      width: { max: 1280, ideal: 1280 },
      height: { max: 720, ideal: 720 },
      frameRate: { max: 10, ideal: 10 },
      maxBitrateBps: 250000,
    },
    lowBandwidth: {
      name: 'Hemat Kuota (540p @ 5 FPS - ~120 Kbps)',
      width: { max: 960, ideal: 960 },
      height: { max: 540, ideal: 540 },
      frameRate: { max: 5, ideal: 5 },
      maxBitrateBps: 120000,
    },
    highQuality: {
      name: 'Ketajaman Tinggi (1080p @ 15 FPS - ~600 Kbps)',
      width: { max: 1920, ideal: 1920 },
      height: { max: 1080, ideal: 1080 },
      frameRate: { max: 15, ideal: 15 },
      maxBitrateBps: 600000,
    },
  },

  // Signaling WebSocket URL resolution
  getSignalingUrl: () => {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${protocol}//${window.location.host}`;
  },
};

window.POC_CONFIG = POC_CONFIG;
