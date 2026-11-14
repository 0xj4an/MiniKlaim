/**
 * A tab that outlived a deploy.
 *
 * The page keeps running the code it loaded. When the server starts asking
 * for something that code never sends, every request from that tab fails
 * for as long as the player leaves it open. 13 Nov 2026: the server began
 * requiring the run token on a claim, and three runs that were under way
 * got a 403 on every upload. One of them was refused 101 times in 25
 * minutes and ended with no blocks.
 *
 * So when the server refuses a claim, the tab asks which build is live. A
 * different one means the refusal is about this tab's age: it reloads once
 * onto the new code, where the run resumes and its saved queue goes up.
 */
const RELOADED_KEY = "miniklaim_reloaded_for_build";

/** Whether this tab's build is not the one the server is running. */
export function buildDiffers(mine: unknown, server: unknown): boolean {
  if (typeof mine !== "string" || typeof server !== "string") return false;
  if (mine.length < 7 || server.length < 7) return false;
  return mine !== server;
}

/** The commit the server is running, or null when it cannot be read. */
export async function liveBuild(): Promise<string | null> {
  const abort = new AbortController();
  const timer = window.setTimeout(() => abort.abort(), 5_000);
  try {
    const res = await fetch("/api/health", { cache: "no-store", signal: abort.signal });
    const data = (await res.json()) as { build?: { commit?: unknown } };
    return typeof data.build?.commit === "string" ? data.build.commit : null;
  } catch {
    return null;
  } finally {
    window.clearTimeout(timer);
  }
}

/**
 * Whether to reload for this build. Once per build per tab: if the reload
 * did not help, the refusal was not about the tab's age and a second one
 * would only loop.
 */
export function claimReload(
  storage: Pick<Storage, "getItem" | "setItem"> | null,
  server: string,
): boolean {
  try {
    if (!storage) return false;
    if (storage.getItem(RELOADED_KEY) === server) return false;
    storage.setItem(RELOADED_KEY, server);
    return true;
  } catch {
    return false;
  }
}
