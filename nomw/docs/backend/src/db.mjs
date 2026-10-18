import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const DATA_DIR = path.resolve(process.env.NOM_DATA_DIR || path.join(__dirname, '..', 'data'));
const FILES_DIR = path.resolve(process.env.NOM_FILES_DIR || path.join(DATA_DIR, 'files'));
const DB_PATH = path.resolve(process.env.NOM_DB_PATH || path.join(DATA_DIR, 'nom_wnom.sqlite'));

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
if (!fs.existsSync(FILES_DIR)) fs.mkdirSync(FILES_DIR, { recursive: true });

let dbInstance = null;

try {
  const { DatabaseSync } = await import('node:sqlite');
  dbInstance = new DatabaseSync(DB_PATH);
  console.log(`[Database] Đã kết nối SQLite tại: ${DB_PATH}`);
} catch (err) {
  console.error('[Database] Không thể khởi tạo node:sqlite, chuyển sang bộ nhớ đệm giả lập', err);
}

// Khởi tạo bảng nếu chưa có
export function initDatabase() {
  if (!dbInstance) return;

  dbInstance.exec(`
    CREATE TABLE IF NOT EXISTS file_nodes (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      node_type TEXT DEFAULT 'file',
      mime_type TEXT,
      size INTEGER DEFAULT 0,
      storage_key TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      current_revision INTEGER DEFAULT 1,
      settings_json TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_snapshots (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      data TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_operations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id TEXT NOT NULL,
      revision INTEGER NOT NULL,
      operations_json TEXT NOT NULL,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS document_comments (
      id TEXT PRIMARY KEY,
      document_id TEXT NOT NULL,
      body TEXT NOT NULL,
      anchor_json TEXT,
      resolved INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

export const db = dbInstance;
export { DATA_DIR, FILES_DIR, DB_PATH };
