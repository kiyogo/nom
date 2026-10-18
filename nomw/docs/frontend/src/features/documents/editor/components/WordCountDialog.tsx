import React from 'react';
import { DocumentModel } from '../core/model/document-model';
import { DocumentLayout } from '../core/layout/layout-types';
import { getWordSegments } from '../core/utils/unicode';
import { X } from 'lucide-react';

interface WordCountDialogProps {
  open: boolean;
  onClose: () => void;
  doc: DocumentModel;
  layout: DocumentLayout;
}

export const WordCountDialog: React.FC<WordCountDialogProps> = ({
  open,
  onClose,
  doc,
  layout,
}) => {
  if (!open) return null;

  // Calculate statistics across document
  let totalWords = 0;
  let totalChars = 0;
  let totalCharsNoSpaces = 0;

  for (const block of doc.blocks) {
    if ('runs' in block) {
      const text = doc.getBlockText(block);
      totalChars += text.length;
      totalCharsNoSpaces += text.replace(/\s+/g, '').length;

      const words = getWordSegments(text).filter((w) => w.isWordLike);
      totalWords += words.length;
    }
  }

  const pageCount = layout.pages.length;

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
          width: 360,
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
            padding: '14px 20px',
            borderBottom: '1px solid #E0E0E0',
          }}
        >
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#202124' }}>Số lượng từ</h3>
          <button
            type="button"
            onClick={onClose}
            style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#5F6368' }}
          >
            <X size={18} />
          </button>
        </div>

        <div style={{ padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#3C4043' }}>
            <span>Số trang:</span>
            <strong style={{ color: '#202124' }}>{pageCount}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#3C4043' }}>
            <span>Số từ:</span>
            <strong style={{ color: '#202124' }}>{totalWords.toLocaleString()}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#3C4043' }}>
            <span>Ký tự:</span>
            <strong style={{ color: '#202124' }}>{totalChars.toLocaleString()}</strong>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, color: '#3C4043' }}>
            <span>Ký tự không tính khoảng trắng:</span>
            <strong style={{ color: '#202124' }}>{totalCharsNoSpaces.toLocaleString()}</strong>
          </div>
        </div>

        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            padding: '10px 20px',
            borderTop: '1px solid #E0E0E0',
            background: '#F8F9FA',
          }}
        >
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
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
