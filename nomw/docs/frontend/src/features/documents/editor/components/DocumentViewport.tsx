import React, { useRef, useEffect, useState, useCallback } from 'react';
import { DocumentLayout, PageLayout } from '../core/layout/layout-types';
import { CanvasPage } from './CanvasPage';
import { CaretGeometry, SelectionPageRect } from '../core/hit-testing/hit-tester';
import { RemoteCollaboratorPresence, FindHighlight } from '../core/rendering/interaction-renderer';
import { PointerController } from '../core/input/pointer-controller';
import { TextInputController } from '../core/input/text-input-controller';
import { KeyboardController } from '../core/input/keyboard-controller';

interface DocumentViewportProps {
  layout: DocumentLayout;
  zoom: number;
  selectionRects: SelectionPageRect[];
  caret: CaretGeometry | null;
  collaborators: RemoteCollaboratorPresence[];
  findHighlights?: FindHighlight[];
  pointerController: PointerController;
  textInputController: TextInputController;
  keyboardController: KeyboardController;
  onFocusChange?: (focused: boolean) => void;
  debugMode?: boolean;
}

export const DocumentViewport: React.FC<DocumentViewportProps> = ({
  layout,
  zoom,
  selectionRects,
  caret,
  collaborators,
  findHighlights,
  pointerController,
  textInputController,
  keyboardController,
  onFocusChange,
  debugMode = false,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hiddenInputRef = useRef<HTMLTextAreaElement | null>(null);

  // Blinking Caret State
  const [isCaretBlinkingVisible, setIsCaretBlinkingVisible] = useState(true);

  // Caret blink interval
  useEffect(() => {
    setIsCaretBlinkingVisible(true);
    const interval = setInterval(() => {
      setIsCaretBlinkingVisible((prev) => !prev);
    }, 530);
    return () => clearInterval(interval);
  }, [caret]);

  // Attach offscreen hidden input
  useEffect(() => {
    if (hiddenInputRef.current) {
      textInputController.attach(hiddenInputRef.current);
    }
  }, [textInputController]);

  // Handle Focus & Pointer routing
  const handleViewportClick = (e: React.MouseEvent) => {
    textInputController.focus();
  };

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>, pageIndex: number) => {
    textInputController.focus();
    pointerController.handlePointerDown(e, pageIndex, zoom);
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>, pageIndex: number) => {
    pointerController.handlePointerMove(e, pageIndex, zoom);
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    pointerController.handlePointerUp(e);
  };

  // Virtualization: determine visible pages based on scroll
  const [visibleRange, setVisibleRange] = useState<{ start: number; end: number }>({
    start: 0,
    end: Math.min(3, layout.pages.length - 1),
  });

  const updateVisibleRange = useCallback(() => {
    const el = containerRef.current;
    if (!el || layout.pages.length === 0) return;

    const scrollTop = el.scrollTop;
    const clientHeight = el.clientHeight;

    const firstPage = layout.pages[0];
    const pageHeightPx = (firstPage.height + 20) * zoom; // page height + gap

    const startPage = Math.max(0, Math.floor(scrollTop / pageHeightPx) - 2);
    const endPage = Math.min(layout.pages.length - 1, Math.ceil((scrollTop + clientHeight) / pageHeightPx) + 2);

    setVisibleRange({ start: startPage, end: endPage });
  }, [layout.pages, zoom]);

  useEffect(() => {
    updateVisibleRange();
    const el = containerRef.current;
    if (el) {
      el.addEventListener('scroll', updateVisibleRange, { passive: true });
      return () => el.removeEventListener('scroll', updateVisibleRange);
    }
  }, [updateVisibleRange]);

  return (
    <div
      ref={containerRef}
      className="doc-editor-viewport"
      onClick={handleViewportClick}
      style={{
        flex: 1,
        width: '100%',
        height: '100%',
        background: '#F8F9FA',
        overflowY: 'auto',
        overflowX: 'auto',
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        padding: '24px 0 60px 0',
        outline: 'none',
      }}
    >
      {/* Offscreen hidden input for IME, composition, and keyboard handling */}
      <textarea
        ref={hiddenInputRef}
        className="doc-hidden-input"
        autoComplete="off"
        autoCorrect="off"
        autoCapitalize="off"
        spellCheck="false"
        aria-hidden="true"
        onKeyDown={(e) => keyboardController.handleKeyDown(e.nativeEvent)}
        onFocus={() => onFocusChange && onFocusChange(true)}
        onBlur={() => onFocusChange && onFocusChange(false)}
        style={{
          position: 'fixed',
          top: '-10000px',
          left: '-10000px',
          width: 1,
          height: 1,
          opacity: 0,
          pointerEvents: 'none',
          zIndex: -99999,
          border: 'none',
          outline: 'none',
          background: 'transparent',
          color: 'transparent',
          caretColor: 'transparent',
          resize: 'none',
          overflow: 'hidden',
        }}
      />

      {/* Render Pages with Gap */}
      <div
        className="doc-pages-container"
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: `${Math.round(20 * zoom)}px`,
        }}
      >
        {layout.pages.map((page, idx) => {
          const isRendered = idx >= visibleRange.start && idx <= visibleRange.end;
          const displayWidth = Math.round(page.width * zoom);
          const displayHeight = Math.round(page.height * zoom);

          if (!isRendered) {
            // Lightweight placeholder for unrendered distant pages
            return (
              <div
                key={`placeholder-${idx}`}
                style={{
                  width: `${displayWidth}px`,
                  height: `${displayHeight}px`,
                  background: '#FFFFFF',
                  boxShadow: '0 1px 3px rgba(60,64,67,0.15)',
                  borderRadius: 2,
                }}
              />
            );
          }

          return (
            <CanvasPage
              key={`page-${idx}`}
              page={page}
              zoom={zoom}
              selectionRects={selectionRects}
              caret={caret}
              isCaretVisible={isCaretBlinkingVisible}
              collaborators={collaborators}
              findHighlights={findHighlights}
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
            />
          );
        })}
      </div>

      {/* Optional Canvas Debug Overlay Banner */}
      {debugMode && (
        <div
          style={{
            position: 'fixed',
            bottom: 12,
            right: 12,
            background: 'rgba(33, 33, 33, 0.92)',
            color: '#00E676',
            fontFamily: 'monospace',
            fontSize: 11,
            padding: '8px 12px',
            borderRadius: 6,
            zIndex: 9999,
            pointerEvents: 'none',
            boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
          }}
        >
          <div><strong>ENGINE:</strong> Custom Canvas Renderer</div>
          <div><strong>PAGES:</strong> {layout.pages.length}</div>
          <div><strong>ZOOM:</strong> {Math.round(zoom * 100)}%</div>
          <div><strong>CARET:</strong> {caret ? `p${caret.pageIndex} (${Math.round(caret.x)}, ${Math.round(caret.y)})` : 'none'}</div>
          <div><strong>DPI:</strong> {window.devicePixelRatio || 1}</div>
        </div>
      )}
    </div>
  );
};
