import React, { useState } from 'react';
import { X, Table } from 'lucide-react';

interface InsertTableDialogProps {
  open: boolean;
  onClose: () => void;
  onInsertTable: (rows: number, cols: number) => void;
}

export const InsertTableDialog: React.FC<InsertTableDialogProps> = ({
  open,
  onClose,
  onInsertTable,
}) => {
  if (!open) return null;

  const [hoverRows, setHoverRows] = useState(3);
  const [hoverCols, setHoverCols] = useState(3);

  const maxRows = 10;
  const maxCols = 10;

  const handleSelect = (r: number, c: number) => {
    onInsertTable(r, c);
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
          width: 320,
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          userSelect: 'none',
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
            <Table size={16} style={{ color: '#1A73E8' }} />
            <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#202124' }}>
              Chèn bảng ({hoverRows} × {hoverCols})
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

        {/* Grid picker */}
        <div style={{ padding: 16, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: `repeat(${maxCols}, 20px)`,
              gridTemplateRows: `repeat(${maxRows}, 20px)`,
              gap: 3,
            }}
          >
            {Array.from({ length: maxRows }).map((_, r) =>
              Array.from({ length: maxCols }).map((_, c) => {
                const isSelected = r < hoverRows && c < hoverCols;
                return (
                  <div
                    key={`cell-${r}-${c}`}
                    onMouseEnter={() => {
                      setHoverRows(r + 1);
                      setHoverCols(c + 1);
                    }}
                    onClick={() => handleSelect(r + 1, c + 1)}
                    style={{
                      width: 20,
                      height: 20,
                      borderRadius: 2,
                      border: `1px solid ${isSelected ? '#1A73E8' : '#DADCE0'}`,
                      background: isSelected ? '#E8F0FE' : '#FFFFFF',
                      cursor: 'pointer',
                    }}
                  />
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
