/**
 * Typed Event Bus for editor lifecycle events.
 */

export type EditorEventMap = {
  documentChanged: { documentId: string; revision: number };
  selectionChanged: { hasSelection: boolean; isCollapsed: boolean };
  layoutChanged: { pageCount: number; documentHeight: number };
  saveStateChanged: { state: 'saved' | 'saving' | 'unsaved' | 'offline' | 'error'; message?: string };
  presenceChanged: { collaborators: any[] };
  activeFormattingChanged: { marks: Record<string, any>; paragraphStyle: Record<string, any> };
  zoomChanged: { zoom: number };
  pageSetupChanged: { settings: any };
  findStateChanged: { query: string; matchCount: number; activeIndex: number };
  commentsChanged: { count: number };
};

type Listener<T> = (data: T) => void;

export class TypedEventBus {
  private listeners: { [K in keyof EditorEventMap]?: Set<Listener<EditorEventMap[K]>> } = {};

  on<K extends keyof EditorEventMap>(event: K, listener: Listener<EditorEventMap[K]>): () => void {
    if (!this.listeners[event]) {
      this.listeners[event] = new Set() as any;
    }
    this.listeners[event]!.add(listener);
    return () => this.off(event, listener);
  }

  off<K extends keyof EditorEventMap>(event: K, listener: Listener<EditorEventMap[K]>): void {
    this.listeners[event]?.delete(listener);
  }

  emit<K extends keyof EditorEventMap>(event: K, data: EditorEventMap[K]): void {
    this.listeners[event]?.forEach((listener) => {
      try {
        listener(data);
      } catch (err) {
        console.error(`Error in event bus listener for ${event}:`, err);
      }
    });
  }

  clear(): void {
    this.listeners = {};
  }
}
