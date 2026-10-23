import React, { useRef, useEffect } from 'react';
import { PageLayout } from '../core/layout/layout-types';
import { CanvasRenderer } from '../core/rendering/canvas-renderer';
import { InteractionRenderer, RemoteCollaboratorPresence, FindHighlight } from '../core/rendering/interaction-renderer';
import { CaretGeometry, SelectionPageRect } from '../core/hit-testing/hit-tester';

interface CanvasPageProps {
  page: PageLayout;
  zoom: number;
  dpr?: number;
  pageVersion?: number;
  selectionRects: SelectionPageRect[];
  caret: CaretGeometry | null;
  isCaretVisible: boolean;
  collaborators: RemoteCollaboratorPresence[];
  findHighlights?: FindHighlight[];
  onPointerDown: (e: React.PointerEvent<HTMLCanvasElement>, pageIndex: number) => void;
  onPointerMove: (e: React.PointerEvent<HTMLCanvasElement>, pageIndex: number) => void;
  onPointerUp: (e: React.PointerEvent<HTMLCanvasElement>) => void;
  onContextMenu?: (e: React.MouseEvent<HTMLCanvasElement>, pageIndex: number) => void;
}

export const CanvasPage: React.FC<CanvasPageProps> = React.memo(({
  page,
  pageVersion,
  zoom,
  dpr,
  selectionRects,
  caret,
  isCaretVisible,
  collaborators,
  findHighlights,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onContextMenu,
}) => {
  const baseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const interactionCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const latestPageRef = useRef(page);
  latestPageRef.current = page;
  const renderDpr = dpr || (typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);

  // Render base content canvas
  useEffect(() => {
    if (baseCanvasRef.current) {
      if ((window as any).__debugEditorLogs) {
        console.log(`[RENDER]\n  pageIndex = ${page.pageIndex}\n  renderVersion = ${page.version || 1}`);
      }
      CanvasRenderer.renderPage(baseCanvasRef.current, page, renderDpr, zoom);
    }
  }, [page, page.version, pageVersion, renderDpr, zoom]);

  // Render interaction canvas (selection, caret, collaborator tags)
  useEffect(() => {
    if (interactionCanvasRef.current) {
      InteractionRenderer.renderInteractionLayer(
        interactionCanvasRef.current,
        page.pageIndex,
        page.width,
        page.height,
        {
          selectionRects,
          caret,
          isCaretVisible,
          collaborators,
          findHighlights,
          dpr: renderDpr,
          zoom,
        }
      );
    }
  }, [page, selectionRects, caret, isCaretVisible, collaborators, findHighlights, renderDpr, zoom]);

  // Ensure crisp repaint as soon as system/web fonts finish loading
  useEffect(() => {
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
      let isMounted = true;
      const repaint = () => {
        if (isMounted && baseCanvasRef.current) {
          CanvasRenderer.renderPage(baseCanvasRef.current, latestPageRef.current, renderDpr, zoom);
        }
      };
      // The base effect already painted loaded fonts. Repainting again after
      // every resolved fonts.ready promise doubled work on each input frame.
      if (document.fonts.status === 'loading') void document.fonts.ready.then(repaint);
      document.fonts.addEventListener('loadingdone', repaint);
      return () => {
        isMounted = false;
        document.fonts.removeEventListener('loadingdone', repaint);
      };
    }
  }, [renderDpr, zoom]);

  const displayWidth = Math.round(page.width * zoom);
  const displayHeight = Math.round(page.height * zoom);

  return (
    <div
      className="doc-canvas-page-wrapper"
      data-page-index={page.pageIndex}
      style={{
        width: `${displayWidth}px`,
        height: `${displayHeight}px`,
        position: 'relative',
        background: '#FFFFFF',
        boxShadow: '0 1px 3px rgba(60,64,67,0.15), 0 2px 8px 1px rgba(60,64,67,0.1)',
        borderRadius: '2px',
        margin: '0 auto',
        userSelect: 'none',
        flexShrink: 0,
        overflow: 'hidden',
        imageRendering: '-webkit-optimize-contrast',
        transform: 'translateZ(0)',
      }}
    >
      {/* Base content canvas */}
      <canvas
        ref={baseCanvasRef}
        className="doc-base-canvas"
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${displayWidth}px`,
          height: `${displayHeight}px`,
          pointerEvents: 'none',
          imageRendering: '-webkit-optimize-contrast',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      />

      {/* Interaction overlay canvas */}
      <canvas
        ref={interactionCanvasRef}
        className="doc-interaction-canvas"
        onPointerDown={(e) => {
          // Keep focus on the editor's hidden input. Without preventing the
          // canvas' native mouse focus, the browser blurs that input right
          // after the pointer handler runs and keyboard input is lost.
          e.preventDefault();
          onPointerDown(e, page.pageIndex);
        }}
        onPointerMove={(e) => onPointerMove(e, page.pageIndex)}
        onPointerUp={onPointerUp}
        onContextMenu={(e) => onContextMenu && onContextMenu(e, page.pageIndex)}
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          width: `${displayWidth}px`,
          height: `${displayHeight}px`,
          cursor: 'text',
          touchAction: 'none',
          imageRendering: '-webkit-optimize-contrast',
          transform: 'translateZ(0)',
          backfaceVisibility: 'hidden',
        }}
      />
    </div>
  );
});
