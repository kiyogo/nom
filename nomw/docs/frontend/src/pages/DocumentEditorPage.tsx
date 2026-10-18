import React, { useState, useEffect } from 'react';
import { useParams, useNavigate, useLocation } from 'react-router-dom';
import { DocxEditorModal } from '../components/editor/DocxEditorModal';
import { filesApi } from '../api/endpoints';
import { getFileBlob, storeFileBlob } from '../utils/fileStorage';
import { generateValidDocxBlob } from '../utils/fileExporter';

export const DocumentEditorPage: React.FC = () => {
  const params = useParams<{ type?: string; fileKey?: string; '*': string }>();
  const location = useLocation();
  const navigate = useNavigate();

  let docType = (params.type || 'wnom').toLowerCase().replace(/^\./, '');
  let fileKey = params.fileKey || '';

  if (!fileKey || location.pathname.includes('/wnom/') || location.pathname.includes('/docx/')) {
    const cleanPath = location.pathname.replace(/^\/(files\/)?document\//, '');
    const parts = cleanPath.split('/').filter(Boolean);
    if (parts.length > 0) {
      if (['wnom', 'docx', 'doc', 'pdf', 'txt'].includes(parts[0].toLowerCase())) {
        docType = parts[0].toLowerCase();
        parts.shift();
      }
      if (parts.length > 0 && parts[parts.length - 1] === 'edit') {
        parts.pop();
      }
      fileKey = decodeURIComponent(parts.join('/'));
    }
  } else if (fileKey.endsWith('/edit')) {
    fileKey = fileKey.slice(0, -5);
  }

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [docName, setDocName] = useState<string>('');
  const [saveStatus, setSaveStatus] = useState<string>('Đã đồng bộ');

  useEffect(() => {
    const loadFileData = async () => {
      setLoading(true);
      setLoadError(null);
      try {
        let name = `Van_Ban_${fileKey ? fileKey.slice(0, 8) : 'Moi'}.wnom`;

        // 1. Thử lấy metadata từ server
        if (fileKey) {
          try {
            const metaRes = await filesApi.get(fileKey);
            if (metaRes.data?.file?.name) {
              name = metaRes.data.file.name;
            }
          } catch (e) {
            // Không sao nếu backend trả 404 cho file mới chưa lưu
          }
        }

        setDocName(name);

        // 2. Thử lấy blob từ IndexedDB hoặc server
        let storedBlob: Blob | null = null;
        if (fileKey) {
          storedBlob = await getFileBlob(fileKey);
          if (!storedBlob) {
            try {
              const response = await filesApi.download(fileKey);
              if (response.data && response.data.size > 0) {
                storedBlob = response.data;
                await storeFileBlob(fileKey, storedBlob);
              }
            } catch (e) {
              // File chưa có trên server
            }
          }
        }

        // 3. Nếu chưa có blob (file mới hoặc test), tạo blob wnom chuẩn
        if (!storedBlob) {
          const title = name.replace(/\.wnom$/i, '').replace(/_/g, ' ') || 'VĂN BẢN QUẢN TRỊ NÔM';
          const sampleHtml = `<div style="font-family: Arial, sans-serif;">
            <h1 style="text-align: center; font-size: 18pt; margin-bottom: 8px;">${title}</h1>
            <p style="text-align: center; font-size: 11pt; color: #555; margin-bottom: 24px;">Số: NOM-DOC-2026/001 - Biên tập văn bản Nôm Wnom</p>
            <p style="text-indent: 28px; line-height: 1.6; margin-bottom: 12px;">Hệ thống Trình soạn thảo Văn Nôm (.wnom) trực tuyến thế hệ mới.</p>
            <p style="text-indent: 28px; line-height: 1.6; margin-bottom: 12px;">Hỗ trợ đầy đủ định dạng văn bản chuẩn Nôm Wnom.</p>
            <p style="text-indent: 28px; line-height: 1.6; margin-bottom: 12px;">Tương thích hoàn toàn với các quy tắc căn lề, font chữ, bảng biểu, ký tên, ngắt trang và xuất bản.</p>
            <p style="text-indent: 28px; line-height: 1.6; margin-bottom: 12px;">Mọi thay đổi được lưu trữ đồng bộ giữa máy trạm và máy chủ thời gian thực.</p>
          </div>`;
          const sampleBlob = generateValidDocxBlob(sampleHtml, name);
          if (fileKey) {
            await storeFileBlob(fileKey, sampleBlob);
          }
        }
      } catch (err: any) {
        console.error('Failed to load document:', err);
        setLoadError(err?.response?.data?.message || 'Không thể tải tài liệu từ máy chủ.');
      } finally {
        setLoading(false);
      }
    };

    loadFileData();
  }, [fileKey, docType]);

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F3F5F7', color: '#334155', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ width: 360, padding: 28, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)', textAlign: 'center' }}>
          <div style={{ width: 34, height: 34, border: '3px solid #BFDBFE', borderTopColor: '#2563EB', borderRadius: '50%', margin: '0 auto 14px', animation: 'doc-editor-spin 0.8s linear infinite' }} />
          <strong style={{ display: 'block', fontSize: 16, color: '#1E293B' }}>Đang nạp Văn bản Nôm</strong>
          <span style={{ display: 'block', marginTop: 8, fontSize: 13, color: '#64748B' }}>Chuẩn bị môi trường soạn thảo Word Canvas...</span>
        </div>
        <style>{'@keyframes doc-editor-spin { to { transform: rotate(360deg); } }'}</style>
      </div>
    );
  }

  if (loadError) {
    return (
      <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: '#F3F5F7', fontFamily: 'Arial, sans-serif' }}>
        <div style={{ width: 420, padding: 28, background: '#FFFFFF', border: '1px solid #FECACA', borderRadius: 12, boxShadow: '0 12px 32px rgba(15, 23, 42, 0.12)', textAlign: 'center' }}>
          <strong style={{ display: 'block', fontSize: 16, color: '#B91C1C' }}>Không thể mở tài liệu</strong>
          <span style={{ display: 'block', marginTop: 8, fontSize: 13, color: '#64748B' }}>{loadError}</span>
          <button
            type="button"
            onClick={() => navigate('/')}
            style={{ marginTop: 18, border: 'none', borderRadius: 6, background: '#2563EB', color: '#FFFFFF', padding: '8px 14px', cursor: 'pointer', fontWeight: 500 }}
          >
            Quay lại danh sách
          </button>
        </div>
      </div>
    );
  }

  return (
    <DocxEditorModal
      open={true}
      onClose={() => {
        if (window.opener) {
          window.close();
        } else if (window.history.length > 1) {
          navigate(-1);
        } else {
          navigate('/');
        }
      }}
      fileName={docName || `Van_ban_${fileKey || 'moi'}.wnom`}
      fileKey={fileKey || 'default-doc'}
      onSaveSuccess={(updatedName, updatedBlob) => {
        void (async () => {
          try {
            if (updatedBlob && fileKey) {
              await filesApi.updateContent(fileKey, updatedBlob);
              await storeFileBlob(fileKey, updatedBlob);
            }
            if (updatedName && updatedName !== docName && fileKey) {
              await filesApi.update(fileKey, updatedName);
              setDocName(updatedName);
            }
            setSaveStatus('Đã đồng bộ máy chủ');
          } catch {
            setSaveStatus('Đã lưu cục bộ (Chưa thể đồng bộ lên máy chủ)');
          }
        })();
      }}
    />
  );
};

export default DocumentEditorPage;
