"use client";

type Sentinel = { release: () => Promise<void> };
type WakeLockApi = { request: (type: "screen") => Promise<Sentinel> };

/**
 * Keep the screen on while a run is active. Android WebViews stop delivering
 * GPS when the screen turns off, which shows up as gaps where no hexes are
 * captured. The browser drops the lock whenever the page is hidden, so it is
 * requested again on every return to the page. Unsupported browsers ignore it.
 */
export function holdScreenAwake(): () => void {
  if (typeof navigator === "undefined") return () => {};
  const api = (navigator as Navigator & { wakeLock?: WakeLockApi }).wakeLock;
  if (!api) return () => {};
  let sentinel: Sentinel | null = null;
  let stopped = false;
  const acquire = async () => {
    if (stopped || document.visibilityState !== "visible") return;
    try {
      sentinel = await api.request("screen");
    } catch {
      // Denied (battery saver, policy). Nothing else to do.
    }
  };
  const onVisible = () => {
    if (document.visibilityState === "visible") void acquire();
  };
  void acquire();
  document.addEventListener("visibilitychange", onVisible);
  return () => {
    stopped = true;
    document.removeEventListener("visibilitychange", onVisible);
    void sentinel?.release().catch(() => {});
    sentinel = null;
  };
}
