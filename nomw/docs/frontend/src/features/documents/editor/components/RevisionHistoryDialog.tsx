import React, { useState, useEffect } from 'react';
import { documentApiService } from '../services/document-api-service';
import { X, History, RotateCcw, Clock } from 'lucide-react';

interface RevisionHistoryDialogProps {
  open: boolean;
  onClose: () => void;
  documentId: string;
  onRestoreRevision: (revisionData: any) => void;
}

export const RevisionHistoryDialog: React.FC<RevisionHistoryDialogProps> = ({
  open,
  onClose,
  documentId,
  onRestoreRevision,
}) => {
  if (!open) return null;

  const [history, setHistory] = useState<any[]>([]);
  const [selectedSnapshot, setSelectedSnapshot] = useState<any | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchHistory = async () => {
      setLoading(true);
      try {
        const res = await documentApiService.getHistory(documentId);
        setHistory(res.data.history || []);
        if (res.data.history && res.data.history.length > 0) {
          setSelectedSnapshot(res.data.history[0]);
        }
      } catch (e) {
        console.error('Failed to load document history:', e);
      } finally {
        setLoading(false);
      }
    };
    fetchHistory();
  }, [documentId]);

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
          width: 520,
          maxWidth: '92vw',
          maxHeight: '80vh',
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
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <History size={18} style={{ color: '#1A73E8' }} />
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#202124' }}>
              Lịch sử các phiên bản
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
        <div style={{ padding: '16px 20px', flex: 1, overflowY: 'auto' }}>
          {loading ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#757575' }}>Đang tải lịch sử...</div>
          ) : history.length === 0 ? (
            <div style={{ padding: 20, textAlign: 'center', color: '#757575' }}>
              Chưa có phiên bản lịch sử nào được ghi lại.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {history.map((h, i) => {
                const isSelected = selectedSnapshot?.id === h.id;
                const dateStr = new Date(h.created_at).toLocaleString('vi-VN');
                return (
                  <div
                    key={h.id}
                    onClick={() => setSelectedSnapshot(h)}
                    style={{
                      padding: '10px 14px',
                      borderRadius: 6,
                      border: `1px solid ${isSelected ? '#1A73E8' : '#DADCE0'}`,
                      background: isSelected ? '#E8F0FE' : '#FFFFFF',
                      cursor: 'pointer',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Clock size={16} style={{ color: isSelected ? '#1A73E8' : '#757575' }} />
                      <div>
                        <div style={{ fontSize: 13.5, fontWeight: 600, color: '#202124' }}>
                          Phiên bản #{h.revision} {i === 0 && '(Hiện tại)'}
                        </div>
                        <div style={{ fontSize: 11.5, color: '#5F6368' }}>{dateStr}</div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '12px 20px',
            borderTop: '1px solid #E0E0E0',
            background: '#F8F9FA',
          }}
        >
          <button
            type="button"
            onClick={onClose}
            style={{
              padding: '6px 14px',
              borderRadius: 4,
              border: 'none',
              background: '#1A73E8',
              color: '#FFFFFF',
              fontSize: 13,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
