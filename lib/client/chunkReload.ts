/**
 * After a deploy, a tab still running the old build asks for chunk files
 * that no longer exist and the page crashes ("Failed to load chunk ...").
 * Seen on 8 players on 12 Oct. One reload fetches the new build. A short
 * guard in sessionStorage stops a loop if the chunk is really missing.
 */
const KEY = "miniklaim_chunk_reload_at";
const GUARD_MS = 60_000;

export function isChunkLoadError(error: unknown): boolean {
  const name = error instanceof Error ? error.name : "";
  const message = error instanceof Error ? error.message : String(error);
  return (
    name === "ChunkLoadError" ||
    /failed to load chunk|loading chunk [\w-]+ failed|failed to fetch dynamically imported module|importing a module script failed|error loading dynamically imported module/i.test(
      message,
    )
  );
}

/** Reload once for a stale-build chunk error. True when a reload started. */
export function reloadForStaleChunk(error: unknown): boolean {
  if (typeof window === "undefined" || !isChunkLoadError(error)) return false;
  try {
    const last = Number(window.sessionStorage.getItem(KEY) ?? 0);
    if (Date.now() - last < GUARD_MS) return false;
    window.sessionStorage.setItem(KEY, String(Date.now()));
  } catch {
    // No storage: reload anyway; the browser cache makes a loop unlikely.
  }
  window.location.reload();
  return true;
}

/**
 * Chunk errors outside a React boundary (a lazy import in an event handler
 * or a promise) never reach app/error.tsx, so the tab stayed broken. Catch
 * them on window. During a run a reload restarts GPS, so /run only counts
 * them; the boundary still reloads if the page itself breaks.
 */
export function installStaleChunkReload(onReload: () => void): void {
  if (typeof window === "undefined") return;
  const handle = (error: unknown) => {
    if (!isChunkLoadError(error)) return;
    if (window.location.pathname.startsWith("/run")) return;
    if (reloadForStaleChunk(error)) onReload();
  };
  window.addEventListener("error", (e) => handle(e.error ?? e.message));
  window.addEventListener("unhandledrejection", (e) => handle(e.reason));
}
