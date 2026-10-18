/**
 * ID generator for blocks, runs, tables, cells, and transactions.
 */

let counter = 0;

export function generateId(prefix = 'node'): string {
  counter += 1;
  const time = Date.now().toString(36);
  const rand = Math.random().toString(36).substring(2, 7);
  return `${prefix}-${time}-${rand}-${counter}`;
}

export function generateBlockId(type = 'block'): string {
  return generateId(`b-${type.slice(0, 3)}`);
}

export function generateRunId(): string {
  return generateId('r');
}

export function generateTransactionId(): string {
  return generateId('tx');
}
