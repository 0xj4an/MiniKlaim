import Link from "next/link";
import { notFound } from "next/navigation";
import { headers } from "next/headers";
import type { Metadata } from "next";

type PublicProfile = {
  username: string;
  hexesOwned: number;
  totalRuns: number;
  bestRunHexes: number;
  bestRunDistanceMeters: number;
};

async function fetchProfile(username: string): Promise<PublicProfile | null> {
  const h = await headers();
  const host = h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "http";
  const base = host ? `${proto}://${host}` : "";
  const res = await fetch(`${base}/api/profile/${username}`, {
    cache: "no-store",
  });
  if (!res.ok) return null;
  return (await res.json()) as PublicProfile;
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}): Promise<Metadata> {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) {
    return { title: "Player not found - MiniKlaim" };
  }
  return {
    title: `@${profile.username} - MiniKlaim`,
    description: `${profile.hexesOwned} blocks captured across ${profile.totalRuns} runs.`,
  };
}

export default async function PublicProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await fetchProfile(username);
  if (!profile) notFound();

  const bestKm =
    profile.bestRunDistanceMeters >= 1000
      ? `${(profile.bestRunDistanceMeters / 1000).toFixed(2)} km`
      : `${profile.bestRunDistanceMeters} m`;

  return (
    <main className="mx-auto flex min-h-screen max-w-2xl flex-col gap-6 px-6 py-8">
      <header className="flex items-center justify-between">
        <Link
          href="/"
          className="rounded-md bg-zinc-100 px-3 py-1.5 text-sm font-medium text-zinc-900 hover:bg-zinc-200"
        >
          ← Home
        </Link>
        <h1 className="text-xl font-bold">Player</h1>
        <span className="w-16" />
      </header>

      <div className="flex flex-col items-center gap-1">
        <p className="text-2xl font-bold">
          <span className="text-zinc-400">@</span>
          <span>{profile.username}</span>
        </p>
      </div>

      <div className="flex justify-center gap-8 text-center">
        <BigStat label="blocks" value={profile.hexesOwned} />
        <BigStat label="runs" value={profile.totalRuns} />
      </div>

      {(profile.bestRunHexes > 0 || profile.bestRunDistanceMeters > 0) && (
        <div className="flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-zinc-500">
          {profile.bestRunHexes > 0 && (
            <span>
              Best run:{" "}
              <span className="font-semibold text-zinc-900">
                {profile.bestRunHexes} blocks
              </span>
            </span>
          )}
          {profile.bestRunDistanceMeters > 0 && (
            <span>
              Longest:{" "}
              <span className="font-semibold text-zinc-900">{bestKm}</span>
            </span>
          )}
        </div>
      )}

      <Link
        href="/"
        className="mt-4 self-center rounded-md bg-orange-500 px-6 py-3 text-sm font-semibold text-white hover:bg-orange-600"
      >
        Play MiniKlaim
      </Link>
    </main>
  );
}

function BigStat({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex flex-col items-center">
      <span className="text-3xl font-bold text-zinc-900">{value}</span>
      <span className="text-xs text-zinc-500">{label}</span>
    </div>
  );
}
