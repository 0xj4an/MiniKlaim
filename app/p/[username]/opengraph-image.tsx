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

export default async function OgImage({
  params,
}: {
  params: { username: string };
}) {
  const profile = await fetchProfile(params.username);
  const { t } = await serverT();

  if (!profile) {
    return new ImageResponse(
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
        {t("p.notFound")}
      </div>,
      { ...size },
    );
  }

  return new ImageResponse(
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
        <Stat label={t("p.stat.blocks")} value={profile.hexesOwned} />
        <Stat label={t("p.stat.runs")} value={profile.totalRuns} />
        <Stat
          label={
            profile.streak === 1 ? t("p.stat.dayStreak") : t("p.stat.daysStreak")
          }
          value={profile.streak}
        />
      </div>
      <div
        style={{
          marginTop: 56,
          fontSize: 28,
          opacity: 0.85,
          fontWeight: 400,
        }}
      >
        Run it. Klaim it.
      </div>
    </div>,
    { ...size },
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
      <div style={{ fontSize: 120, fontWeight: 800, lineHeight: 1 }}>
        {value}
      </div>
      <div style={{ fontSize: 28, opacity: 0.9, marginTop: 8 }}>{label}</div>
    </div>
  );
}
