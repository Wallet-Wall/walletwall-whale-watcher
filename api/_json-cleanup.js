export function stripJsonCodeFence(value) {
  let text = String(value || '').trim();
  if (!text.startsWith('```')) return text;

  const firstLineEnd = text.indexOf('\n');
  if (firstLineEnd === -1) return text;

  const fenceLabel = text.slice(3, firstLineEnd).trim().toLowerCase();
  if (fenceLabel && fenceLabel !== 'json') return text;

  text = text.slice(firstLineEnd + 1).trim();
  if (text.endsWith('```')) text = text.slice(0, -3).trim();
  return text;
}
