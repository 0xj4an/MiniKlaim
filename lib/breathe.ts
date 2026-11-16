/**
 * Hand the process back to whatever is waiting, then carry on.
 *
 * Node runs one thing at a time. A loop over half a million rows is one
 * thing, and for as long as it runs no request is answered, no timer fires
 * and no health check gets a reply. Awaiting this between slices of such a
 * loop turns one long freeze into many short ones nobody notices.
 *
 * `setImmediate`, not `setTimeout(0)`: it runs after pending I/O with no
 * minimum delay, so a loop that breathes every few thousand rows does not
 * get four milliseconds slower each time.
 */
export function breathe(): Promise<void> {
  return new Promise((resolve) => setImmediate(resolve));
}
