/**
 * Deterministic collaborator colors and contrast utilities.
 */

const COLLABORATOR_PALETTE = [
  '#0F6CBD', // Blue
  '#107C41', // Green
  '#D83B01', // Orange/Red
  '#8764B8', // Purple
  '#008272', // Teal
  '#B4009E', // Magenta
  '#C239B3', // Pink
  '#E3008C', // Berry
  '#498205', // Dark Green
  '#C19C00', // Gold/Dark Yellow
];

export function getCollaboratorColor(id: string): string {
  let hash = 0;
  for (let i = 0; i < id.length; i++) {
    hash = (hash << 5) - hash + id.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % COLLABORATOR_PALETTE.length;
  return COLLABORATOR_PALETTE[index];
}

export function hexToRgba(hex: string, alpha: number): string {
  let cleanHex = hex.replace('#', '');
  if (cleanHex.length === 3) {
    cleanHex = cleanHex.split('').map((c) => c + c).join('');
  }
  const r = parseInt(cleanHex.substring(0, 2), 16) || 0;
  const g = parseInt(cleanHex.substring(2, 4), 16) || 0;
  const b = parseInt(cleanHex.substring(4, 6), 16) || 0;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
