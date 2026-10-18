import express from 'express';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import multer from 'multer';
import { db, FILES_DIR } from '../db.mjs';

const router = express.Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
});

function now() {
  return new Date().toISOString();
}

function getFilePath(storageKey) {
  return path.join(FILES_DIR, storageKey);
}

function formatNode(row) {
  if (!row) return null;
  return {
    id: row.id,
    key: row.id,
    name: row.name,
    type: row.node_type || 'file',
    mime: row.mime_type || 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    sizeBytes: Number(row.size || 0),
    storageKey: row.storage_key,
    modified: row.updated_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

// 1. GET /api/v1/files - Danh sách files
router.get('/', (req, res) => {
  try {
    const rows = db.prepare('SELECT * FROM file_nodes ORDER BY updated_at DESC').all();
    res.json({ data: rows.map(formatNode) });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi truy vấn danh sách file', error: err.message });
  }
});

// 2. GET /api/v1/files/:id - Chi tiết file
router.get('/:id', (req, res) => {
  try {
    const id = req.params.id;
    const row = db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ message: 'Không tìm thấy file' });
    }
    res.json({ file: formatNode(row) });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi đọc file', error: err.message });
  }
});

// 3. POST /api/v1/files/create - Tạo file mới
router.post('/create', (req, res) => {
  try {
    const id = crypto.randomUUID();
    const name = (req.body.name || `Van_Ban_Nom_${id.slice(0, 8)}.wnom`).trim();
    const storageKey = `${id}.wnom`;
    const fullPath = getFilePath(storageKey);
    const time = now();

    // Tạo file rỗng nếu chưa tồn tại
    if (!fs.existsSync(fullPath)) {
      fs.writeFileSync(fullPath, Buffer.alloc(0));
    }

    db.prepare(`
      INSERT INTO file_nodes (id, name, node_type, mime_type, size, storage_key, created_at, updated_at)
      VALUES (?, ?, 'file', 'application/x-wnom', 0, ?, ?, ?)
    `).run(id, name, storageKey, time, time);

    const created = db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(id);
    res.status(201).json({ file: formatNode(created) });
  } catch (err) {
    res.status(500).json({ message: 'Không thể tạo file', error: err.message });
  }
});

// 4. POST /api/v1/files/upload - Tải file lên (hỗ trợ cả multer form-data và raw body)
router.post('/upload', upload.single('file'), (req, res) => {
  try {
    const id = crypto.randomUUID();
    let name = req.headers['x-file-name'] ? decodeURIComponent(req.headers['x-file-name']) : '';
    let buffer = null;

    if (req.file) {
      name = name || req.file.originalname;
      buffer = req.file.buffer;
    } else if (Buffer.isBuffer(req.body)) {
      buffer = req.body;
    }

    if (!name) name = `Van_Ban_${id.slice(0, 8)}.wnom`;
    if (!buffer) buffer = Buffer.alloc(0);

    const storageKey = `${id}.wnom`;
    const fullPath = getFilePath(storageKey);
    fs.writeFileSync(fullPath, buffer);

    const time = now();
    const mimeType = req.headers['content-type'] || 'application/x-wnom';

    db.prepare(`
      INSERT INTO file_nodes (id, name, node_type, mime_type, size, storage_key, created_at, updated_at)
      VALUES (?, ?, 'file', ?, ?, ?, ?, ?)
    `).run(id, name, mimeType, buffer.length, storageKey, time, time);

    const created = db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(id);
    res.status(201).json({ file: formatNode(created) });
  } catch (err) {
    res.status(500).json({ message: 'Không thể tải lên file', error: err.message });
  }
});

// 5. GET /api/v1/files/:id/download - Tải nhị phân file
router.get('/:id/download', (req, res) => {
  try {
    const id = req.params.id;
    const row = db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(id);
    if (!row) {
      return res.status(404).json({ message: 'Không tìm thấy file' });
    }

    const storageKey = row.storage_key || `${id}.wnom`;
    const fullPath = getFilePath(storageKey);

    if (!fs.existsSync(fullPath)) {
      return res.status(404).json({ message: 'Tệp tin không tồn tại trên ổ cứng' });
    }

    res.setHeader('Content-Type', row.mime_type || 'application/x-wnom');
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(row.name)}"`);
    fs.createReadStream(fullPath).pipe(res);
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi tải file', error: err.message });
  }
});

// 6. PUT /api/v1/files/:id/content - Lưu cập nhật nội dung nhị phân (khi bấm Lưu trên Editor)
router.put('/:id/content', (req, res) => {
  try {
    const id = req.params.id;
    let row = db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(id);

    const time = now();
    let storageKey = row?.storage_key;

    if (!row) {
      // Tự động tạo bản ghi mới nếu fileKey chưa có
      storageKey = `${id}.wnom`;
      const name = `Van_Ban_${id.slice(0, 8)}.wnom`;
      db.prepare(`
        INSERT INTO file_nodes (id, name, node_type, mime_type, size, storage_key, created_at, updated_at)
        VALUES (?, ?, 'file', 'application/x-wnom', 0, ?, ?, ?)
      `).run(id, name, storageKey, time, time);
      row = db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(id);
    }

    const fullPath = getFilePath(storageKey);
    const chunks = [];

    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const buffer = Buffer.concat(chunks);
      fs.writeFileSync(fullPath, buffer);

      db.prepare(`
        UPDATE file_nodes
        SET size = ?, updated_at = ?
        WHERE id = ?
      `).run(buffer.length, time, id);

      const updated = db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(id);
      res.json({ file: formatNode(updated) });
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi lưu nội dung file', error: err.message });
  }
});

// 7. PATCH /api/v1/files/:id - Đổi tên file
router.patch('/:id', (req, res) => {
  try {
    const id = req.params.id;
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Tên file không được để trống' });

    db.prepare('UPDATE file_nodes SET name = ?, updated_at = ? WHERE id = ?').run(name, now(), id);
    const updated = db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(id);
    res.json({ file: formatNode(updated) });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi đổi tên file', error: err.message });
  }
});

// 8. DELETE /api/v1/files/:id - Xóa file
router.delete('/:id', (req, res) => {
  try {
    const id = req.params.id;
    const row = db.prepare('SELECT * FROM file_nodes WHERE id = ?').get(id);
    if (row && row.storage_key) {
      const fullPath = getFilePath(row.storage_key);
      if (fs.existsSync(fullPath)) {
        try { fs.unlinkSync(fullPath); } catch (e) {}
      }
    }
    db.prepare('DELETE FROM file_nodes WHERE id = ?').run(id);
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi khi xóa file', error: err.message });
  }
});

export default router;
