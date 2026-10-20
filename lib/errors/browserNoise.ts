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
];

export function isBrowserNoise(message: string): boolean {
  return NOISE.some((part) => message.includes(part));
}
