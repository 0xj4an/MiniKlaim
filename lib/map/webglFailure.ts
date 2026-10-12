"use client";

import { useEffect, useState } from "react";

import { isWebglFailure } from "@/lib/map/isWebglFailure";

export { isWebglFailure };

/** True once the page has seen a WebGL failure. */
export function useWebglFailure(onFirst?: () => void): boolean {
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let seen = false;
    const handler = (e: ErrorEvent) => {
      const message =
        e.message || (e.error instanceof Error ? e.error.message : "");
      if (seen || !isWebglFailure(message)) return;
      seen = true;
      setFailed(true);
      onFirst?.();
    };
    window.addEventListener("error", handler);
    return () => window.removeEventListener("error", handler);
    // onFirst is a fire-once callback; re-subscribing on identity change
    // would only reset `seen`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  return failed;
}
