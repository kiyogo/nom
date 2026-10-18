import React, { useState } from 'react';
import { DocumentSettings } from '../core/model/types';
import { PaperSize } from '../core/utils/units';
import { X } from 'lucide-react';

interface PageSetupDialogProps {
  open: boolean;
  onClose: () => void;
  settings: DocumentSettings;
  onSaveSettings: (settings: DocumentSettings) => void;
}

export const PageSetupDialog: React.FC<PageSetupDialogProps> = ({
  open,
  onClose,
  settings,
  onSaveSettings,
}) => {
  if (!open) return null;

  const [pageSize, setPageSize] = useState<PaperSize>(settings.pageSize || 'A4');
  const [orientation, setOrientation] = useState<'portrait' | 'landscape'>(settings.orientation || 'portrait');
  const [marginTop, setMarginTop] = useState(settings.margins.top || 72);
  const [marginBottom, setMarginBottom] = useState(settings.margins.bottom || 72);
  const [marginLeft, setMarginLeft] = useState(settings.margins.left || 72);
  const [marginRight, setMarginRight] = useState(settings.margins.right || 72);
  const [pageColor, setPageColor] = useState(settings.pageColor || '#FFFFFF');

  const handleApply = () => {
    onSaveSettings({
      pageSize,
      orientation,
      margins: {
        top: Number(marginTop) || 72,
        bottom: Number(marginBottom) || 72,
        left: Number(marginLeft) || 72,
        right: Number(marginRight) || 72,
      },
      pageColor,
    });
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
          width: 440,
          maxWidth: '90vw',
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
          <h3 style={{ margin: 0, fontSize: 16, fontWeight: 600, color: '#202124' }}>Thiết lập trang</h3>
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
          {/* Orientation */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3C4043', marginBottom: 6 }}>
              Hướng giấy
            </label>
            <div style={{ display: 'flex', gap: 16 }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="orientation"
                  value="portrait"
                  checked={orientation === 'portrait'}
                  onChange={() => setOrientation('portrait')}
                />
                Dọc (Portrait)
              </label>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 13, cursor: 'pointer' }}>
                <input
                  type="radio"
                  name="orientation"
                  value="landscape"
                  checked={orientation === 'landscape'}
                  onChange={() => setOrientation('landscape')}
                />
                Ngang (Landscape)
              </label>
            </div>
          </div>

          {/* Paper Size */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3C4043', marginBottom: 6 }}>
              Khổ giấy
            </label>
            <select
              value={pageSize}
              onChange={(e) => setPageSize(e.target.value as PaperSize)}
              style={{
                width: '100%',
                height: 34,
                borderRadius: 4,
                border: '1px solid #DADCE0',
                padding: '0 8px',
                fontSize: 13,
                outline: 'none',
              }}
            >
              <option value="A4">A4 (210 mm x 297 mm)</option>
              <option value="Letter">Letter (8.5 in x 11 in)</option>
              <option value="Legal">Legal (8.5 in x 14 in)</option>
              <option value="A3">A3 (297 mm x 420 mm)</option>
              <option value="A5">A5 (148 mm x 210 mm)</option>
            </select>
          </div>

          {/* Margins */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3C4043', marginBottom: 6 }}>
              Lề trang (px / pt)
            </label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              <div>
                <span style={{ fontSize: 12, color: '#5F6368' }}>Trên (Top):</span>
                <input
                  type="number"
                  value={marginTop}
                  onChange={(e) => setMarginTop(Number(e.target.value))}
                  style={{ width: '100%', height: 30, borderRadius: 4, border: '1px solid #DADCE0', padding: '0 8px', fontSize: 13 }}
                />
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#5F6368' }}>Dưới (Bottom):</span>
                <input
                  type="number"
                  value={marginBottom}
                  onChange={(e) => setMarginBottom(Number(e.target.value))}
                  style={{ width: '100%', height: 30, borderRadius: 4, border: '1px solid #DADCE0', padding: '0 8px', fontSize: 13 }}
                />
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#5F6368' }}>Trái (Left):</span>
                <input
                  type="number"
                  value={marginLeft}
                  onChange={(e) => setMarginLeft(Number(e.target.value))}
                  style={{ width: '100%', height: 30, borderRadius: 4, border: '1px solid #DADCE0', padding: '0 8px', fontSize: 13 }}
                />
              </div>
              <div>
                <span style={{ fontSize: 12, color: '#5F6368' }}>Phải (Right):</span>
                <input
                  type="number"
                  value={marginRight}
                  onChange={(e) => setMarginRight(Number(e.target.value))}
                  style={{ width: '100%', height: 30, borderRadius: 4, border: '1px solid #DADCE0', padding: '0 8px', fontSize: 13 }}
                />
              </div>
            </div>
          </div>

          {/* Page Color */}
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#3C4043', marginBottom: 6 }}>
              Màu nền trang
            </label>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <input
                type="color"
                value={pageColor}
                onChange={(e) => setPageColor(e.target.value)}
                style={{ width: 36, height: 36, border: '1px solid #DADCE0', borderRadius: 4, cursor: 'pointer' }}
              />
              <span style={{ fontSize: 13, color: '#5F6368' }}>{pageColor}</span>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
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
              border: '1px solid #DADCE0',
              background: '#FFFFFF',
              color: '#3C4043',
              fontSize: 13,
              fontWeight: 500,
              cursor: 'pointer',
            }}
          >
            Hủy bỏ
          </button>
          <button
            type="button"
            onClick={handleApply}
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
            Áp dụng
          </button>
        </div>
      </div>
    </div>
  );
};
