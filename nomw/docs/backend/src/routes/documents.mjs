import express from 'express';
import crypto from 'node:crypto';
import { db } from '../db.mjs';

const router = express.Router();

function now() {
  return new Date().toISOString();
}

// 1. GET /api/v1/documents
router.get('/', (req, res) => {
  try {
    const docs = db.prepare('SELECT * FROM documents ORDER BY updated_at DESC').all();
    res.json({
      data: docs.map((d) => ({
        id: d.id,
        title: d.title,
        ownerId: 'nom-admin',
        ownerName: 'Văn Nôm Admin',
        ownerCode: 'NOM001',
        currentRevision: d.current_revision,
        settings: d.settings_json ? JSON.parse(d.settings_json) : {},
        userRole: 'owner',
        createdAt: d.created_at,
        updatedAt: d.updated_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lấy danh sách documents', error: err.message });
  }
});

// 2. GET /api/v1/documents/:id
router.get('/:id', (req, res) => {
  try {
    const id = req.params.id;
    let doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    if (!doc) {
      const time = now();
      db.prepare(`
        INSERT INTO documents (id, title, current_revision, settings_json, created_at, updated_at)
        VALUES (?, 'Tài liệu mới', 1, '{}', ?, ?)
      `).run(id, time, time);
      doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    }

    const snap = db.prepare('SELECT * FROM document_snapshots WHERE document_id = ? ORDER BY revision DESC LIMIT 1').get(id);
    const ops = db.prepare('SELECT * FROM document_operations WHERE document_id = ? ORDER BY revision ASC').all(id);

    res.json({
      document: {
        id: doc.id,
        title: doc.title,
        ownerId: 'nom-admin',
        ownerName: 'Văn Nôm Admin',
        ownerCode: 'NOM001',
        currentRevision: doc.current_revision,
        settings: doc.settings_json ? JSON.parse(doc.settings_json) : {},
        userRole: 'owner',
        createdAt: doc.created_at,
        updatedAt: doc.updated_at,
      },
      snapshot: snap ? { revision: snap.revision, data: snap.data } : null,
      operations: ops.map((o) => (o.operations_json ? JSON.parse(o.operations_json) : null)).filter(Boolean),
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lấy chi tiết document', error: err.message });
  }
});

// 3. POST /api/v1/documents/:id/snapshots
router.post('/:id/snapshots', (req, res) => {
  try {
    const id = req.params.id;
    const { revision, data } = req.body;
    db.prepare(`
      INSERT INTO document_snapshots (document_id, revision, data, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, revision || 1, data || '', now());

    db.prepare('UPDATE documents SET current_revision = ?, updated_at = ? WHERE id = ?').run(revision || 1, now(), id);

    res.json({ success: true, revision: revision || 1 });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lưu snapshot', error: err.message });
  }
});

// 4. POST /api/v1/documents/:id/operations
router.post('/:id/operations', (req, res) => {
  try {
    const id = req.params.id;
    const { operations, snapshot } = req.body;
    const doc = db.prepare('SELECT * FROM documents WHERE id = ?').get(id);
    const newRev = (doc?.current_revision || 0) + 1;

    db.prepare(`
      INSERT INTO document_operations (document_id, revision, operations_json, created_at)
      VALUES (?, ?, ?, ?)
    `).run(id, newRev, JSON.stringify(operations || []), now());

    if (snapshot) {
      db.prepare(`
        INSERT INTO document_snapshots (document_id, revision, data, created_at)
        VALUES (?, ?, ?, ?)
      `).run(id, snapshot.revision || newRev, snapshot.data, now());
    }

    db.prepare('UPDATE documents SET current_revision = ?, updated_at = ? WHERE id = ?').run(newRev, now(), id);

    res.json({ success: true, revision: newRev });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lưu operations', error: err.message });
  }
});

// 5. GET /api/v1/documents/:id/comments
router.get('/:id/comments', (req, res) => {
  try {
    const id = req.params.id;
    const rows = db.prepare('SELECT * FROM document_comments WHERE document_id = ? ORDER BY created_at ASC').all(id);
    res.json({
      comments: rows.map((r) => ({
        id: r.id,
        documentId: r.document_id,
        body: r.body,
        anchor: r.anchor_json ? JSON.parse(r.anchor_json) : null,
        resolved: Boolean(r.resolved),
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })),
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi lấy bình luận', error: err.message });
  }
});

// 6. POST /api/v1/documents/:id/comments
router.post('/:id/comments', (req, res) => {
  try {
    const id = req.params.id;
    const { anchor, body } = req.body;
    const commentId = crypto.randomUUID();
    const time = now();

    db.prepare(`
      INSERT INTO document_comments (id, document_id, body, anchor_json, resolved, created_at, updated_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(commentId, id, body || '', JSON.stringify(anchor || null), time, time);

    res.status(201).json({
      comment: {
        id: commentId,
        documentId: id,
        body,
        anchor,
        resolved: false,
        createdAt: time,
        updatedAt: time,
      },
    });
  } catch (err) {
    res.status(500).json({ message: 'Lỗi thêm bình luận', error: err.message });
  }
});

export default router;
