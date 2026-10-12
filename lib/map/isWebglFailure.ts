/**
 * Old Android GPUs (seen on Android 8.1 in MiniPay) cannot compile
 * MapLibre's shaders. The error is thrown from the render loop, outside
 * React, so the map stays blank with no explanation. On /run GPS starts in
 * the map's load handler, which never fires, so the run cannot start either.
 */
export function isWebglFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    (m.includes("could not compile") && m.includes("shader")) ||
    m.includes("failed to initialize webgl")
  );
}
