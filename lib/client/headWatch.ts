/**
 * MINIKLAIM-T: React 19 hoists <title>, <meta> and <link> into <head>. On
 * route changes it removes the old ones with `node.parentNode.removeChild`.
 * On some Android MiniPay WebViews the node was already gone from <head>,
 * so parentNode was null and the page fell into the error screen. Nothing
 * in our code touches <head>, so something else does. This records every
 * <head> change made outside React's commit as a Sentry breadcrumb, and the
 * error event carries a snapshot of <head>, so the next event names the
 * culprit.
 */
type Crumb = { category: string; message: string; level: "info" | "warning" };

export function describeHeadNode(node: Node): string | null {
  if (node.nodeType !== 1) return null;
  const el = node as Element;
  const tag = el.tagName.toLowerCase();
  const attr = (n: string) => el.getAttribute(n);
  const key =
    attr("name") ??
    attr("property") ??
    attr("rel") ??
    attr("src")?.slice(0, 80) ??
    attr("href")?.slice(0, 80) ??
    (tag === "title" ? (el.textContent ?? "").slice(0, 40) : null);
  return key ? `${tag}[${key}]` : tag;
}

export function headSnapshot(doc: Document): Record<string, unknown> {
  const head = doc.head;
  if (!head) return { head: "missing" };
  const counts: Record<string, number> = {};
  for (const el of Array.from(head.children)) {
    const tag = el.tagName.toLowerCase();
    counts[tag] = (counts[tag] ?? 0) + 1;
  }
  const viewports = Array.from(head.querySelectorAll('meta[name="viewport"]')).map(
    (m) => m.getAttribute("content") ?? "",
  );
  const foreignScripts = Array.from(head.querySelectorAll("script[src]"))
    .map((s) => s.getAttribute("src") ?? "")
    .filter((src) => src.startsWith("http") && !src.includes(location.host))
    .slice(0, 5);
  return { counts, viewports, foreignScripts, titles: doc.querySelectorAll("title").length };
}

export function installHeadWatch(addBreadcrumb: (c: Crumb) => void): void {
  if (typeof document === "undefined" || typeof MutationObserver === "undefined") return;
  const head = document.head;
  if (!head) return;
  let sent = 0;
  const observer = new MutationObserver((records) => {
    for (const r of records) {
      for (const node of Array.from(r.removedNodes)) {
        const d = describeHeadNode(node);
        if (d && sent < 40) {
          sent += 1;
          addBreadcrumb({ category: "head.removed", message: d, level: "info" });
        }
      }
      for (const node of Array.from(r.addedNodes)) {
        const d = describeHeadNode(node);
        // Only foreign scripts are worth a crumb on add; React re-adds its own tags.
        if (d && d.startsWith("script[http") && !d.includes(location.host) && sent < 40) {
          sent += 1;
          addBreadcrumb({ category: "head.added", message: d, level: "warning" });
        }
      }
    }
  });
  observer.observe(head, { childList: true });
}

const RELOAD_KEY = "miniklaim_head_reload_at";

/**
 * The navigation that hit MINIKLAIM-T already landed on a working page; only
 * React's cleanup of the previous page's <head> tags failed. One reload
 * shows the new page instead of the error screen. Guarded so it never loops.
 */
export function reloadForDetachedHead(error: unknown): boolean {
  if (typeof window === "undefined") return false;
  const message = error instanceof Error ? error.message : String(error);
  if (!/null \(reading 'removeChild'\)/.test(message)) return false;
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) ?? 0);
    if (Date.now() - last < 60_000) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    return false;
  }
  window.location.reload();
  return true;
}
