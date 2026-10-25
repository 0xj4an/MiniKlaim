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

export function isBrowserNoise(message: string): boolean {
  return NOISE.some((part) => message.includes(part));
}
