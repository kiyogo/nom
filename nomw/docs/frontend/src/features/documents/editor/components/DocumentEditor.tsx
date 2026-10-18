import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { DocumentModel } from '../core/model/document-model';
import { DocumentSettings, DocumentModelData } from '../core/model/types';
import { SelectionEngine } from '../core/selection/selection-engine';
import { TransactionEngine } from '../core/transactions/transaction-engine';
import { HistoryManager } from '../core/history/history-manager';
import { CommandRegistry } from '../core/commands/command-registry';
import { registerEditorCommands } from '../core/commands/editor-commands';
import { layoutEngine } from '../core/layout/layout-engine';
import { DocumentLayout } from '../core/layout/layout-types';
import { HitTester } from '../core/hit-testing/hit-tester';
import { TextInputController } from '../core/input/text-input-controller';
import { CompositionManager } from '../core/input/composition-manager';
import { KeyboardController } from '../core/input/keyboard-controller';
import { PointerController } from '../core/input/pointer-controller';
import { ClipboardService } from '../core/clipboard/clipboard-service';
import { CommentsService, DocumentCommentItem } from '../core/comments/comments-service';
import { PresenceService } from '../core/collaboration/presence-service';
import { CollaborationEngine } from '../core/collaboration/collaboration-engine';
import { TypedEventBus } from '../core/utils/event-bus';
import { FontManager } from '../core/fonts/font-manager';
import { documentApiService } from '../services/document-api-service';
import { PdfExporter } from '../core/export/pdf-exporter';
import { PrintService } from '../core/export/print-service';

// UI Components
import { EditorHeader } from './EditorHeader';
import { MenuBar } from './MenuBar';
import { EditorToolbar } from './EditorToolbar';
import { HorizontalRuler } from './HorizontalRuler';
import { DocumentViewport } from './DocumentViewport';
import { CommentsSidebar } from './CommentsSidebar';
import { PageSetupDialog } from './PageSetupDialog';
import { FindReplaceDialog } from './FindReplaceDialog';
import { WordCountDialog } from './WordCountDialog';
import { ShareDialog } from './ShareDialog';
import { RevisionHistoryDialog } from './RevisionHistoryDialog';
import { InsertTableDialog } from './InsertTableDialog';
import { InsertLinkDialog } from './InsertLinkDialog';
import { generateTransactionId } from '../core/utils/id-generator';

export interface DocumentEditorProps {
  documentId: string;
  initialData?: DocumentModelData | string;
  initialTitle?: string;
  currentUser?: { id: string; name: string; email: string; role?: string } | null;
  onGoBack?: () => void;
}

