export interface CompositionState {
  isComposing: boolean;
  blockId: string;
  startOffset: number;
  compositionLength: number;
  text: string;
}

export class CompositionManager {
  private state: CompositionState = {
    isComposing: false,
    blockId: '',
    startOffset: 0,
    compositionLength: 0,
    text: '',
  };
  private lastCompositionEndTime: number = 0;

  public isComposing(): boolean {
    return this.state.isComposing;
  }

  public getCompositionState(): CompositionState {
    return { ...this.state };
  }

  public getComposingText(): string {
    return this.state.text;
  }

  public startComposition(blockId: string, startOffset: number): void {
    this.state = {
      isComposing: true,
      blockId,
      startOffset,
      compositionLength: 0,
      text: '',
    };
  }

  public updateComposition(text: string): { blockId: string; startOffset: number; replaceLength: number; text: string } | null {
    if (!this.state.isComposing) return null;

    const result = {
      blockId: this.state.blockId,
      startOffset: this.state.startOffset,
      replaceLength: this.state.compositionLength,
      text,
    };

    this.state.compositionLength = text.length;
    this.state.text = text;
    return result;
  }

  public endComposition(text?: string): { blockId: string; startOffset: number; replaceLength: number; text: string } | null {
    if (!this.state.isComposing) return null;

    const finalText = text !== undefined ? text : this.state.text;
    const result = {
      blockId: this.state.blockId,
      startOffset: this.state.startOffset,
      replaceLength: this.state.compositionLength,
      text: finalText,
    };

    this.state = {
      isComposing: false,
      blockId: '',
      startOffset: 0,
      compositionLength: 0,
      text: '',
    };

    this.lastCompositionEndTime = Date.now();
    return result;
  }

  public cancel(): void {
    this.state = {
      isComposing: false,
      blockId: '',
      startOffset: 0,
      compositionLength: 0,
      text: '',
    };
    this.lastCompositionEndTime = Date.now();
  }

  public isRecentComposition(thresholdMs = 150): boolean {
    return this.state.isComposing || (Date.now() - this.lastCompositionEndTime < thresholdMs);
  }
}
