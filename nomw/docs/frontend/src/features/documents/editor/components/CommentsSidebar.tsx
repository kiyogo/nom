import React, { useState } from 'react';
import { CommentsService, DocumentCommentItem } from '../core/comments/comments-service';
import { SelectionEngine } from '../core/selection/selection-engine';
import { X, MessageSquare, Check, Trash2, Send } from 'lucide-react';

interface CommentsSidebarProps {
  open: boolean;
  onClose: () => void;
  commentsService: CommentsService;
  comments: DocumentCommentItem[];
  selectionEngine: SelectionEngine;
  currentUserId?: string;
  onAddComment: (body: string) => void;
  onResolveComment: (commentId: string, resolved: boolean) => void;
  onDeleteComment: (commentId: string) => void;
}

export const CommentsSidebar: React.FC<CommentsSidebarProps> = ({
  open,
  onClose,
  commentsService,
  comments,
  selectionEngine,
  currentUserId,
  onAddComment,
  onResolveComment,
  onDeleteComment,
}) => {
  if (!open) return null;

  const [newCommentBody, setNewCommentBody] = useState('');

  const handlePost = () => {
    if (!newCommentBody.trim()) return;
    onAddComment(newCommentBody.trim());
    setNewCommentBody('');
  };

  return (
    <aside
      className="doc-comments-sidebar"
      style={{
        width: 300,
        height: '100%',
        background: '#FFFFFF',
        borderLeft: '1px solid #E0E0E0',
        display: 'flex',
        flexDirection: 'column',
        flexShrink: 0,
        zIndex: 50,
      }}
    >
      {/* Header */}
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
          <MessageSquare size={16} style={{ color: '#1A73E8' }} />
          <span style={{ fontSize: 14, fontWeight: 600, color: '#202124' }}>Nhận xét & Hoạt động</span>
        </div>
        <button
          type="button"
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#5F6368' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* New Comment Input */}
      <div style={{ padding: '12px 16px', borderBottom: '1px solid #F1F3F4' }}>
        <textarea
          placeholder="Thêm nhận xét tại vị trí con trỏ..."
          value={newCommentBody}
          onChange={(e) => setNewCommentBody(e.target.value)}
          rows={2}
          style={{
            width: '100%',
            borderRadius: 6,
            border: '1px solid #DADCE0',
            padding: '8px',
            fontSize: 13,
            outline: 'none',
            resize: 'none',
            fontFamily: 'inherit',
          }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
          <button
            type="button"
            onClick={handlePost}
            disabled={!newCommentBody.trim()}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 4,
              padding: '4px 12px',
              borderRadius: 4,
              border: 'none',
              background: '#1A73E8',
              color: '#FFFFFF',
              fontSize: 12.5,
              fontWeight: 600,
              cursor: newCommentBody.trim() ? 'pointer' : 'default',
              opacity: newCommentBody.trim() ? 1 : 0.6,
            }}
          >
            <Send size={12} />
            <span>Đăng</span>
          </button>
        </div>
      </div>

      {/* Comments List */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '12px 16px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {comments.length === 0 ? (
          <div style={{ textAlign: 'center', color: '#757575', fontSize: 13, padding: '24px 0' }}>
            Chưa có nhận xét nào trong tài liệu này.
          </div>
        ) : (
          comments.map((c) => {
            const dateStr = new Date(c.createdAt).toLocaleDateString('vi-VN', {
              hour: '2-digit',
              minute: '2-digit',
            });
            return (
              <div
                key={c.id}
                style={{
                  background: c.resolved ? '#F8F9FA' : '#FFFFFF',
                  borderRadius: 6,
                  border: `1px solid ${c.resolved ? '#E0E0E0' : '#D3E3FD'}`,
                  padding: 10,
                  boxShadow: c.resolved ? 'none' : '0 1px 3px rgba(0,0,0,0.06)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: '#1A73E8',
                        color: '#FFFFFF',
                        fontSize: 10,
                        fontWeight: 700,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                      }}
                    >
                      {(c.authorName || 'U').slice(0, 1).toUpperCase()}
                    </div>
                    <span style={{ fontSize: 12.5, fontWeight: 600, color: '#202124' }}>
                      {c.authorName || 'Người dùng'}
                    </span>
                  </div>
                  <span style={{ fontSize: 10.5, color: '#757575' }}>{dateStr}</span>
                </div>

                <p style={{ margin: '4px 0 8px 0', fontSize: 13, color: '#3C4043', whiteSpace: 'pre-wrap' }}>
                  {c.body}
                </p>

                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 6 }}>
                  <button
                    type="button"
                    title={c.resolved ? 'Mở lại nhận xét' : 'Đánh dấu đã giải quyết'}
                    onClick={() => onResolveComment(c.id, !c.resolved)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: 4,
                      border: 'none',
                      background: 'transparent',
                      color: c.resolved ? '#188038' : '#5F6368',
                      fontSize: 11.5,
                      cursor: 'pointer',
                      padding: '2px 6px',
                      borderRadius: 3,
                    }}
                  >
                    <Check size={12} />
                    <span>{c.resolved ? 'Đã giải quyết' : 'Giải quyết'}</span>
                  </button>

                  <button
                    type="button"
                    title="Xóa nhận xét"
                    onClick={() => onDeleteComment(c.id)}
                    style={{
                      border: 'none',
                      background: 'transparent',
                      color: '#D93025',
                      fontSize: 11.5,
                      cursor: 'pointer',
                      padding: '2px 4px',
                    }}
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
