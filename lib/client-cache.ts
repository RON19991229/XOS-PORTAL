// v2.19.0 — tiny in-memory cache for dashboard lists (stale-while-revalidate).
//
// Lives in the JS module scope of the current browser tab, so it survives
// client-side navigation (TODAY → CUSTOMERS → TODAY) but is wiped by any
// full page load — including logout, which does a hard window.location
// redirect. Nothing is written to localStorage/sessionStorage, so customer
// data never persists on the shared counter PC.
//
// Usage: render cached rows immediately, then refetch in the background and
// replace them. The UI never shows data older than the last visit to that
// page in this tab.

const store = new Map<string, unknown>();

export function getCached<T>(key: string): T | undefined {
  return store.get(key) as T | undefined;
}

export function setCached<T>(key: string, value: T): void {
  store.set(key, value);
}
