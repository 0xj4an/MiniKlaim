"use client";

import { useEffect } from "react";
import { track } from "@/lib/analytics";

export default function ErrorBoundary({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    track("app_crash", {
      error: error.message,
      digest: error.digest ?? "none",
      stack: error.stack?.slice(0, 200) ?? "none",
    });
  }, [error]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 bg-zinc-50 p-4">
      <div className="flex max-w-md flex-col gap-4 rounded-lg border border-zinc-200 bg-white p-6 text-center shadow-sm">
        <h2 className="text-xl font-bold text-zinc-900">Something went wrong</h2>
        <p className="text-sm text-zinc-600">
          The app encountered an unexpected error. This has been logged and
          we'll look into it.
        </p>
        {error.digest && (
          <p className="font-mono text-xs text-zinc-400">
            Error ID: {error.digest}
          </p>
        )}
        <button
          onClick={reset}
          className="rounded-full bg-blue-600 px-6 py-2 text-sm font-semibold text-white hover:bg-blue-700 active:bg-blue-800"
        >
          Try again
        </button>
        <a
          href="/"
          className="text-sm text-blue-600 hover:underline"
        >
          Return home
        </a>
      </div>
    </div>
  );
}
