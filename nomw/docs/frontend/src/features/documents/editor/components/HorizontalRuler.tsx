import React, { useRef, useEffect } from 'react';
import { PageMargins } from '../core/model/types';
import { useDevicePixelRatio } from '../core/utils/use-device-pixel-ratio';

interface HorizontalRulerProps {
  pageWidth: number;
  margins: PageMargins;
  zoom: number;
  onMarginChange?: (margins: Partial<PageMargins>) => void;
}

export const HorizontalRuler: React.FC<HorizontalRulerProps> = ({
  pageWidth,
  margins,
  zoom,
  onMarginChange,
}) => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const dpr = useDevicePixelRatio();

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rulerWidth = Math.round(pageWidth * zoom);
    const rulerHeight = 16;

    if (canvas.width !== Math.round(rulerWidth * dpr) || canvas.height !== Math.round(rulerHeight * dpr)) {
      canvas.width = Math.round(rulerWidth * dpr);
      canvas.height = Math.round(rulerHeight * dpr);
    }
    canvas.style.width = `${rulerWidth}px`;
    canvas.style.height = `${rulerHeight}px`;

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, rulerWidth, rulerHeight);

    // 1. Ruler Background
    ctx.fillStyle = '#E8EAED';
    ctx.fillRect(0, 0, rulerWidth, rulerHeight);

    // 2. Active Printable Area Background (white between margins)
    const leftMarginX = margins.left * zoom;
    const rightMarginX = (pageWidth - margins.right) * zoom;
    const activeWidth = Math.max(0, rightMarginX - leftMarginX);

    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(leftMarginX, 0, activeWidth, rulerHeight);

    // 3. Ruler Ticks (Every 1/8 inch / 12px logical)
    ctx.strokeStyle = '#9AA0A6';
    const physicalLineWidth = Math.max(1, Math.round(1 * dpr));
    ctx.lineWidth = physicalLineWidth / dpr;
    ctx.fillStyle = '#5F6368';
    ctx.font = '9px Arial, sans-serif';
    ctx.textAlign = 'center';

    const tickInterval = 12 * zoom; // ~1/8 inch
    const inchInterval = 96 * zoom; // 1 inch

    for (let x = leftMarginX; x <= rightMarginX; x += tickInterval) {
      const distFromMargin = (x - leftMarginX) / zoom;
      const isInch = Math.abs(distFromMargin % 96) < 1;
      const isHalfInch = Math.abs(distFromMargin % 48) < 1;

      const tickHeight = isInch ? 8 : isHalfInch ? 5 : 3;

      // Pixel-align 1px tick lines
      const halfShift = (physicalLineWidth % 2 === 1) ? (0.5 / dpr) : 0;
      const alignedX = Math.round(x * dpr) / dpr + halfShift;

      ctx.beginPath();
      ctx.moveTo(alignedX, rulerHeight);
      ctx.lineTo(alignedX, rulerHeight - tickHeight);
      ctx.stroke();

      if (isInch && distFromMargin > 0) {
        const inchNum = Math.round(distFromMargin / 96);
        const textX = Math.round(x * dpr) / dpr;
        ctx.fillText(String(inchNum), textX, rulerHeight - 7);
      }
    }

    // 4. Draw Margin Border Lines
    ctx.strokeStyle = '#DADCE0';
    const borderHalfShift = (physicalLineWidth % 2 === 1) ? (0.5 / dpr) : 0;
    const alignedBottomY = Math.round((rulerHeight - 1) * dpr) / dpr + borderHalfShift;
    ctx.beginPath();
    ctx.moveTo(0, alignedBottomY);
    ctx.lineTo(rulerWidth, alignedBottomY);
    ctx.stroke();

    // 5. Margin Handle Triangles (Left and Right)
    // Left margin marker
    ctx.fillStyle = '#1A73E8';
    ctx.beginPath();
    ctx.moveTo(leftMarginX - 4, 0);
    ctx.lineTo(leftMarginX + 4, 0);
    ctx.lineTo(leftMarginX, 6);
    ctx.closePath();
    ctx.fill();

    // Right margin marker
    ctx.beginPath();
    ctx.moveTo(rightMarginX - 4, 0);
    ctx.lineTo(rightMarginX + 4, 0);
    ctx.lineTo(rightMarginX, 6);
    ctx.closePath();
    ctx.fill();
  }, [pageWidth, margins, zoom, dpr]);

  const displayWidth = Math.round(pageWidth * zoom);

  return (
    <div
      className="doc-ruler-container"
      style={{
        width: '100%',
        height: '16px',
        background: '#F1F3F4',
        borderBottom: '1px solid #E0E0E0',
        display: 'flex',
        justifyContent: 'center',
        overflow: 'hidden',
        userSelect: 'none',
        flexShrink: 0,
      }}
    >
      <div style={{ width: `${displayWidth}px`, height: '16px' }}>
        <canvas ref={canvasRef} style={{ display: 'block' }} />
      </div>
    </div>
  );
};
