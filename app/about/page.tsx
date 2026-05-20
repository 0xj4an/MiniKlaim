import Link from "next/link";

export const metadata = {
  title: "Help - MiniKlaim",
  description: "How MiniKlaim works, FAQ, and contact.",
};

export default function AboutPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-8 px-6 py-8">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← Home
        </Link>
        <h1 className="text-xl font-bold">Help</h1>
        <span className="w-16" />
      </header>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">How to play</h2>
        <ol className="ml-6 list-decimal text-sm leading-relaxed text-zinc-700">
          <li>Sign in with your wallet on the home page.</li>
          <li>Pick a name on the You page.</li>
          <li>
            Tap <span className="font-medium">Start running</span> on the home
            page.
          </li>
          <li>
            Walk or run outside. Every block you cross becomes yours on the map.
          </li>
          <li>
            Tap <span className="font-medium">Finish</span> to end your run.
            Your blocks stay yours until someone else runs through them.
          </li>
        </ol>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Common questions</h2>
        <div className="text-sm leading-relaxed text-zinc-700">
          <p className="font-medium text-zinc-900">
            Do I lose blocks if someone else runs through them?
          </p>
          <p>
            Yes. The block goes to whoever ran through last. So keep running to
            keep your turf.
          </p>
        </div>
        <div className="text-sm leading-relaxed text-zinc-700">
          <p className="font-medium text-zinc-900">Does it cost anything?</p>
          <p>No. Playing is free. We don&apos;t charge fees.</p>
        </div>
        <div className="text-sm leading-relaxed text-zinc-700">
          <p className="font-medium text-zinc-900">Why a wallet?</p>
          <p>
            It&apos;s how we keep your name and blocks attached to you across
            devices. We never see your password or your money.
          </p>
        </div>
        <div className="text-sm leading-relaxed text-zinc-700">
          <p className="font-medium text-zinc-900">Is this safe?</p>
          <p>
            Don&apos;t run while staring at your phone. Don&apos;t run in
            dangerous places just to grab a block. The street is more important
            than the map.
          </p>
        </div>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-xl font-semibold">Get in touch</h2>
        <p className="text-sm leading-relaxed text-zinc-700">
          Bugs, ideas, anything else:{" "}
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
