import express from 'express';
import cors from 'cors';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { initDatabase, db, FILES_DIR } from './db.mjs';
import filesRouter from './routes/files.mjs';
import documentsRouter from './routes/documents.mjs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = process.env.PORT || 5055;

// Khởi tạo database
initDatabase();

// CORS & Middleware
app.use(cors({
  origin: '*',
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-File-Name', 'X-Origin-Module'],
}));

// Route PUT /api/v1/files/:id/content nhận raw binary stream nên không parse body ở đây
app.use((req, res, next) => {
  if (req.method === 'PUT' && req.path.includes('/content')) {
    return next();
  }
  express.json({ limit: '50mb' })(req, res, (err) => {
    if (err) return res.status(400).json({ message: 'JSON không hợp lệ' });
    express.urlencoded({ extended: true, limit: '50mb' })(req, res, next);
  });
});

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', service: 'Nom Server', time: new Date().toISOString() });
});

// API Routes
app.use('/api/v1/files', filesRouter);
app.use('/api/v1/documents', documentsRouter);

// Alias cho các client gọi /api/files hoặc /api/documents
app.use('/api/files', filesRouter);
app.use('/api/documents', documentsRouter);

// Seeding file đích cụ thể: b45281ee-0669-4fbc-bf20-3a9ba03daf61
function seedTargetFile() {
  const targetId = 'b45281ee-0669-4fbc-bf20-3a9ba03daf61';
  const fileName = 'Nghi_quyet_dieu_hanh_Van_Nom_2026.wnom';
  const storageKey = `${targetId}.wnom`;
  const fullPath = path.join(FILES_DIR, storageKey);
  const now = new Date().toISOString();

  // Tạo file mẫu
  if (!fs.existsSync(fullPath)) {
    fs.writeFileSync(fullPath, Buffer.from('VĂN BẢN QUẢN TRỊ NÔM WNOM 2026'));
  }

  const existing = db.prepare('SELECT id FROM file_nodes WHERE id = ?').get(targetId);
  if (!existing) {
    db.prepare(`
      INSERT INTO file_nodes (id, name, node_type, mime_type, size, storage_key, created_at, updated_at)
      VALUES (?, ?, 'file', 'application/x-wnom', ?, ?, ?, ?)
    `).run(targetId, fileName, fs.statSync(fullPath).size, storageKey, now, now);

    console.log(`[Seed] Đã khởi tạo file mục tiêu: ${targetId} (${fileName})`);
  } else {
    db.prepare(`
      UPDATE file_nodes SET name = ?, storage_key = ?, mime_type = 'application/x-wnom', updated_at = ?
      WHERE id = ?
    `).run(fileName, storageKey, now, targetId);
  }
}

seedTargetFile();

// Khởi chạy server
app.listen(PORT, '0.0.0.0', () => {
  console.log(`====================================================`);
  console.log(`🚀 [Nom Backend] Máy chủ đang chạy tại:`);
  console.log(`   Local:   http://localhost:${PORT}`);
  console.log(`   Network: http://0.0.0.0:${PORT}`);
  console.log(`   Target:  http://localhost:${PORT}/api/v1/files/b45281ee-0669-4fbc-bf20-3a9ba03daf61`);
  console.log(`====================================================`);
});
