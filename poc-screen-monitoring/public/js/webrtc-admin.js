// Admin WebRTC Multi-Screen Grid Receiver
class AdminMonitor {
  constructor(options) {
    this.adminId = options.adminId || `admin-${Date.now()}`;
    this.adminName = options.adminName || 'Admin Supervisor';
    this.signalingUrl = options.signalingUrl || window.POC_CONFIG.getSignalingUrl();
    this.rtcConfig = options.rtcConfig || window.POC_CONFIG.rtcConfig;
    this.gridContainer = options.gridContainer;
    this.onStatusChange = options.onStatusChange || (() => {});
    this.onSalesListUpdated = options.onSalesListUpdated || (() => {});

    this.ws = null;
    this.salesMap = new Map(); // salesId -> { name, isStreaming, pc, stream, lastStats, cardEl, videoEl }
    this.statsInterval = null;
  }

  // 1. Connect to Signaling Server
  connectSignaling() {
    return new Promise((resolve, reject) => {
      this.onStatusChange('connecting', 'Menghubungkan ke signaling server...');
      this.ws = new WebSocket(this.signalingUrl);

      this.ws.onopen = () => {
        this.ws.send(JSON.stringify({
          type: 'register',
          role: 'admin',
          id: this.adminId,
          name: this.adminName,
        }));
        this.onStatusChange('online', 'Terhubung ke server signaling.');
        this.startStatsPolling();
        resolve();
      };

      this.ws.onmessage = async (event) => {
        try {
          const data = JSON.parse(event.data);
          await this.handleSignalingMessage(data);
        } catch (err) {
          console.error('[Admin WS Error]:', err);
        }
      };

      this.ws.onerror = (err) => {
        console.error('[Admin WS Error]:', err);
        this.onStatusChange('error', 'Gagal terhubung ke signaling server.');
        reject(err);
      };

      this.ws.onclose = () => {
        this.onStatusChange('offline', 'Terputus dari server signaling.');
        this.stopStatsPolling();
      };
    });
  }

  // 2. Handle Signaling Messages
  async handleSignalingMessage(data) {
    switch (data.type) {
      case 'registered': {
        const { salesList } = data;
        if (salesList) {
          salesList.forEach((sales) => this.addOrUpdateSales(sales));
        }
        break;
      }

      case 'sales_online': {
        this.addOrUpdateSales(data.sales);
        break;
      }

      case 'sales_offline': {
        this.handleSalesOffline(data.salesId);
        break;
      }

      case 'sales_stream_started': {
        const sales = this.salesMap.get(data.salesId);
        if (sales) {
          sales.isStreaming = true;
          this.updateSalesCardUI(data.salesId);
          // Request stream from sales
          this.requestStreamFromSales(data.salesId);
        } else {
          this.addOrUpdateSales({ id: data.salesId, name: data.salesName, isStreaming: true });
          this.requestStreamFromSales(data.salesId);
        }
        break;
      }

      case 'sales_stream_stopped': {
        const sales = this.salesMap.get(data.salesId);
        if (sales) {
          sales.isStreaming = false;
          if (sales.pc) {
            sales.pc.close();
            sales.pc = null;
          }
          sales.stream = null;
          this.updateSalesCardUI(data.salesId);
        }
        break;
      }

      case 'offer': {
        const { senderId, sdp } = data;
        await this.handleIncomingOffer(senderId, sdp);
        break;
      }

      case 'ice_candidate': {
        const { senderId, candidate } = data;
        const sales = this.salesMap.get(senderId);
        if (sales && sales.pc && candidate) {
          await sales.pc.addIceCandidate(new RTCIceCandidate(candidate));
        }
        break;
      }

      default:
        break;
    }
  }

