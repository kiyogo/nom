import React, { useState, useRef, useEffect } from 'react';
import {
  FileText,
  Check,
  CloudUpload,
  CloudOff,
  History,
  MessageSquare,
  Share2,
  Lock,
  ArrowLeft,
} from 'lucide-react';
import { RemoteCollaboratorPresence } from '../core/rendering/interaction-renderer';

interface EditorHeaderProps {
  title: string;
  saveState: 'saved' | 'saving' | 'unsaved' | 'offline' | 'error';
  collaborators: RemoteCollaboratorPresence[];
  currentUser?: { name: string; email: string } | null;
  onTitleChange: (newTitle: string) => void;
  onOpenShare: () => void;
  onOpenHistory: () => void;
  onToggleComments: () => void;
  onGoBack?: () => void;
}

export const EditorHeader: React.FC<EditorHeaderProps> = ({
  title,
  saveState,
  collaborators,
  currentUser,
  onTitleChange,
  onOpenShare,
  onOpenHistory,
  onToggleComments,
  onGoBack,
}) => {
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [currentTitle, setCurrentTitle] = useState(title);
  const titleInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    setCurrentTitle(title);
  }, [title]);

  useEffect(() => {
    if (isEditingTitle) {
      titleInputRef.current?.focus();
      titleInputRef.current?.select();
    }
  }, [isEditingTitle]);

  const handleCommitTitle = () => {
    setIsEditingTitle(false);
    const clean = currentTitle.trim();
    const finalTitle = clean.length > 0 ? clean : 'Văn bản chưa đặt tên';
    setCurrentTitle(finalTitle);
    if (finalTitle !== title) {
      onTitleChange(finalTitle);
    }
  };

  const renderSaveIcon = () => {
    if (saveState === 'saving') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#5F6368', fontSize: 12 }}>
          <CloudUpload size={14} className="animate-pulse" style={{ color: '#1A73E8' }} />
          <span>Đang lưu...</span>
        </span>
      );
    }
    if (saveState === 'offline') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#D93025', fontSize: 12 }}>
          <CloudOff size={14} />
          <span>Ngoại tuyến (Đã lưu cục bộ)</span>
        </span>
      );
    }
    if (saveState === 'error') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#D93025', fontSize: 12 }}>
          <CloudOff size={14} />
          <span>Lưu thất bại</span>
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: '#5F6368', fontSize: 12 }} title="Tất cả thay đổi đã được lưu vào bộ nhớ">
        <Check size={14} style={{ color: '#188038' }} />
        <span>Đã lưu vào bộ nhớ</span>
      </span>
    );
  };

  return (
    <header
      className="doc-editor-header"
      style={{
        height: 48,
        minHeight: 48,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '0 16px',
        background: '#FFFFFF',
        borderBottom: '1px solid #E0E0E0',
        userSelect: 'none',
        flexShrink: 0,
        gap: 12,
      }}
    >
      {/* Left section: Back button, Doc Icon, Editable Title & Save status */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, flex: 1 }}>
        {onGoBack && (
          <button
            type="button"
            onClick={onGoBack}
            title="Quay lại danh sách tệp"
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 32,
              height: 32,
              borderRadius: '50%',
              border: 'none',
              background: 'transparent',
              cursor: 'pointer',
              color: '#5F6368',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
            onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
          >
            <ArrowLeft size={18} />
          </button>
        )}

        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: 6,
            background: '#E8F0FE',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            color: '#1A73E8',
            flexShrink: 0,
          }}
        >
          <FileText size={20} />
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
          {isEditingTitle ? (
            <input
              ref={titleInputRef}
              type="text"
              value={currentTitle}
              onChange={(e) => setCurrentTitle(e.target.value)}
              onBlur={handleCommitTitle}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCommitTitle();
                if (e.key === 'Escape') {
                  setCurrentTitle(title);
                  setIsEditingTitle(false);
                }
              }}
              style={{
                fontSize: 16,
                fontWeight: 600,
                color: '#202124',
                padding: '1px 6px',
                border: '1px solid #1A73E8',
                borderRadius: 4,
                outline: 'none',
                background: '#FFFFFF',
                width: 'auto',
                minWidth: 150,
                maxWidth: 400,
              }}
            />
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span
                onClick={() => setIsEditingTitle(true)}
                title="Nhấp để đổi tên tài liệu"
                style={{
                  fontSize: 16,
                  fontWeight: 600,
                  color: '#202124',
                  cursor: 'pointer',
                  padding: '1px 6px',
                  borderRadius: 4,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                  maxWidth: 360,
                }}
                onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
                onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
              >
                {currentTitle || 'Văn bản chưa đặt tên'}
              </span>
              {renderSaveIcon()}
            </div>
          )}
        </div>
      </div>

      {/* Right section: Presence avatars, Comments button, History button, Share button */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
        {/* Collaborators Avatar Stack */}
        <div style={{ display: 'flex', alignItems: 'center', marginRight: 4 }}>
          {collaborators.map((c, idx) => (
            <div
              key={`${c.userId}-${idx}`}
              title={`${c.name} đang xem`}
              style={{
                width: 28,
                height: 28,
                borderRadius: '50%',
                background: c.color || '#0F6CBD',
                color: '#FFFFFF',
                fontSize: 11,
                fontWeight: 700,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginLeft: idx > 0 ? -6 : 0,
                border: '2px solid #FFFFFF',
                boxShadow: '0 1px 2px rgba(0,0,0,0.15)',
              }}
            >
              {c.name.slice(0, 2).toUpperCase()}
            </div>
          ))}
        </div>

        {/* Revision History button */}
        <button
          type="button"
          onClick={onOpenHistory}
          title="Lịch sử phiên bản"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#5F6368',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <History size={18} />
        </button>

        {/* Comments Sidebar button */}
        <button
          type="button"
          onClick={onToggleComments}
          title="Bình luận"
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 32,
            height: 32,
            borderRadius: '50%',
            border: 'none',
            background: 'transparent',
            cursor: 'pointer',
            color: '#5F6368',
            transition: 'background 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#F1F3F4')}
          onMouseLeave={(e) => (e.currentTarget.style.background = 'transparent')}
        >
          <MessageSquare size={18} />
        </button>

        {/* Share Button */}
        <button
          type="button"
          onClick={onOpenShare}
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 6,
            padding: '6px 16px',
            borderRadius: 20,
            border: 'none',
            background: '#1A73E8',
            color: '#FFFFFF',
            fontSize: 13.5,
            fontWeight: 600,
            cursor: 'pointer',
            boxShadow: '0 1px 3px rgba(0,0,0,0.12)',
            transition: 'background 0.15s, box-shadow 0.15s',
          }}
          onMouseEnter={(e) => (e.currentTarget.style.background = '#1765CC')}
          onMouseLeave={(e) => (e.currentTarget.style.background = '#1A73E8')}
        >
          <Lock size={14} />
          <span>Chia sẻ</span>
        </button>
      </div>
    </header>
  );
};
