/**
 * Unit conversion utilities for document layout and rendering.
 * All internal layout calculations use CSS Pixels at 96 DPI.
 */

export const DPI = 96;
export const POINTS_PER_INCH = 72;
export const MM_PER_INCH = 25.4;

export const pointsToPx = (pt: number): number => {
  return (pt * DPI) / POINTS_PER_INCH;
};

export const pxToPoints = (px: number): number => {
  return (px * POINTS_PER_INCH) / DPI;
};

export const inchesToPx = (inches: number): number => {
  return inches * DPI;
};

export const pxToInches = (px: number): number => {
  return px / DPI;
};

export const millimetersToPx = (mm: number): number => {
  return (mm / MM_PER_INCH) * DPI;
};

export const pxToMillimeters = (px: number): number => {
  return (px / DPI) * MM_PER_INCH;
};

export interface PageDimensions {
  width: number;
  height: number;
}

export type PaperSize = 'A4' | 'Letter' | 'Legal' | 'A3' | 'A5';

export const PAPER_SIZES: Record<PaperSize, PageDimensions> = {
  // A4: 210mm x 297mm (793.7px x 1122.5px at 96 DPI, standardized to 794 x 1123)
  A4: {
    width: Math.round(millimetersToPx(210)),
    height: Math.round(millimetersToPx(297)),
  },
  // Letter: 8.5in x 11in (816px x 1056px at 96 DPI)
  Letter: {
    width: Math.round(inchesToPx(8.5)),
    height: Math.round(inchesToPx(11)),
  },
  // Legal: 8.5in x 14in (816px x 1344px at 96 DPI)
  Legal: {
    width: Math.round(inchesToPx(8.5)),
    height: Math.round(inchesToPx(14)),
  },
  A3: {
    width: Math.round(millimetersToPx(297)),
    height: Math.round(millimetersToPx(420)),
  },
  A5: {
    width: Math.round(millimetersToPx(148)),
    height: Math.round(millimetersToPx(210)),
  },
};
