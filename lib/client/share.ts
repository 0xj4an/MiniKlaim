/**
 * Share a caption to X, Facebook or Instagram from inside a wallet WebView.
 *
 * The old flow navigated to twitter:// / fb:// / instagram:// and then, 1.5 s
 * later, opened the web page. In the iOS MiniPay WebView the custom scheme
 * does nothing and the delayed window.open is no longer tied to the tap, so
 * WebKit blocks it: nothing happened at all (reported 11 Oct).
 *
 * Now, all inside the tap: copy the caption, open the web intent with
 * window.open, and if that is blocked use the system share sheet, which also
 * lists the installed X, Facebook and Instagram apps.
 */
export type ShareChannel = "x" | "facebook" | "instagram";
export type ShareMethod = "intent" | "sheet" | "copied" | "none";

export function shareIntentUrl(
  channel: Exclude<ShareChannel, "instagram">,
  text: string,
  url: string,
): string {
  return channel === "x"
    ? `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`
    : `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}&quote=${encodeURIComponent(text)}`;
}

function openNow(href: string): boolean {
  try {
    // No "noopener" in features: with it window.open always returns null and
    // a blocked popup cannot be told apart from an opened one.
    const w = window.open(href, "_blank");
    if (w) {
      try {
        w.opener = null;
      } catch {
        // cross-origin already
      }
      return true;
    }
  } catch {
    // blocked
  }
  return false;
}

async function systemSheet(text: string, url: string): Promise<boolean> {
  if (typeof navigator === "undefined" || !("share" in navigator)) return false;
  try {
    await navigator.share({ title: "MiniKlaim", text, url });
    return true;
  } catch (e) {
    // The player closed the sheet: that still counts as handled.
    return e instanceof DOMException && e.name === "AbortError";
  }
}

async function copy(caption: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(caption);
    return true;
  } catch {
    return false;
  }
}

/** Must be called straight from the click handler (no await before it). */
export async function shareTo(
  channel: ShareChannel,
  text: string,
  url: string,
): Promise<ShareMethod> {
  const caption = `${text} ${url}`;
  if (channel !== "instagram") {
    // Open first: any await before window.open loses the user gesture.
    if (openNow(shareIntentUrl(channel, text, url))) {
      void copy(caption);
      return "intent";
    }
  }
  // Instagram has no web share link; the sheet lists the app when installed.
  if (await systemSheet(text, url)) return "sheet";
  return (await copy(caption)) ? "copied" : "none";
}
