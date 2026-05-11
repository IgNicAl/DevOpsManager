// Deterministic color from string id. Returns Material Design 3-style accent + on-color pair.
const PALETTE: Array<{ bg: string; fg: string; border: string }> = [
  { bg: '#1e5128', fg: '#c8f7c8', border: '#5bf06c' },
  { bg: '#1a3a6e', fg: '#cee4ff', border: '#6fa8ff' },
  { bg: '#5a3a17', fg: '#ffd7b3', border: '#ffa45c' },
  { bg: '#5a1e3a', fg: '#ffc8d6', border: '#ff5c8a' },
  { bg: '#3a1e5a', fg: '#dbc8ff', border: '#a45cff' },
  { bg: '#1e5a55', fg: '#a4f5ee', border: '#5cffe6' },
  { bg: '#5a5a1e', fg: '#fff5a4', border: '#e6c850' },
  { bg: '#2d1e5a', fg: '#bcb0ff', border: '#7c6cff' },
];

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  }
  return Math.abs(h);
}

export function colorFor(id: string): { bg: string; fg: string; border: string } {
  return PALETTE[hash(id) % PALETTE.length];
}
