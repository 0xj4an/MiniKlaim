/**
 * Old Android GPUs (seen on Android 8.1 in MiniPay) cannot compile
 * MapLibre's shaders. The error is thrown from the render loop, outside
 * React, so the map stays blank with no explanation. On /run GPS starts in
 * the map's load handler, which never fires, so the run cannot start either.
 *
 * MapLibre 6 dropped WebGL1 and throws a `GPUInitializationError` from the
 * Map constructor instead, whose message is "WebGL2 is required to display
 * this map..." — none of the older patterns match it, so a device without
 * WebGL2 would be reported as an ordinary crash and /me would fall over
 * instead of hiding the map. Both the message and the error name are matched
 * because callers pass whichever they have.
 */
export function isWebglFailure(message: string): boolean {
  const m = message.toLowerCase();
  return (
    (m.includes("could not compile") && m.includes("shader")) ||
    m.includes("failed to initialize webgl") ||
    m.includes("webgl2 is required") ||
    m.includes("gpuinitializationerror")
  );
}
