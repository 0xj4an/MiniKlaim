import { headers } from "next/headers";

/**
 * Fetch one of this app's own API routes from a server component.
 *
 * The profile page asked for it through the public address the request came
 * in on (`https://miniklaim.fun/api/...`), so a server already holding the
 * answer went out through DNS and the proxy to reach itself. On 10 Nov 2026
 * that lookup failed (`getaddrinfo EAI_AGAIN miniklaim.fun`, MINIKLAIM-1Y)
 * and the page threw.
 *
 * The public address is still tried first, because it is the one that works
 * everywhere, in dev and behind any proxy. When that request cannot be made
 * at all, the same path is asked of this process on the loopback address,
 * which needs no DNS. An answer with an error status is returned as it is:
 * only a request that never got an answer is retried.
 */
export async function fetchOwnApi(path: string): Promise<Response> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = host ? `${proto}://${host}` : "";
  try {
    return await fetch(`${base}${path}`, { cache: "no-store" });
  } catch (first) {
    const port = process.env.PORT?.trim() || "3000";
    try {
      return await fetch(`http://127.0.0.1:${port}${path}`, {
        cache: "no-store",
      });
    } catch {
      // The first failure is the one worth reporting: it names the address
      // that should have worked.
      throw first;
    }
  }
}
