import WebSocket from 'ws';
import assert from 'assert';
import http from 'http';
import { WebSocketServer } from 'ws';

// Standalone automated test for WebRTC Signaling Server
async function runSignalingTests() {
  console.log('========================================================');
  console.log('POC SCREEN MONITORING — SIGNALING PROTOCOL TEST SUITE');
  console.log('Verifying 2-Sales & 1-Admin WebRTC Signaling Protocol');
  console.log('========================================================\n');

  const TEST_PORT = 3199;
  const clients = new Map<string, any>();

  // 1. Start an isolated test signaling server
  const server = http.createServer();
  const wss = new WebSocketServer({ server });

  wss.on('connection', (ws: WebSocket) => {
    let clientId: string | null = null;

    ws.on('message', (raw: WebSocket.RawData) => {
      const data = JSON.parse(raw.toString());
      if (data.type === 'register') {
        clientId = data.id;
        clients.set(data.id, { ws, role: data.role, id: data.id, name: data.name, isStreaming: false });
        ws.send(JSON.stringify({
          type: 'registered',
          id: data.id,
          role: data.role,
          salesList: data.role === 'admin' ? Array.from(clients.values()).filter(c => c.role === 'sales').map(c => ({ id: c.id, name: c.name, isStreaming: c.isStreaming })) : undefined,
        }));
        if (data.role === 'sales') {
          for (const c of clients.values()) {
            if (c.role === 'admin' && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(JSON.stringify({ type: 'sales_online', sales: { id: data.id, name: data.name, isStreaming: false } }));
            }
          }
        }
      } else if (data.type === 'stream_started') {
        if (clientId && clients.has(clientId)) {
          clients.get(clientId).isStreaming = true;
          for (const c of clients.values()) {
            if (c.role === 'admin' && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(JSON.stringify({ type: 'sales_stream_started', salesId: clientId }));
            }
          }
        }
      } else if (data.type === 'offer' || data.type === 'answer' || data.type === 'ice_candidate' || data.type === 'request_stream') {
        const target = clients.get(data.targetId || data.salesId);
        if (target && target.ws.readyState === WebSocket.OPEN) {
          target.ws.send(JSON.stringify({ ...data, senderId: clientId }));
        }
      }
    });

    ws.on('close', () => {
      if (clientId && clients.has(clientId)) {
        const client = clients.get(clientId);
        clients.delete(clientId);
        if (client.role === 'sales') {
          for (const c of clients.values()) {
            if (c.role === 'admin' && c.ws.readyState === WebSocket.OPEN) {
              c.ws.send(JSON.stringify({ type: 'sales_offline', salesId: clientId }));
            }
          }
        }
      }
    });
  });

  await new Promise<void>((resolve) => server.listen(TEST_PORT, '127.0.0.1', resolve));
  console.log(`[TEST SERVER] Running on ws://127.0.0.1:${TEST_PORT}\n`);

  function connectClient(role: string, id: string, name: string): Promise<{ ws: WebSocket; messages: any[] }> {
    return new Promise((resolve) => {
      const ws = new WebSocket(`ws://127.0.0.1:${TEST_PORT}`);
      const messages: any[] = [];
      ws.on('message', (msg) => {
        messages.push(JSON.parse(msg.toString()));
      });
      ws.on('open', () => {
        ws.send(JSON.stringify({ type: 'register', role, id, name }));
        resolve({ ws, messages });
      });
    });
  }

  try {
    // TEST 1: Register Sales 1 & Sales 2
    console.log('TEST 1: Registering Sales 1 (Ahmad) and Sales 2 (Budi)...');
    const sales1 = await connectClient('sales', 'sales-1', 'Sales Ahmad');
    const sales2 = await connectClient('sales', 'sales-2', 'Sales Budi');
    await new Promise(r => setTimeout(r, 100));

    assert.strictEqual(sales1.messages[0].type, 'registered');
    assert.strictEqual(sales1.messages[0].id, 'sales-1');
    assert.strictEqual(sales2.messages[0].type, 'registered');
    assert.strictEqual(sales2.messages[0].id, 'sales-2');
    console.log('  [PASS] Sales 1 and Sales 2 registered successfully.');

    // TEST 2: Register Admin & Verify Sales Discovery
    console.log('\nTEST 2: Registering Admin and discovering active Sales list...');
    const admin = await connectClient('admin', 'admin-1', 'Supervisor Admin');
    await new Promise(r => setTimeout(r, 100));

    assert.strictEqual(admin.messages[0].type, 'registered');
    assert.strictEqual(admin.messages[0].salesList.length, 2);
    assert.strictEqual(admin.messages[0].salesList[0].id, 'sales-1');
    assert.strictEqual(admin.messages[0].salesList[1].id, 'sales-2');
    console.log('  [PASS] Admin received 2 registered Sales clients in initial list.');

    // TEST 3: Sales 1 triggers Stream Started
    console.log('\nTEST 3: Sales 1 starts screen sharing (stream_started)...');
    sales1.ws.send(JSON.stringify({ type: 'stream_started' }));
    await new Promise(r => setTimeout(r, 100));

    const streamStartMsg = admin.messages.find(m => m.type === 'sales_stream_started');
    assert(streamStartMsg, 'Admin must receive sales_stream_started event');
    assert.strictEqual(streamStartMsg.salesId, 'sales-1');
    console.log('  [PASS] Admin notified that Sales 1 started streaming.');

    // TEST 4: WebRTC SDP Offer Relay (Sales 1 -> Admin)
    console.log('\nTEST 4: WebRTC SDP Offer relay from Sales 1 to Admin...');
    const fakeOffer = { type: 'offer', sdp: 'v=0\r\no=- 12345 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' };
    sales1.ws.send(JSON.stringify({
      type: 'offer',
      targetId: 'admin-1',
      sdp: fakeOffer,
    }));
    await new Promise(r => setTimeout(r, 100));

    const offerMsg = admin.messages.find(m => m.type === 'offer');
    assert(offerMsg, 'Admin must receive offer from Sales 1');
    assert.strictEqual(offerMsg.senderId, 'sales-1');
    assert.strictEqual(offerMsg.sdp.sdp, fakeOffer.sdp);
    console.log('  [PASS] SDP Offer relayed cleanly with intact payload.');

    // TEST 5: WebRTC SDP Answer Relay (Admin -> Sales 1)
    console.log('\nTEST 5: WebRTC SDP Answer relay from Admin to Sales 1...');
    const fakeAnswer = { type: 'answer', sdp: 'v=0\r\no=- 54321 2 IN IP4 127.0.0.1\r\ns=-\r\nt=0 0\r\nm=video 9 UDP/TLS/RTP/SAVPF 96\r\n' };
    admin.ws.send(JSON.stringify({
      type: 'answer',
      targetId: 'sales-1',
      sdp: fakeAnswer,
    }));
    await new Promise(r => setTimeout(r, 100));

    const answerMsg = sales1.messages.find(m => m.type === 'answer');
    assert(answerMsg, 'Sales 1 must receive answer from Admin');
    assert.strictEqual(answerMsg.senderId, 'admin-1');
    assert.strictEqual(answerMsg.sdp.sdp, fakeAnswer.sdp);
    console.log('  [PASS] SDP Answer relayed cleanly to Sales 1.');

    // TEST 6: ICE Candidate Relay
    console.log('\nTEST 6: ICE Candidate bidirectional relay...');
    const candidate = { candidate: 'candidate:1 1 UDP 2130706431 192.168.1.100 50000 typ host', sdpMid: '0', sdpMLineIndex: 0 };
    sales1.ws.send(JSON.stringify({
      type: 'ice_candidate',
      targetId: 'admin-1',
      candidate,
    }));
    await new Promise(r => setTimeout(r, 100));

    const iceMsg = admin.messages.find(m => m.type === 'ice_candidate');
    assert(iceMsg, 'Admin must receive ice_candidate');
    assert.strictEqual(iceMsg.candidate.candidate, candidate.candidate);
    console.log('  [PASS] ICE Candidate relayed correctly.');

    // TEST 7: Simultaneous Second Stream (Sales 2 streaming at same time)
    console.log('\nTEST 7: Simultaneous second stream from Sales 2...');
    sales2.ws.send(JSON.stringify({ type: 'stream_started' }));
    await new Promise(r => setTimeout(r, 100));

    const streamStart2 = admin.messages.filter(m => m.type === 'sales_stream_started');
    assert.strictEqual(streamStart2.length, 2, 'Admin must receive stream start from both Sales 1 and Sales 2');
    console.log('  [PASS] Admin received simultaneous stream alerts from both Sales 1 & Sales 2.');

    // TEST 8: Disconnect Handling
    console.log('\nTEST 8: Sales disconnect notification...');
    sales2.ws.close();
    await new Promise(r => setTimeout(r, 100));

    const offlineMsg = admin.messages.find(m => m.type === 'sales_offline');
    assert(offlineMsg, 'Admin must receive sales_offline when Sales 2 disconnects');
    assert.strictEqual(offlineMsg.salesId, 'sales-2');
    console.log('  [PASS] Admin notified immediately when Sales 2 goes offline.');

    // Cleanup
    sales1.ws.close();
    admin.ws.close();
    wss.close();
    server.close();

    console.log('\n========================================================');
    console.log('TOTAL TESTS: 8 | PASSED: 8 | FAILED: 0');
    console.log('ALL SIGNALING & MULTI-STREAM TESTS PASSED SUCCESSFULLY!');
    console.log('========================================================\n');
  } catch (err) {
    wss.close();
    server.close();
    console.error('Test failed with error:', err);
    process.exit(1);
  }
}

runSignalingTests();
