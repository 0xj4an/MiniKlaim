import Link from "next/link";

export const metadata = {
  title: "Terms - MiniKlaim",
  description: "Terms of service for MiniKlaim.",
};

export default function TermsPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link
          href="/about"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">Terms</h1>
        <span className="w-16" />
      </header>

      <p className="text-xs text-zinc-400">Last updated: 2026-05-20.</p>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">What it is</h2>
        <p>
          MiniKlaim is a hobby running game. You connect a wallet, you run
          through blocks on a map, and the blocks become yours until someone
          else claims them.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">No warranty</h2>
        <p>
          The service is provided as-is. We do not promise it works, will keep
          working, will not lose your runs, or will protect you from heat, cold,
          traffic, dogs, or any other real-world hazard. Run safely.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">Safety</h2>
        <p>
          Pay attention to your surroundings. The game shows you a map; the
          street is the source of truth. Do not run while staring at your phone.
          Do not run in dangerous areas because a block looks tempting.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">No money</h2>
        <p>
          MiniKlaim is free. There are no in-app purchases, no rewards in
          tokens, no NFTs, no claims of monetary value. The wallet connection is
          for identity only.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">Acceptable use</h2>
        <p>
          Do not spam runs, do not impersonate other players in your runner
          name, do not abuse the API. The maintainer may remove accounts that
          break these rules.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">Changes</h2>
        <p>
          These terms can change. If they do, the &quot;last updated&quot; date
          above gets bumped. Continued use after a change counts as acceptance.
        </p>
      </section>
    </main>
  );
}
