import { ImageResponse } from "next/og";
import { headers } from "next/headers";
import { serverT } from "@/lib/i18nServer";

export const alt = "MiniKlaim player profile";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

type PublicProfile = {
  username: string;
  hexesOwned: number;
  totalRuns: number;
  streak: number;
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

/** The card itself, exported so a test can render it (see the .test file). */
export function notFoundCard(label: string) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#FF6B35",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        fontSize: 72,
        fontWeight: 800,
      }}
    >
      {label}
    </div>
  );
}

export default async function OgImage({
  params,
}: {
  // Next 15+ hands route params as a promise. Typed as a plain object and
  // read without awaiting, `params.username` was undefined, so every shared
  // profile link fetched /api/profile/undefined and previewed as "Player not
  // found" (and hammered the endpoint: 129 calls in 14 minutes on 27 Oct,
  // 57 of them rate-limited).
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const profile = await fetchProfile(username);
  const { t } = await serverT();

  if (!profile) {
    return new ImageResponse(notFoundCard(t("p.notFound")), { ...size });
  }

  return new ImageResponse(
    profileCard(profile, {
      blocks: t("p.stat.blocks"),
      runs: t("p.stat.runs"),
      streak:
        profile.streak === 1 ? t("p.stat.dayStreak") : t("p.stat.daysStreak"),
    }),
    { ...size },
  );
}

type CardLabels = { blocks: string; runs: string; streak: string };

/** Exported so the renderer itself is covered by a test. */
export function profileCard(profile: PublicProfile, labels: CardLabels) {
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#FF6B35",
        color: "white",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        padding: 80,
      }}
    >
      <div
        style={{
          fontSize: 40,
          fontWeight: 600,
          opacity: 0.85,
          marginBottom: 12,
        }}
      >
        MiniKlaim
      </div>
      <div
        style={{
          // Satori counts "@" and the name as two children and refuses a
          // plain div with more than one, so the display is explicit. The
          // card had never rendered before: the username was undefined, so
          // every preview took the not-found branch above.
          display: "flex",
          fontSize: 96,
          fontWeight: 800,
          letterSpacing: -2,
          lineHeight: 1,
          marginBottom: 40,
        }}
      >
        @{profile.username}
      </div>
      <div
        style={{
          display: "flex",
          gap: 80,
          marginTop: 16,
        }}
      >
        <Stat label={labels.blocks} value={profile.hexesOwned} />
        <Stat label={labels.runs} value={profile.totalRuns} />
        <Stat label={labels.streak} value={profile.streak} />
      </div>
      <div
        style={{
          marginTop: 56,
          fontSize: 28,
          opacity: 0.85,
          fontWeight: 400,
        }}
      >
        Walk, bike, or drive. Klaim it.
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
      }}
    >
      {/* A number child makes Satori reject the div ("more than one child
          node"), which answered 502 for every shared link. A formatted
          string also reads better: 29,064 instead of 29064. */}
      <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1 }}>
        {value.toLocaleString("en-US")}
      </div>
      <div style={{ fontSize: 28, opacity: 0.9, marginTop: 8 }}>{label}</div>
    </div>
  );
}
