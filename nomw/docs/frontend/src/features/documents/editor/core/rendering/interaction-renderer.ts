import { SelectionPageRect, CaretGeometry } from '../hit-testing/hit-tester';
import { hexToRgba } from '../utils/color';

export interface RemoteCollaboratorPresence {
  userId: string;
  name: string;
  color: string;
  caret?: CaretGeometry | null;
  selectionRects?: SelectionPageRect[];
}

export interface FindHighlight {
  pageIndex: number;
  rect: { x: number; y: number; width: number; height: number };
  isActive?: boolean;
}

export class InteractionRenderer {
  /**
   * Renders transient UI (selection, blinking caret, remote presence, find highlights) on the interaction canvas
   * with full HiDPI/Retina resolution and razor-sharp pixel-aligned boundaries.
   */
  public static renderInteractionLayer(
    canvas: HTMLCanvasElement,
    pageIndex: number,
    pageWidth: number,
    pageHeight: number,
    options: {
      selectionRects: SelectionPageRect[];
      caret: CaretGeometry | null;
      isCaretVisible: boolean;
      collaborators: RemoteCollaboratorPresence[];
      findHighlights?: FindHighlight[];
      dpr?: number;
      zoom?: number;
    }
  ): void {
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rawDpr = options.dpr || window.devicePixelRatio || 1;
    const zoom = options.zoom || 1;

    // Matching effectiveDpr for pixel-perfect overlay registration
    const effectiveDpr = zoom <= 1.5
      ? Math.max(rawDpr, 2.0)
      : Math.max(rawDpr, 1.25);

    // 1. Calculate CSS display dimensions
    const cssWidth = Math.round(pageWidth * zoom);
    const cssHeight = Math.round(pageHeight * zoom);

    // 2. Calculate physical pixel buffer dimensions
    const bufferWidth = Math.round(cssWidth * effectiveDpr);
    const bufferHeight = Math.round(cssHeight * effectiveDpr);

    if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
      canvas.width = bufferWidth;
      canvas.height = bufferHeight;
    }
    if (canvas.style.width !== `${cssWidth}px`) {
      canvas.style.width = `${cssWidth}px`;
    }
    if (canvas.style.height !== `${cssHeight}px`) {
      canvas.style.height = `${cssHeight}px`;
    }

    const scaleX = bufferWidth / pageWidth;
    const scaleY = bufferHeight / pageHeight;

    // Direct physical pixel coordinate rendering
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, bufferWidth, bufferHeight);

    // 1. Search Highlights
    if (options.findHighlights) {
      for (const h of options.findHighlights) {
        if (h.pageIndex === pageIndex) {
          ctx.fillStyle = h.isActive ? 'rgba(255, 152, 0, 0.55)' : 'rgba(255, 235, 59, 0.45)';
          const hx = Math.floor(h.rect.x * scaleX);
          const hy = Math.floor(h.rect.y * scaleY);
          const hw = Math.ceil((h.rect.x + h.rect.width) * scaleX) - hx;
          const hh = Math.ceil((h.rect.y + h.rect.height) * scaleY) - hy;
          ctx.fillRect(hx, hy, hw, hh);
          if (h.isActive) {
            ctx.strokeStyle = '#E65100';
            ctx.lineWidth = Math.max(1, Math.round(1 * scaleX));
            ctx.strokeRect(hx, hy, hw, hh);
          }
        }
      }
    }

    // 2. Remote Collaborator Selections
    for (const collab of options.collaborators) {
      if (collab.selectionRects) {
        const collabFill = hexToRgba(collab.color || '#0F6CBD', 0.22);
        ctx.fillStyle = collabFill;
        for (const sr of collab.selectionRects) {
          if (sr.pageIndex === pageIndex) {
            const rx = Math.floor(sr.rect.x * scaleX);
            const ry = Math.floor(sr.rect.y * scaleY);
            const rw = Math.ceil((sr.rect.x + sr.rect.width) * scaleX) - rx;
            const rh = Math.ceil((sr.rect.y + sr.rect.height) * scaleY) - ry;
            ctx.fillRect(rx, ry, rw, rh);
          }
        }
      }
    }

    // 3. Local Selection Highlights
    const pageSelections = options.selectionRects;
    if (pageSelections.length > 0) {
      ctx.fillStyle = 'rgba(180, 215, 255, 0.45)'; // Google Docs selection blue
      for (const s of pageSelections) {
        // Pixel-align selection rectangles to avoid fuzzy anti-aliased edges
        const sx = Math.floor(s.rect.x * scaleX);
        const sy = Math.floor(s.rect.y * scaleY);
        const sw = Math.ceil((s.rect.x + s.rect.width) * scaleX) - sx;
        const sh = Math.ceil((s.rect.y + s.rect.height) * scaleY) - sy;
        ctx.fillRect(sx, sy, sw, sh);
      }
    }

    // 4. Remote Collaborator Carets & Name Badges
    for (const collab of options.collaborators) {
      if (collab.caret && collab.caret.pageIndex === pageIndex) {
        const c = collab.caret;
        const color = collab.color || '#0F6CBD';

        // Colored vertical line - pixel aligned
        ctx.fillStyle = color;
        const cx = Math.round(c.x * scaleX);
        const cy = Math.round(c.y * scaleY);
        const cw = Math.max(1, Math.round(2 * scaleX));
        const ch = Math.round(c.height * scaleY);
        ctx.fillRect(cx, cy, cw, ch);

        // Collaborator Name Tag
        if (collab.name) {
          const tagFontSize = Math.round(9 * (scaleX + scaleY) / 2);
          ctx.font = `bold ${tagFontSize}px Arial, sans-serif`;
          const nameWidth = ctx.measureText(collab.name).width;
          const tagW = nameWidth + 8;
          const tagH = Math.round(16 * scaleY);
          const tagX = Math.max(2, cx - 2);
          const tagY = Math.max(2, cy - tagH);

          // Tag background
          ctx.fillStyle = color;
          ctx.beginPath();
          ctx.roundRect(tagX, tagY, tagW, tagH, [3, 3, 3, 0]);
          ctx.fill();

          // Tag text
          ctx.fillStyle = '#FFFFFF';
          ctx.fillText(collab.name, tagX + 4, tagY + tagH - 4);
        }
      }
    }

    // 5. Local Caret (blinking vertical line)
    if (options.isCaretVisible && options.caret && options.caret.pageIndex === pageIndex) {
      const c = options.caret;
      ctx.fillStyle = '#1A73E8'; // Crisp Docs blue caret

      // Snap caret X & Y to exact integer physical pixel boundary and ensure width is an integer number of physical pixels
      // to eliminate blurry fractional caret lines.
      const caretPixelX = Math.round(c.x * scaleX);
      const caretPixelY = Math.round(c.y * scaleY);
      const caretWidth = Math.max(1, Math.round(1.8 * scaleX));
      const caretHeight = Math.round(c.height * scaleY);
      ctx.fillRect(caretPixelX, caretPixelY, caretWidth, caretHeight);
    }
  }
}
