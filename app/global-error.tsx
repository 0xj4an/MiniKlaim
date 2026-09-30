"use client";

import { useEffect } from "react";
import Link from "next/link";
import * as Sentry from "@sentry/nextjs";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    Sentry.captureException(error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-white text-zinc-900">
        <main className="mx-auto flex min-h-screen max-w-md flex-col items-center justify-center gap-4 px-6 text-center">
          <h1 className="text-2xl font-bold">Something broke</h1>
          <p className="text-sm text-zinc-600">
            We couldn&apos;t load this page. Try again, or head back home.
          </p>
          <div className="flex gap-3">
            <button
              onClick={reset}
              className="rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white"
            >
              Try again
            </button>
            <Link
              href="/"
              className="rounded-md bg-zinc-100 px-4 py-2 text-sm font-medium text-zinc-900"
            >
              Home
            </Link>
          </div>
        </main>
      </body>
    </html>
  );
}
