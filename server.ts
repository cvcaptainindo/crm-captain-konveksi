import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { apiRouter } from './server/routes/api.routes.js';
import { validateDbConfig, testDbConnection, checkDbHealth } from './server/database/db.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = parseInt(process.env.PORT || '3000', 10);
const isProd = process.env.NODE_ENV === 'production';

app.use(cors());
app.use(express.json());

// Mount REST API endpoints under /api/v1 and alias under /api
app.use('/api/v1', apiRouter);
app.use('/api', apiRouter);

// Liveness check (Process is alive)
app.get(['/api/health', '/api/v1/health'], async (req, res) => {
  const dbHealth = await checkDbHealth();
  res.json({
    status: 'ok',
    app: 'CRM Captain Konveksi',
    version: '1.0.0',
    database: {
      status: dbHealth.status,
      host: dbHealth.host,
      name: dbHealth.database,
      latencyMs: dbHealth.latencyMs,
    },
    timestamp: new Date().toISOString(),
  });
});

// Readiness check (Database is connected and ready for queries)
app.get(['/api/ready', '/api/v1/ready'], async (req, res) => {
  const dbHealth = await checkDbHealth();
  if (dbHealth.status === 'ok') {
    res.status(200).json({
      ready: true,
      database: 'connected',
      latencyMs: dbHealth.latencyMs,
    });
  } else {
    res.status(503).json({
      ready: false,
      database: 'disconnected',
      error: dbHealth.error,
    });
  }
});

async function startServer() {
  // 1. Validate Database and Security Configuration
  const validation = validateDbConfig();
  if (validation.warnings.length > 0) {
    validation.warnings.forEach(w => console.warn(`[CONFIG WARNING] ${w}`));
  }
  if (validation.errors.length > 0) {
    validation.errors.forEach(e => console.error(`[CONFIG ERROR] ${e}`));
    if (isProd) {
      console.error('[FATAL] Konfigurasi tidak memenuhi standar keamanan produksi. Server dibatalkan.');
      process.exit(1);
    }
  }

  // 2. Test MySQL Connection before accepting traffic
  const connTest = await testDbConnection();
  if (connTest.ok) {
    console.log(`[DATABASE] Terhubung ke MySQL dengan latensi ${connTest.latencyMs}ms.`);
  } else {
    console.warn(`[DATABASE WARNING] Koneksi awal MySQL gagal: ${connTest.message}`);
    console.warn('[DATABASE WARNING] Endpoint API akan mengembalikan status 503 sampai koneksi MySQL siap.');
  }

  // 3. Setup client serving
  if (!isProd) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = fs.existsSync(path.resolve(__dirname, 'index.html'))
      ? __dirname
      : path.resolve(__dirname, 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[CRM Captain Konveksi] Server running at http://0.0.0.0:${PORT} in ${isProd ? 'production' : 'development'} mode`);
  });
}

startServer().catch((err) => {
  console.error('Fatal error starting server:', err);
  process.exit(1);
});
