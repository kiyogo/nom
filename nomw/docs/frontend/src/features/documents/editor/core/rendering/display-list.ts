export interface DrawRectCommand {
  type: 'rect';
  x: number;
  y: number;
  width: number;
  height: number;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  radius?: number;
}

export interface DrawLineCommand {
  type: 'line';
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  stroke: string;
  strokeWidth: number;
  dash?: number[];
}

export interface DrawTextCommand {
  type: 'text';
  text: string;
  x: number;
  y: number; // baseline y
  fontFamily: string;
  fontSize: number; // in points
  fontWeight?: string | number;
  fontStyle?: string;
  fill: string;
  underline?: boolean;
  strike?: boolean;
}

export interface DrawImageCommand {
  type: 'image';
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface DrawSelectionCommand {
  type: 'selection';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}

export interface DrawCaretCommand {
  type: 'caret';
  x: number;
  y: number;
  width: number;
  height: number;
  fill: string;
}

export interface PushClipCommand {
  type: 'push-clip';
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PopClipCommand {
  type: 'pop-clip';
}

export type PaintCommand =
  | DrawRectCommand
  | DrawLineCommand
  | DrawTextCommand
  | DrawImageCommand
  | DrawSelectionCommand
  | DrawCaretCommand
  | PushClipCommand
  | PopClipCommand;

export class DisplayList {
  public commands: PaintCommand[] = [];

  public clear(): void {
    this.commands = [];
  }

  public add(cmd: PaintCommand): void {
    this.commands.push(cmd);
  }

  public drawRect(
    x: number,
    y: number,
    width: number,
    height: number,
    options?: { fill?: string; stroke?: string; strokeWidth?: number; radius?: number }
  ): void {
    this.add({
      type: 'rect',
      x,
      y,
      width,
      height,
      ...options,
    });
  }

  public drawLine(
    x1: number,
    y1: number,
    x2: number,
    y2: number,
    stroke: string,
    strokeWidth = 1,
    dash?: number[]
  ): void {
    this.add({
      type: 'line',
      x1,
      y1,
      x2,
      y2,
      stroke,
      strokeWidth,
      dash,
    });
  }

  public drawText(
    text: string,
    x: number,
    y: number,
    fontFamily: string,
    fontSize: number,
    fill: string,
    options?: { fontWeight?: string | number; fontStyle?: string; underline?: boolean; strike?: boolean }
  ): void {
    this.add({
      type: 'text',
      text,
      x,
      y,
      fontFamily,
      fontSize,
      fill,
      ...options,
    });
  }

  public drawImage(src: string, x: number, y: number, width: number, height: number): void {
    this.add({
      type: 'image',
      src,
      x,
      y,
      width,
      height,
    });
  }

  public pushClip(x: number, y: number, width: number, height: number): void {
    this.add({ type: 'push-clip', x, y, width, height });
  }

  public popClip(): void {
    this.add({ type: 'pop-clip' });
  }
}
