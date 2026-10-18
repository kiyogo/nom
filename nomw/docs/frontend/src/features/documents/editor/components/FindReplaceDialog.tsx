import React, { useState, useEffect } from 'react';
import { DocumentModel } from '../core/model/document-model';
import { SelectionEngine } from '../core/selection/selection-engine';
import { CommandRegistry } from '../core/commands/command-registry';
import { X, ChevronDown, ChevronUp } from 'lucide-react';

interface FindMatch {
  blockId: string;
  startOffset: number;
  endOffset: number;
}

interface FindReplaceDialogProps {
  open: boolean;
  onClose: () => void;
  doc: DocumentModel;
  selectionEngine: SelectionEngine;
  commands: CommandRegistry;
  onMatchesChanged?: (matches: FindMatch[], activeIndex: number) => void;
}

export const FindReplaceDialog: React.FC<FindReplaceDialogProps> = ({
  open,
  onClose,
  doc,
  selectionEngine,
  commands,
  onMatchesChanged,
}) => {
  if (!open) return null;

  const [findQuery, setFindQuery] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matches, setMatches] = useState<FindMatch[]>([]);
  const [activeMatchIndex, setActiveMatchIndex] = useState(0);

  // Search document blocks
  useEffect(() => {
    if (!findQuery.trim()) {
      setMatches([]);
      setActiveMatchIndex(0);
      onMatchesChanged && onMatchesChanged([], 0);
      return;
    }

    const found: FindMatch[] = [];
    const query = matchCase ? findQuery : findQuery.toLowerCase();

    for (const block of doc.blocks) {
      if ('runs' in block) {
        const text = doc.getBlockText(block);
        const searchText = matchCase ? text : text.toLowerCase();
        let pos = 0;

        while ((pos = searchText.indexOf(query, pos)) !== -1) {
          found.push({
            blockId: block.id,
            startOffset: pos,
            endOffset: pos + query.length,
          });
          pos += query.length;
        }
      }
    }

    setMatches(found);
    const newActive = found.length > 0 ? 0 : 0;
    setActiveMatchIndex(newActive);
    onMatchesChanged && onMatchesChanged(found, newActive);

    if (found.length > 0) {
      const first = found[0];
      selectionEngine.setSelection({
        anchor: { blockId: first.blockId, offset: first.startOffset },
        focus: { blockId: first.blockId, offset: first.endOffset },
      });
    }
  }, [findQuery, matchCase, doc.blocks]);

  const handleNextMatch = () => {
    if (matches.length === 0) return;
    const nextIdx = (activeMatchIndex + 1) % matches.length;
    setActiveMatchIndex(nextIdx);
    onMatchesChanged && onMatchesChanged(matches, nextIdx);

    const m = matches[nextIdx];
    selectionEngine.setSelection({
      anchor: { blockId: m.blockId, offset: m.startOffset },
      focus: { blockId: m.blockId, offset: m.endOffset },
    });
  };

  const handlePrevMatch = () => {
    if (matches.length === 0) return;
    const prevIdx = (activeMatchIndex - 1 + matches.length) % matches.length;
    setActiveMatchIndex(prevIdx);
    onMatchesChanged && onMatchesChanged(matches, prevIdx);

    const m = matches[prevIdx];
    selectionEngine.setSelection({
      anchor: { blockId: m.blockId, offset: m.startOffset },
      focus: { blockId: m.blockId, offset: m.endOffset },
    });
  };

  const handleReplaceCurrent = () => {
    if (matches.length === 0) return;
    commands.execute('insertText', { text: replaceText });
  };

  const handleReplaceAll = () => {
    if (matches.length === 0) return;
    // Replace in reverse order so character offsets remain stable
    for (let i = matches.length - 1; i >= 0; i--) {
      const m = matches[i];
      selectionEngine.setSelection({
        anchor: { blockId: m.blockId, offset: m.startOffset },
        focus: { blockId: m.blockId, offset: m.endOffset },
      });
      commands.execute('insertText', { text: replaceText });
    }
  };

  return (
    <div
      style={{
        position: 'fixed',
        top: 88,
        right: 24,
        width: 340,
        background: '#FFFFFF',
        borderRadius: 8,
        boxShadow: '0 4px 18px rgba(0, 0, 0, 0.2)',
        border: '1px solid #DADCE0',
        zIndex: 9000,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
        userSelect: 'none',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <h4 style={{ margin: 0, fontSize: 14, fontWeight: 600, color: '#202124' }}>Tìm kiếm và thay thế</h4>
        <button
          type="button"
          onClick={onClose}
          style={{ border: 'none', background: 'transparent', cursor: 'pointer', color: '#5F6368' }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Find input */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <input
          type="text"
          placeholder="Tìm trong tài liệu"
          value={findQuery}
          onChange={(e) => setFindQuery(e.target.value)}
          autoFocus
          style={{
            flex: 1,
            height: 28,
            borderRadius: 4,
            border: '1px solid #DADCE0',
            padding: '0 8px',
            fontSize: 13,
            outline: 'none',
          }}
        />
        <span style={{ fontSize: 11, color: '#5F6368', minWidth: 40, textAlign: 'right' }}>
          {matches.length > 0 ? `${activeMatchIndex + 1}/${matches.length}` : '0/0'}
        </span>
        <button
          type="button"
          onClick={handlePrevMatch}
          title="Kết quả trước"
          disabled={matches.length === 0}
          style={{ border: '1px solid #DADCE0', background: '#FFFFFF', borderRadius: 4, padding: '3px 6px', cursor: 'pointer' }}
        >
          <ChevronUp size={14} />
        </button>
        <button
          type="button"
          onClick={handleNextMatch}
          title="Kết quả tiếp theo"
          disabled={matches.length === 0}
          style={{ border: '1px solid #DADCE0', background: '#FFFFFF', borderRadius: 4, padding: '3px 6px', cursor: 'pointer' }}
        >
          <ChevronDown size={14} />
        </button>
      </div>

      {/* Replace input */}
      <div style={{ display: 'flex', gap: 6 }}>
        <input
          type="text"
          placeholder="Thay thế bằng"
          value={replaceText}
          onChange={(e) => setReplaceText(e.target.value)}
          style={{
            flex: 1,
            height: 28,
            borderRadius: 4,
            border: '1px solid #DADCE0',
            padding: '0 8px',
            fontSize: 13,
            outline: 'none',
          }}
        />
      </div>

      {/* Options */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#3C4043', cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={matchCase}
            onChange={(e) => setMatchCase(e.target.checked)}
          />
          Khớp chữ hoa/chữ thường
        </label>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
        <button
          type="button"
          onClick={handleReplaceCurrent}
          disabled={matches.length === 0}
          style={{
            padding: '4px 10px',
            borderRadius: 4,
            border: '1px solid #DADCE0',
            background: '#FFFFFF',
            fontSize: 12,
            fontWeight: 500,
            cursor: matches.length > 0 ? 'pointer' : 'default',
            color: matches.length > 0 ? '#1A73E8' : '#999',
          }}
        >
          Thay thế
        </button>
        <button
          type="button"
          onClick={handleReplaceAll}
          disabled={matches.length === 0}
          style={{
            padding: '4px 12px',
            borderRadius: 4,
            border: 'none',
            background: matches.length > 0 ? '#1A73E8' : '#E0E0E0',
            color: '#FFFFFF',
            fontSize: 12,
            fontWeight: 600,
            cursor: matches.length > 0 ? 'pointer' : 'default',
          }}
        >
          Thay thế tất cả
        </button>
      </div>
    </div>
  );
};
