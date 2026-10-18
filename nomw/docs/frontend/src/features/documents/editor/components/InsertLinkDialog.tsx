import React, { useState } from 'react';
import { X, Link as LinkIcon } from 'lucide-react';

interface InsertLinkDialogProps {
  open: boolean;
  onClose: () => void;
  onInsertLink: (url: string) => void;
}

export const InsertLinkDialog: React.FC<InsertLinkDialogProps> = ({
  open,
  onClose,
  onInsertLink,
}) => {
  if (!open) return null;

  const [url, setUrl] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    let finalUrl = url.trim();
    if (!/^https?:\/\//i.test(finalUrl) && !/^mailto:/i.test(finalUrl)) {
      finalUrl = `https://${finalUrl}`;
    }
    onInsertLink(finalUrl);
    onClose();
  };

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(0, 0, 0, 0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
        backdropFilter: 'blur(2px)',
      }}
    >
      <div
        style={{
          background: '#FFFFFF',
          borderRadius: 8,
          boxShadow: '0 8px 24px rgba(0, 0, 0, 0.2)',
          width: 380,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 16px',
            borderBottom: '1px solid #E0E0E0',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <LinkIcon size={16} style={{ color: '#1A73E8' }} />
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#202124' }}>
              Chèn đường liên kết
            </h4>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#5F6368' }}
          >
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ padding: 16, display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div>
            <label style={{ display: 'block', fontSize: 12.5, fontWeight: 500, color: '#3C4043', marginBottom: 4 }}>
              Đường dẫn liên kết (URL):
            </label>
            <input
              type="text"
              placeholder="https://example.com"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              autoFocus
              style={{
                width: '100%',
                height: 32,
                borderRadius: 4,
                border: '1px solid #DADCE0',
                padding: '0 8px',
                fontSize: 13,
                outline: 'none',
              }}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
            <button
              type="button"
              onClick={onClose}
              style={{
                padding: '5px 12px',
                borderRadius: 4,
                border: '1px solid #DADCE0',
                background: '#FFFFFF',
                fontSize: 12.5,
                fontWeight: 500,
                cursor: 'pointer',
              }}
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={!url.trim()}
              style={{
                padding: '5px 14px',
                borderRadius: 4,
                border: 'none',
                background: '#1A73E8',
                color: '#FFFFFF',
                fontSize: 12.5,
                fontWeight: 600,
                cursor: url.trim() ? 'pointer' : 'default',
              }}
            >
              Áp dụng
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
