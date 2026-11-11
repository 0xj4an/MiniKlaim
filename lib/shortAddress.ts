/**
 * An address a person can recognise as theirs without it being printed in
 * full: `0x` and six characters, an ellipsis, the last six.
 */
export function shortAddress(address: string): string {
  if (address.length <= 16) return address;
  return `${address.slice(0, 8)}…${address.slice(-6)}`;
}
