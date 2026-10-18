import React, { useState, useEffect } from 'react';
import { documentApiService } from '../services/document-api-service';
import { X, Copy, Check, UserPlus, Shield, User } from 'lucide-react';

interface ShareDialogProps {
  open: boolean;
  onClose: () => void;
  documentId: string;
  documentTitle: string;
}

export const ShareDialog: React.FC<ShareDialogProps> = ({
  open,
  onClose,
  documentId,
  documentTitle,
}) => {
  if (!open) return null;

  const [emailOrUser, setEmailOrUser] = useState('');
  const [role, setRole] = useState<'editor' | 'commenter' | 'viewer'>('editor');
  const [members, setMembers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadMembers = async () => {
    try {
      const res = await documentApiService.getMembers(documentId);
      setMembers(res.data.members || []);
    } catch (e) {}
  };

  useEffect(() => {
    loadMembers();
  }, [documentId]);

  const handleAddMember = async () => {
    if (!emailOrUser.trim()) return;
    setLoading(true);
    try {
      await documentApiService.share(documentId, {
        email: emailOrUser.trim(),
        role,
      });
      setEmailOrUser('');
      await loadMembers();
    } catch (e) {
      alert('Không tìm thấy tài khoản người dùng tương ứng.');
    } finally {
      setLoading(false);
    }
  };

  const handleCopyLink = () => {
    const link = window.location.href;
    navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
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
          width: 480,
          maxWidth: '92vw',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {/* Header */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '14px 20px',
            borderBottom: '1px solid #E0E0E0',
          }}
        >
          <div style={{ minWidth: 0 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#202124' }}>
              Chia sẻ “{documentTitle}”
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#5F6368' }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Invite input */}
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              type="text"
              placeholder="Thêm người hoặc email..."
              value={emailOrUser}
              onChange={(e) => setEmailOrUser(e.target.value)}
              style={{
                flex: 1,
                height: 36,
                borderRadius: 4,
                border: '1px solid #DADCE0',
                padding: '0 10px',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as any)}
              style={{
                height: 36,
                borderRadius: 4,
                border: '1px solid #DADCE0',
                padding: '0 8px',
                fontSize: 13,
                outline: 'none',
                background: '#FFFFFF',
              }}
            >
              <option value="editor">Người chỉnh sửa</option>
              <option value="commenter">Người nhận xét</option>
              <option value="viewer">Người xem</option>
            </select>
            <button
              type="button"
              onClick={handleAddMember}
              disabled={loading || !emailOrUser.trim()}
              style={{
                padding: '0 14px',
                borderRadius: 4,
                border: 'none',
                background: '#1A73E8',
                color: '#FFFFFF',
                fontSize: 13,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Thêm
            </button>
          </div>

          {/* Members list */}
          <div>
            <span style={{ fontSize: 12, fontWeight: 600, color: '#5F6368', textTransform: 'uppercase' }}>
              Người có quyền truy cập
            </span>
            <div
              style={{
                marginTop: 8,
                maxHeight: 180,
                overflowY: 'auto',
                display: 'flex',
                flexDirection: 'column',
                gap: 8,
              }}
            >
              {members.length === 0 ? (
                <div style={{ fontSize: 13, color: '#757575', padding: '6px 0' }}>
                  Chưa có cộng tác viên nào được thêm.
                </div>
              ) : (
                members.map((m) => (
                  <div
                    key={m.id}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      padding: '4px 0',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <div
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: '50%',
                          background: '#0F6CBD',
                          color: '#FFFFFF',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: 12,
                          fontWeight: 600,
                        }}
                      >
                        {(m.name || 'U').slice(0, 1).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ fontSize: 13, fontWeight: 500, color: '#202124' }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: '#5F6368' }}>{m.email}</div>
                      </div>
                    </div>
                    <span style={{ fontSize: 12, color: '#5F6368' }}>
                      {m.role === 'editor' ? 'Người chỉnh sửa' : m.role === 'commenter' ? 'Người nhận xét' : 'Người xem'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            padding: '12px 20px',
            borderTop: '1px solid #E0E0E0',
            background: '#F8F9FA',
          }}
        >
          <button
            type="button"
            onClick={handleCopyLink}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 6,
              padding: '6px 12px',
              borderRadius: 20,
              border: '1px solid #DADCE0',
              background: '#FFFFFF',
              color: '#1A73E8',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            {copied ? <Check size={14} style={{ color: '#188038' }} /> : <Copy size={14} />}
            <span>{copied ? 'Đã sao chép đường liên kết' : 'Sao chép đường liên kết'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 16px',
              borderRadius: 4,
              border: 'none',
              background: '#1A73E8',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );
};