export const DocumentEditor: React.FC<DocumentEditorProps> = ({
  documentId,
  initialData,
  initialTitle = 'Văn bản chưa đặt tên',
  currentUser,
  onGoBack,
}) => {
  const navigate = useNavigate();
  const clientId = useMemo(() => `client-${Math.random().toString(36).substring(2, 9)}`, []);

  // Event bus and core models
  const eventBus = useMemo(() => new TypedEventBus(), []);
  const docModelRef = useRef<DocumentModel>(new DocumentModel(initialData));
  const selectionEngine = useMemo(() => new SelectionEngine(eventBus), [eventBus]);
  const transactionEngine = useMemo(
    () => new TransactionEngine(docModelRef.current, clientId),
    [clientId]
  );
  const historyManager = useMemo(() => new HistoryManager(), []);
  const commandRegistry = useMemo(() => new CommandRegistry(), []);
  const compositionManager = useMemo(() => new CompositionManager(), []);
  const commentsService = useMemo(() => new CommentsService(documentId), [documentId]);
  const presenceService = useMemo(() => new PresenceService(), []);

  // UI state
  const [docTitle, setDocTitle] = useState(initialTitle);
  const [zoom, setZoom] = useState<number>(1.0);
  const [showRuler, setShowRuler] = useState<boolean>(true);
  const [saveState, setSaveState] = useState<'saved' | 'saving' | 'unsaved' | 'offline' | 'error'>('saved');
  const [commentsSidebarOpen, setCommentsSidebarOpen] = useState(false);
  const [pageSetupOpen, setPageSetupOpen] = useState(false);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);
  const [wordCountOpen, setWordCountOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [insertTableOpen, setInsertTableOpen] = useState(false);
  const [insertLinkOpen, setInsertLinkOpen] = useState(false);
  const [debugMode, setDebugMode] = useState<boolean>(() => {
    if (typeof window !== 'undefined') {
      return new URLSearchParams(window.location.search).get('editorDebug') === '1';
    }
    return false;
  });

  const [collaborators, setCollaborators] = useState(presenceService.getCollaborators());
  const [comments, setComments] = useState<DocumentCommentItem[]>([]);
  const [findHighlights, setFindHighlights] = useState<any[]>([]);

  // Layout state
  const [layout, setLayout] = useState<DocumentLayout>(() => layoutEngine.layoutDocument(docModelRef.current));

  // Invalidation & Mutation trigger
  const triggerRelayout = useCallback(() => {
    const newLayout = layoutEngine.layoutDocument(docModelRef.current);
    setLayout(newLayout);
    presenceService.updateGeometry(newLayout, docModelRef.current);
    setSaveState('unsaved');
  }, [presenceService]);

  // Register commands
  useEffect(() => {
    registerEditorCommands(
      commandRegistry,
      docModelRef.current,
      selectionEngine,
      transactionEngine,
      historyManager,
      triggerRelayout
    );
  }, [commandRegistry, selectionEngine, transactionEngine, historyManager, triggerRelayout]);

  // Re-layout on font load
  useEffect(() => {
    return FontManager.getInstance().onFontChange(() => {
      triggerRelayout();
    });
  }, [triggerRelayout]);

  // Subscribe to comments
  useEffect(() => {
    return commentsService.subscribe((list) => {
      setComments([...list]);
    });
  }, [commentsService]);

  // Subscribe to collaborators presence
  useEffect(() => {
    return presenceService.subscribe((collabs) => {
      setCollaborators([...collabs]);
    });
  }, [presenceService]);

  // Collaboration Engine
  const collabEngine = useMemo(() => {
    const userId = currentUser?.id || `anon-${Math.random().toString(36).substring(2, 6)}`;
    const userName = currentUser?.name || 'Khách';

    return new CollaborationEngine(
      {
        documentId,
        userId,
        userName,
        clientId,
      },
      docModelRef.current,
      transactionEngine,
      presenceService,
      commentsService,
      eventBus
    );
  }, [documentId, currentUser, clientId, transactionEngine, presenceService, commentsService, eventBus]);

  useEffect(() => {
    collabEngine.connect();
    return () => collabEngine.disconnect();
  }, [collabEngine]);

  // Broadcast presence when selection changes
  useEffect(() => {
    return eventBus.on('selectionChanged', () => {
      collabEngine.broadcastPresence(selectionEngine.getSelection());
    });
  }, [eventBus, collabEngine, selectionEngine]);

  // Listen to remote changes
  useEffect(() => {
    return eventBus.on('documentChanged', () => {
      triggerRelayout();
    });
  }, [eventBus, triggerRelayout]);

  // Input and Pointer controllers
  const keyboardController = useMemo(
    () => new KeyboardController(docModelRef.current, selectionEngine, commandRegistry, () => layout, compositionManager),
    [selectionEngine, commandRegistry, layout, compositionManager]
  );

  const textInputController = useMemo(
    () => new TextInputController(commandRegistry, compositionManager, selectionEngine, docModelRef.current, keyboardController),
    [commandRegistry, compositionManager, selectionEngine, keyboardController]
  );

  const pointerController = useMemo(
    () => new PointerController(docModelRef.current, selectionEngine, () => layout, commandRegistry),
    [selectionEngine, layout, commandRegistry]
  );

  // Autosave debouncing
  const autosaveTimerRef = useRef<any>(null);

  useEffect(() => {
    if (saveState !== 'unsaved') return;

    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);

    autosaveTimerRef.current = setTimeout(async () => {
      setSaveState('saving');
      try {
        const snapshotData = JSON.stringify(docModelRef.current.data);
        await documentApiService.saveOperations(
          documentId,
          [],
          { revision: docModelRef.current.revision, data: snapshotData }
        );
        setSaveState('saved');
      } catch (err) {
        console.warn('Autosave to backend failed, saving locally:', err);
        try {
          localStorage.setItem(`doc_snapshot_${documentId}`, JSON.stringify(docModelRef.current.data));
          setSaveState('offline');
        } catch {
          setSaveState('error');
        }
      }
    }, 1200);

    return () => {
      if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    };
  }, [saveState, documentId]);

  // Handle Title Change
  const handleTitleChange = async (newTitle: string) => {
    setDocTitle(newTitle);
    docModelRef.current.title = newTitle;
    try {
      await documentApiService.update(documentId, { title: newTitle });
    } catch {}
  };

  // Handle Page Settings Change
  const handleSaveSettings = (newSettings: DocumentSettings) => {
    docModelRef.current.settings = newSettings;
    triggerRelayout();
  };

  // Derived Selection and Caret Geometry for Canvas rendering
  const currentSel = selectionEngine.getSelection();
  const selectionRects = useMemo(
    () => HitTester.getSelectionRectangles(currentSel, layout, docModelRef.current),
    [currentSel, layout]
  );

  const caretGeometry = useMemo(
    () => (currentSel ? HitTester.getCaretGeometry(currentSel.focus, layout, docModelRef.current) : null),
    [currentSel, layout]
  );

  const activeMarks = selectionEngine.getActiveMarks(docModelRef.current);
  const activeParagraphStyle = selectionEngine.getActiveParagraphStyle(docModelRef.current);

  // Export handlers
  const handleExportPdf = () => {
    PdfExporter.downloadPdf(docModelRef.current, layout);
  };

  const handleExportText = () => {
    const text = docModelRef.current.blocks.map((b) => docModelRef.current.getBlockText(b)).join('\n\n');
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${docTitle.replace(/[\\/:*?"<>|]/g, '_') || 'tai_lieu'}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 2000);
  };

  const handlePrint = () => {
    PrintService.printDocument(docModelRef.current, layout);
  };

  // Add Comment handler
  const handleAddComment = async (body: string) => {
    const sel = selectionEngine.getSelection();
    try {
      const res = await documentApiService.createComment(documentId, sel?.focus || null, body);
      commentsService.addComment(res.data.comment);
    } catch (e) {
      // Local fallback
      commentsService.addComment({
        id: generateTransactionId(),
        documentId,
        authorId: currentUser?.id || 'anon',
        authorName: currentUser?.name || 'Tôi',
        authorCode: 'EMP-ME',
        anchor: sel?.focus || null,
        body,
        resolved: false,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
  };

  const handleResolveComment = async (commentId: string, resolved: boolean) => {
    try {
      await documentApiService.updateComment(documentId, commentId, { resolved });
    } catch {}
    const target = comments.find((c) => c.id === commentId);
    if (target) {
      commentsService.updateComment({ ...target, resolved, updatedAt: new Date().toISOString() });
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    try {
      await documentApiService.deleteComment(documentId, commentId);
    } catch {}
    commentsService.removeComment(commentId);
  };

  return (
    <div
      className="doc-editor-shell"
      style={{
        display: 'flex',
        flexDirection: 'column',
        width: '100vw',
        height: '100vh',
        background: '#FFFFFF',
        overflow: 'hidden',
        fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
      }}
    >
      {/* 1. Header (Title, Save State, Collaborators, Share) */}
      <EditorHeader
        title={docTitle}
        saveState={saveState}
        collaborators={collaborators}
        currentUser={currentUser}
        onTitleChange={handleTitleChange}
        onOpenShare={() => setShareOpen(true)}
        onOpenHistory={() => setHistoryOpen(true)}
        onToggleComments={() => setCommentsSidebarOpen(!commentsSidebarOpen)}
        onGoBack={onGoBack}
      />

      {/* 2. Menu Bar (File, Edit, View, Insert, Format, Tools, Help) */}
      <MenuBar
        commands={commandRegistry}
        onOpenPageSetup={() => setPageSetupOpen(true)}
        onOpenFindReplace={() => setFindReplaceOpen(true)}
        onOpenWordCount={() => setWordCountOpen(true)}
        onOpenInsertTable={() => setInsertTableOpen(true)}
        onOpenInsertImage={() => {}}
        onOpenInsertLink={() => setInsertLinkOpen(true)}
        onExportPdf={handleExportPdf}
        onExportText={handleExportText}
        onPrint={handlePrint}
        showRuler={showRuler}
        onToggleRuler={() => setShowRuler(!showRuler)}
        zoom={zoom}
        onSetZoom={setZoom}
        debugMode={debugMode}
        onToggleDebugMode={() => setDebugMode(!debugMode)}
      />

      {/* 3. Format Toolbar */}
      <EditorToolbar
        commands={commandRegistry}
        activeMarks={activeMarks}
        activeParagraphStyle={activeParagraphStyle}
        zoom={zoom}
        onSetZoom={setZoom}
        onOpenInsertImage={() => {
          const url = prompt('Nhập đường dẫn hình ảnh (URL):');
          if (url) commandRegistry.execute('insertImage', { src: url });
        }}
        onOpenInsertLink={() => setInsertLinkOpen(true)}
        onAddComment={() => setCommentsSidebarOpen(true)}
        onPrint={handlePrint}
      />

      {/* 4. Horizontal Ruler */}
      {showRuler && (
        <HorizontalRuler
          pageWidth={layout.pages[0]?.width || 794}
          margins={docModelRef.current.settings.margins}
          zoom={zoom}
        />
      )}

      {/* 5. Main Canvas Workspace & Comments Sidebar */}
      <div style={{ display: 'flex', flex: 1, minHeight: 0, position: 'relative' }}>
        <DocumentViewport
          layout={layout}
          zoom={zoom}
          selectionRects={selectionRects}
          caret={caretGeometry}
          collaborators={collaborators}
          findHighlights={findHighlights}
          pointerController={pointerController}
          textInputController={textInputController}
          keyboardController={keyboardController}
          debugMode={debugMode}
        />

        {/* Comments Activity Sidebar */}
        <CommentsSidebar
          open={commentsSidebarOpen}
          onClose={() => setCommentsSidebarOpen(false)}
          commentsService={commentsService}
          comments={comments}
          selectionEngine={selectionEngine}
          currentUserId={currentUser?.id}
          onAddComment={handleAddComment}
          onResolveComment={handleResolveComment}
          onDeleteComment={handleDeleteComment}
        />
      </div>

      {/* Dialogs */}
      <PageSetupDialog
        open={pageSetupOpen}
        onClose={() => setPageSetupOpen(false)}
        settings={docModelRef.current.settings}
        onSaveSettings={handleSaveSettings}
      />

      <FindReplaceDialog
        open={findReplaceOpen}
        onClose={() => {
          setFindReplaceOpen(false);
          setFindHighlights([]);
        }}
        doc={docModelRef.current}
        selectionEngine={selectionEngine}
        commands={commandRegistry}
        onMatchesChanged={(matches, activeIdx) => {
          // Highlight matches across pages
          const highlights = matches.map((m, i) => {
            const geom = HitTester.getCaretGeometry({ blockId: m.blockId, offset: m.startOffset }, layout, docModelRef.current);
            return {
              pageIndex: geom?.pageIndex || 0,
              rect: { x: geom?.x || 0, y: geom?.y || 0, width: 60, height: geom?.height || 18 },
              isActive: i === activeIdx,
            };
          });
          setFindHighlights(highlights);
        }}
      />

      <WordCountDialog
        open={wordCountOpen}
        onClose={() => setWordCountOpen(false)}
        doc={docModelRef.current}
        layout={layout}
      />

      <ShareDialog
        open={shareOpen}
        onClose={() => setShareOpen(false)}
        documentId={documentId}
        documentTitle={docTitle}
      />

      <RevisionHistoryDialog
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        documentId={documentId}
        onRestoreRevision={() => {}}
      />

      <InsertTableDialog
        open={insertTableOpen}
        onClose={() => setInsertTableOpen(false)}
        onInsertTable={(rows, cols) => {
          commandRegistry.execute('insertTable', { rows, columns: cols });
        }}
      />

      <InsertLinkDialog
        open={insertLinkOpen}
        onClose={() => setInsertLinkOpen(false)}
        onInsertLink={(url) => {
          commandRegistry.execute('setLink', url);
        }}
      />
    </div>
  );
};
