import { fontMetrics } from './font-metrics-service';

export interface FontOption {
  family: string;
  name: string;
  generic: string;
}

export const AVAILABLE_FONTS: FontOption[] = [
  { family: 'Arial', name: 'Arial', generic: 'sans-serif' },
  { family: 'Times New Roman', name: 'Times New Roman', generic: 'serif' },
  { family: 'Roboto', name: 'Roboto', generic: 'sans-serif' },
  { family: 'Inter', name: 'Inter', generic: 'sans-serif' },
  { family: 'Calibri', name: 'Calibri', generic: 'sans-serif' },
  { family: 'Courier New', name: 'Courier New', generic: 'monospace' },
  { family: 'Georgia', name: 'Georgia', generic: 'serif' },
  { family: 'Verdana', name: 'Verdana', generic: 'sans-serif' },
  { family: 'Trebuchet MS', name: 'Trebuchet MS', generic: 'sans-serif' },
  { family: 'Tahoma', name: 'Tahoma', generic: 'sans-serif' },
  { family: 'Consolas', name: 'Consolas', generic: 'monospace' },
];

export class FontManager {
  private static instance: FontManager;
  private listeners: Set<() => void> = new Set();

  private constructor() {
    if (typeof document !== 'undefined' && document.fonts) {
      document.fonts.ready.then(() => {
        this.notifyChange();
      });
      document.fonts.addEventListener('loadingdone', () => {
        this.notifyChange();
      });
    }
  }

  public static getInstance(): FontManager {
    if (!FontManager.instance) {
      FontManager.instance = new FontManager();
    }
    return FontManager.instance;
  }

  public onFontChange(listener: () => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notifyChange(): void {
    fontMetrics.clearCache();
    this.listeners.forEach((l) => {
      try {
        l();
      } catch (err) {
        console.error('Error notifying font change listener:', err);
      }
    });
  }
}
