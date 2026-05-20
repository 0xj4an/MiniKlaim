import Link from "next/link";

export const metadata = {
  title: "About - MiniKlaim",
  description: "How MiniKlaim works, FAQ, and contact.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">About</h1>
        <span className="w-16" />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">How to play</h2>
        <ol className="ml-6 list-decimal text-sm leading-relaxed text-zinc-700">
          <li>Connect a wallet on the home page.</li>
          <li>Pick a runner name (optional but recommended).</li>
          <li>
            Tap <span className="font-medium">Start Run</span> on the map page.
          </li>
          <li>
            Walk or run through the city. Each hexagonal tile you enter becomes
            yours.
          </li>
          <li>
            Tap <span className="font-medium">Finish Run</span> to lock in your
            run.
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">FAQ</h2>
        <div className="text-sm leading-relaxed text-zinc-700">
          <p className="font-medium text-zinc-900">
            Do I lose hexes if someone else runs through them?
          </p>
          <p>
            Yes. Territory transfers to whoever ran through last. The map only
            tracks current owners.
          </p>
        </div>
        <div className="text-sm leading-relaxed text-zinc-700">
          <p className="font-medium text-zinc-900">What chain runs this?</p>
          <p>Celo mainnet (chain ID 42220).</p>
        </div>
        <div className="text-sm leading-relaxed text-zinc-700">
          <p className="font-medium text-zinc-900">Does it cost anything?</p>
          <p>No. Running and claiming are free.</p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Contact</h2>
        <p className="text-sm leading-relaxed text-zinc-700">
          Bug reports, feature requests, support:{" "}
          <a
            href="https://x.com/0xj4an"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            @0xj4an on X
          </a>
          .
        </p>
      </section>

      <footer className="mt-8 flex flex-col gap-2 border-t border-zinc-200 pt-6 text-xs text-zinc-400">
        <div className="flex gap-4">
          <Link href="/privacy" className="underline hover:text-zinc-600">
            Privacy
          </Link>
          <Link href="/terms" className="underline hover:text-zinc-600">
            Terms
          </Link>
        </div>
        <p>MiniKlaim is a hobby project. Use at your own risk. No warranty.</p>
      </footer>
    </main>
  );
}