  // 3. Request Stream from Sales
  requestStreamFromSales(salesId) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify({
        type: 'request_stream',
        salesId,
      }));
    }
  }

  // 4. Handle incoming SDP Offer from Sales
  async handleIncomingOffer(salesId, sdp) {
    let sales = this.salesMap.get(salesId);
    if (!sales) {
      sales = { name: salesId, isStreaming: true };
      this.salesMap.set(salesId, sales);
      this.renderSalesCard(salesId);
    }

    if (sales.pc) {
      sales.pc.close();
    }

    const pc = new RTCPeerConnection(this.rtcConfig);
    sales.pc = pc;

    pc.ontrack = (event) => {
      console.log(`[Admin] Incoming video track received for sales ${salesId}`);
      sales.stream = event.streams[0];
      if (sales.videoEl) {
        sales.videoEl.srcObject = sales.stream;
        sales.videoEl.play().catch(e => console.warn('Auto-play blocked:', e));
      }
      this.updateSalesCardUI(salesId);
    };

    pc.onicecandidate = (event) => {
      if (event.candidate && this.ws && this.ws.readyState === WebSocket.OPEN) {
        this.ws.send(JSON.stringify({
          type: 'ice_candidate',
          targetId: salesId,
          candidate: event.candidate,
        }));
      }
    };

    pc.oniceconnectionstatechange = () => {
      console.log(`[Admin ICE] Sales ${salesId}:`, pc.iceConnectionState);
      this.updateSalesCardUI(salesId);
    };

    await pc.setRemoteDescription(new RTCSessionDescription(sdp));
    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    this.ws.send(JSON.stringify({
      type: 'answer',
      targetId: salesId,
      sdp: answer,
    }));
  }

  // 5. Add or update sales record
  addOrUpdateSales(sales) {
    let record = this.salesMap.get(sales.id);
    if (!record) {
      record = {
        id: sales.id,
        name: sales.name || sales.id,
        isStreaming: !!sales.isStreaming,
        pc: null,
        stream: null,
        lastBytes: 0,
        lastTimestamp: Date.now(),
      };
      this.salesMap.set(sales.id, record);
      this.renderSalesCard(sales.id);
    } else {
      record.name = sales.name || record.name;
      record.isStreaming = !!sales.isStreaming;
      this.updateSalesCardUI(sales.id);
    }

    if (record.isStreaming && !record.pc) {
      this.requestStreamFromSales(sales.id);
    }

    this.onSalesListUpdated(Array.from(this.salesMap.values()));
  }

  handleSalesOffline(salesId) {
    const sales = this.salesMap.get(salesId);
    if (sales) {
      if (sales.pc) sales.pc.close();
      if (sales.cardEl) sales.cardEl.remove();
      this.salesMap.delete(salesId);
    }
    this.onSalesListUpdated(Array.from(this.salesMap.values()));
  }

  // 6. Render Card in DOM Grid
  renderSalesCard(salesId) {
    const sales = this.salesMap.get(salesId);
    if (!sales || !this.gridContainer) return;

    if (sales.cardEl) return; // already rendered

    const card = document.createElement('div');
    card.id = `card-${salesId}`;
    card.className = 'video-card';
    card.innerHTML = `
      <div class="video-header">
        <div class="sales-info">
          <span class="status-dot ${sales.isStreaming ? 'streaming' : 'online'}" id="dot-${salesId}"></span>
          <span id="name-${salesId}">${sales.name}</span>
        </div>
        <span class="status-pill" id="badge-${salesId}">
          ${sales.isStreaming ? 'LIVE STREAM' : 'STANDBY'}
        </span>
      </div>
      <div class="video-container">
        <video id="video-${salesId}" class="video-element" autoplay playsinline muted></video>
        <div class="video-placeholder" id="placeholder-${salesId}">
          <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5">
            <rect x="2" y="3" width="20" height="14" rx="2" ry="2"></rect>
            <line x1="8" y1="21" x2="16" y2="21"></line>
            <line x1="12" y1="17" x2="12" y2="21"></line>
          </svg>
          <span>Menunggu Sales Memulai Berbagi Layar WhatsApp...</span>
        </div>
        <div class="video-overlay-stats" id="stats-${salesId}" style="display: none;">
          0x0 | 0 fps | 0 kbps
        </div>
        <div class="video-controls">
          <button class="btn-icon" title="Perbesar Layar" onclick="window.adminMonitor.openFocusModal('${salesId}')">
            ⛶
          </button>
          <button class="btn-icon" title="Muat Ulang Stream" onclick="window.adminMonitor.requestStreamFromSales('${salesId}')">
            ↻
          </button>
        </div>
      </div>
      <div class="video-footer">
        <span id="ice-${salesId}">ICE: Idle</span>
        <span id="res-${salesId}">WhatsApp Web Monitoring</span>
      </div>
    `;

    this.gridContainer.appendChild(card);
    sales.cardEl = card;
    sales.videoEl = card.querySelector(`#video-${salesId}`);
    this.updateSalesCardUI(salesId);
  }

  // 7. Update UI based on streaming state
  updateSalesCardUI(salesId) {
    const sales = this.salesMap.get(salesId);
    if (!sales || !sales.cardEl) return;

    const placeholder = sales.cardEl.querySelector(`#placeholder-${salesId}`);
    const badge = sales.cardEl.querySelector(`#badge-${salesId}`);
    const dot = sales.cardEl.querySelector(`#dot-${salesId}`);
    const statsOverlay = sales.cardEl.querySelector(`#stats-${salesId}`);
    const iceLabel = sales.cardEl.querySelector(`#ice-${salesId}`);

    if (sales.isStreaming && sales.stream) {
      if (placeholder) placeholder.style.display = 'none';
      if (statsOverlay) statsOverlay.style.display = 'block';
      if (badge) {
        badge.textContent = 'STREAMING LIVE';
        badge.style.color = '#38bdf8';
      }
      if (dot) {
        dot.className = 'status-dot streaming';
      }
      sales.cardEl.classList.add('active-stream');
    } else {
      if (placeholder) placeholder.style.display = 'flex';
      if (statsOverlay) statsOverlay.style.display = 'none';
      if (badge) {
        badge.textContent = sales.isStreaming ? 'MENYAMBUNGKAN...' : 'STANDBY';
        badge.style.color = '#94a3b8';
      }
      if (dot) {
        dot.className = `status-dot ${sales.isStreaming ? 'connecting' : 'online'}`;
      }
      sales.cardEl.classList.remove('active-stream');
    }

    if (iceLabel && sales.pc) {
      iceLabel.textContent = `ICE: ${sales.pc.iceConnectionState || 'new'}`;
    }
  }

  // 8. Stats Polling (Bitrate, FPS, Resolution)
  startStatsPolling() {
    this.statsInterval = setInterval(async () => {
      for (const [salesId, sales] of this.salesMap.entries()) {
        if (!sales.pc || !sales.stream) continue;

        try {
          const stats = await sales.pc.getStats();
          let bytesNow = 0;
          let fps = 0;
          let width = 0;
          let height = 0;

          stats.forEach((report) => {
            if (report.type === 'inbound-rtp' && report.kind === 'video') {
              bytesNow = report.bytesReceived || 0;
              fps = report.framesPerSecond || 0;
            }
            if (report.type === 'track' && report.kind === 'video') {
              width = report.frameWidth || 0;
              height = report.frameHeight || 0;
            }
          });

          // calculate bitrate
          const now = Date.now();
          const timeDelta = (now - (sales.lastTimestamp || now)) / 1000;
          let kbps = 0;
          if (timeDelta > 0 && sales.lastBytes) {
            kbps = Math.round(((bytesNow - sales.lastBytes) * 8) / (timeDelta * 1024));
          }
          sales.lastBytes = bytesNow;
          sales.lastTimestamp = now;

          if (sales.videoEl && sales.videoEl.videoWidth) {
            width = sales.videoEl.videoWidth;
            height = sales.videoEl.videoHeight;
          }

          const statsOverlay = document.getElementById(`stats-${salesId}`);
          if (statsOverlay) {
            statsOverlay.textContent = `${width}x${height} | ${Math.round(fps)} fps | ${kbps} kbps`;
          }
        } catch (e) {
          // ignore stat errors
        }
      }
    }, 1500);
  }

  stopStatsPolling() {
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
      this.statsInterval = null;
    }
  }

  // 9. Fullscreen / Focus Modal
  openFocusModal(salesId) {
    const sales = this.salesMap.get(salesId);
    if (!sales || !sales.stream) {
      alert(`Sales ${sales?.name || salesId} belum memulai streaming.`);
      return;
    }

    const modalBackdrop = document.createElement('div');
    modalBackdrop.className = 'modal-backdrop';
    modalBackdrop.id = 'focus-modal';
    modalBackdrop.innerHTML = `
      <div class="modal-content">
        <div class="modal-header">
          <div class="sales-info">
            <span class="status-dot streaming"></span>
            <strong>${sales.name}</strong> — Live Focus Screen
          </div>
          <button class="btn btn-outline" onclick="document.getElementById('focus-modal').remove()">Tutup (Esc)</button>
        </div>
        <div class="modal-body">
          <video id="modal-video" autoplay playsinline muted></video>
        </div>
      </div>
    `;

    document.body.appendChild(modalBackdrop);
    const modalVideo = document.getElementById('modal-video');
    modalVideo.srcObject = sales.stream;

    modalBackdrop.onclick = (e) => {
      if (e.target === modalBackdrop) modalBackdrop.remove();
    };
  }
}

window.AdminMonitor = AdminMonitor;
