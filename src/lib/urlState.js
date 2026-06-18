/**
 * Idempotent URL param helpers using replaceState only.
 * No history entries are pushed — Back behavior is unchanged.
 * Uses globalThis.window so the module is safe to import in SSR/test contexts.
 */

export function setUrlParam(key, value) {
  const win = globalThis.window;
  if (!win) return;
  const params = new URLSearchParams(win.location.search);
  if (value == null) {
    params.delete(key);
  } else {
    params.set(key, value);
  }
  const search = params.toString();
  win.history.replaceState({}, '', search ? `?${search}` : win.location.pathname);
}

export function getUrlParam(key) {
  const win = globalThis.window;
  if (!win) return null;
  return new URLSearchParams(win.location.search).get(key);
}
