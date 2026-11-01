// Cursor colours, all readable as a label background with white text.
const PALETTE = [
  '#e11d48', '#db2777', '#c026d3', '#7c3aed', '#4f46e5', '#2563eb',
  '#0284c7', '#0d9488', '#16a34a', '#65a30d', '#d97706', '#ea580c',
]

// Stable per user, so a person keeps the same colour in every document and tab.
export function colorFor(userId: string): string {
  let hash = 0
  for (const char of userId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return PALETTE[hash % PALETTE.length]
}
