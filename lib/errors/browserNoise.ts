// MiniPay and the browser emit these. They are not app bugs, and they were
// paging the production exception alert.
const NOISE = [
  "Connection closed",
  "Script error.",
  "Java bridge method invocation error",
];

export function isBrowserNoise(message: string): boolean {
  return NOISE.some((part) => message.includes(part));
}
