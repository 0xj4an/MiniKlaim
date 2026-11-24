// MiniPay and the browser emit these. They are not app bugs, and they were
// paging the production exception alert.
const NOISE = [
  "Connection closed",
  "Script error.",
  "Java bridge method invocation error",
  // Old Android WebViews (Android 7, WebView 119) fail to open IndexedDB for
  // a wallet SDK and reject with no stack (MINIKLAIM-10, -11, -K). The page
  // keeps working; nothing in our code to change.
  "UnknownError: Internal error.",
  "Internal error opening backing store for indexedDB.open",
  "AbortError: The connection was closed.",
  // A desktop wallet extension refusing a silent account read before the
  // site was approved (MINIKLAIM-Z). The connect button still works.
  "has not been authorized yet",
  // The MetaMask desktop extension failing its own handshake on /stats and /
  // (MINIKLAIM-13, -15). MiniKlaim targets MiniPay; nothing to fix here.
  "Failed to connect to MetaMask",
  // An injected wallet/WebView bridge script calling its own missing method
  // (MINIKLAIM-16). Not our code.
  "bridge.event is not a function",
];

/**
 * MiniPay's iOS bridge rejecting a `postMessage` during wagmi's reconnect
 * (MINIKLAIM-H). Only native frames, nothing of ours to change, no effect on
 * the session. Counted as `wallet_bridge_rejected`; not an exception to
 * anyone: Sentry dropped it and PostHog kept recording it as an uncaught
 * `DOMException: InvalidAccessError` (15 events from 6 iPhones in 48 h,
 * read as a new bug on 24 Nov 2026).
 */
export const WALLET_BRIDGE_REJECTED =
  "The object does not support the operation or argument.";

export function isWalletBridgeRejection(message: string): boolean {
  return message.includes(WALLET_BRIDGE_REJECTED);
}

export function isBrowserNoise(message: string): boolean {
  return NOISE.some((part) => message.includes(part));
}
