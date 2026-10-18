import { RemoteCollaboratorPresence } from '../rendering/interaction-renderer';
import { DocPosition, EditorSelection } from '../selection/position';
import { CaretGeometry, SelectionPageRect, HitTester } from '../hit-testing/hit-tester';
import { DocumentLayout } from '../layout/layout-types';
import { DocumentModel } from '../model/document-model';

export class PresenceService {
  private collaborators: Map<string, RemoteCollaboratorPresence & { rawSelection?: EditorSelection | null }> = new Map();
  private listeners: Set<(collabs: RemoteCollaboratorPresence[]) => void> = new Set();

  public updatePresence(presence: {
    userId: string;
    name: string;
    employeeCode?: string;
    clientId: string;
    color: string;
    selection?: EditorSelection | null;
  }): void {
    const key = `${presence.userId}:${presence.clientId}`;
    this.collaborators.set(key, {
      userId: presence.userId,
      name: presence.name,
      color: presence.color,
      rawSelection: presence.selection,
      caret: null,
      selectionRects: [],
    });
    this.notify();
  }

  public removePresence(userId: string, clientId: string): void {
    const key = `${userId}:${clientId}`;
    this.collaborators.delete(key);
    this.notify();
  }

  public getCollaborators(): RemoteCollaboratorPresence[] {
    return Array.from(this.collaborators.values());
  }

  /**
   * Recomputes geometry (caret positions and selection rectangles) for all active collaborators
   */
  public updateGeometry(layout: DocumentLayout, doc: DocumentModel): void {
    for (const collab of this.collaborators.values()) {
      if (collab.rawSelection) {
        collab.caret = HitTester.getCaretGeometry(collab.rawSelection.focus, layout, doc);
        collab.selectionRects = HitTester.getSelectionRectangles(collab.rawSelection, layout, doc);
      } else {
        collab.caret = null;
        collab.selectionRects = [];
      }
    }
  }

  public subscribe(listener: (collabs: RemoteCollaboratorPresence[]) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify(): void {
    const collabs = Array.from(this.collaborators.values());
    this.listeners.forEach((l) => l(collabs));
  }
}
