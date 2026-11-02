/**
 * Whether a map failure is worth an exception, or only a count.
 *
 * Added after watching what the new reporting actually produced. Within half
 * an hour of shipping it, Sentry had a fresh issue: the basemap style failing
 * to fetch on `/run`, from a phone outdoors. The request never completed,
 * which is what a runner losing signal looks like. Nothing is broken, nobody
 * can fix it, and it would have arrived for every player who runs through a
 * tunnel.
 *
 * So a transport failure is counted in analytics and kept out of Sentry. A
 * style that is genuinely wrong, or a host returning an error, still raises,
 * because that is ours to fix and it would show as a status rather than as a
 * dead request.
 */
export type FailureStage = "import" | "construct" | "style" | "draw";

/**
 * MapLibre reports a request that never completed as status 0. A real HTTP
 * error from the tile host carries its status instead, and those stay.
 */
const DEAD_REQUEST =
  /\((?:[a-z0-9.-]+)\)\s*\(0\)|Failed to fetch|NetworkError|Load failed|ERR_(?:INTERNET|NETWORK|CONNECTION|NAME_NOT_RESOLVED)/i;

export function shouldRaiseToSentry(
  stage: FailureStage,
  message: string,
): boolean {
  // Only the style stage talks to the network on someone else's behalf. A
  // bundle that will not load, a GPU that refuses, or a frame that throws
  // are all ours.
  if (stage !== "style") return true;
  return !DEAD_REQUEST.test(message);
}
