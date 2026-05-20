import Link from "next/link";

export const metadata = {
  title: "Privacy - MiniKlaim",
  description: "Privacy policy for MiniKlaim.",
};

export default function PrivacyPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-12">
      <header className="flex items-center justify-between">
        <Link
          href="/about"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← Back
        </Link>
        <h1 className="text-2xl font-bold">Privacy</h1>
        <span className="w-16" />
      </header>

      <p className="text-xs text-zinc-400">Last updated: 2026-05-20.</p>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">What we store</h2>
        <p>
          MiniKlaim is a public-by-design territory game. To make it work we
          store, on our database:
        </p>
        <ul className="ml-6 list-disc">
          <li>
            Your wallet address (Ethereum-format, 42 chars). This is your
            identity in the game.
          </li>
          <li>
            Your runner name (optional, the alias you pick on the home page).
          </li>
          <li>
            The H3 hex tiles you claim, with timestamps and which run claimed
            them.
          </li>
          <li>Run records (start time, end time, hex count, distance).</li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">
          What we do NOT store
        </h2>
        <ul className="ml-6 list-disc">
          <li>
            Raw GPS tracks. We only persist the H3 hex IDs you crossed, not the
            polyline of your run.
          </li>
          <li>
            Your phone number, email, real name, or any off-chain identity
            unless you choose to volunteer it via your runner name.
          </li>
          <li>
            Private keys or seed phrases. Wallet authentication happens via your
            browser wallet; we never see secrets.
          </li>
        </ul>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">What is public</h2>
        <p>
          Hex ownership, runner names, run totals, and the leaderboard are
          visible to anyone visiting the app. If you do not want a public
          identifier, do not set a runner name; the app will fall back to your
          truncated wallet address.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">Deletion</h2>
        <p>
          To delete your data, contact{" "}
          <a
            href="https://x.com/0xj4an"
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-600 underline"
          >
            @0xj4an on X
          </a>{" "}
          with your wallet address. We will remove your user row and your
          claimed hex rows within 7 days.
        </p>
      </section>

      <section className="flex flex-col gap-2 text-sm leading-relaxed text-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-900">Cookies</h2>
        <p>
          MiniKlaim uses a single cookie (`wagmi.store`) to remember your wallet
          connection across page reloads. No analytics, advertising, or
          third-party trackers.
        </p>
      </section>
    </main>
  );
}
