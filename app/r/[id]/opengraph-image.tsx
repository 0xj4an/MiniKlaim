import { ImageResponse } from "next/og";
import { serverT } from "@/lib/i18nServer";
import {
  fetchRunCard,
  placeLabel,
  statsLine,
  type RunCard,
} from "@/lib/share/runCard";
import { runShapePath } from "@/lib/share/runShape";

export const alt = "A MiniKlaim run";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const SHAPE = { width: 520, height: 470, padding: 16 };

/**
 * The picture a shared run shows on X, Facebook and in chats: the run's
 * blocks drawn as their outline, next to how many, how far and how long.
 *
 * A shared run used to be a line of text and the profile card. The text was
 * the only thing saying what happened, and for a short run it read as the
 * game not working ("0 m route"). The outline has no streets and no
 * coordinates: it shows what the run looked like, not where the player lives.
 */
export default async function OgImage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const card = await fetchRunCard(id);
  const { t, locale } = await serverT();
  if (!card) {
    return new ImageResponse(notFoundCard(t("r.notFound")), { ...size });
  }
  return new ImageResponse(
    runCard(card, {
      player: t("r.player"),
      blocks: card.hexesClaimed === 1 ? t("r.blocks.one") : t("r.blocks"),
      place: placeLabel(card.city, card.country, locale),
    }),
    {
      ...size,
      // A finished run does not change, so the picture can be kept.
      headers: { "Cache-Control": "public, max-age=3600, s-maxage=86400" },
    },
  );
}

/** Exported so a test can render it (Satori rejects layouts TypeScript allows). */
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

type CardLabels = { player: string; blocks: string; place: string };

/** Exported so the renderer itself is covered by a test. */
export function runCard(card: RunCard, labels: CardLabels) {
  const shape = runShapePath(card.h3Ids, SHAPE);
  const place = labels.place;
  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "#FF6B35",
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        fontFamily: "sans-serif",
        padding: 64,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          width: shape ? 500 : 1072,
        }}
      >
        <div style={{ display: "flex", fontSize: 36, fontWeight: 600, opacity: 0.85 }}>
          MiniKlaim
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 56,
            fontWeight: 800,
            letterSpacing: -1,
            marginTop: 12,
          }}
        >
          {card.username ? `@${card.username}` : labels.player}
        </div>
        <div
          style={{
            display: "flex",
            fontSize: 168,
            fontWeight: 800,
            lineHeight: 1,
            marginTop: 28,
          }}
        >
          {card.hexesClaimed.toLocaleString("en-US")}
        </div>
        <div style={{ display: "flex", fontSize: 40, fontWeight: 600, marginTop: 4 }}>
          {labels.blocks}
        </div>
        <div style={{ display: "flex", fontSize: 34, opacity: 0.9, marginTop: 28 }}>
          {statsLine(card)}
        </div>
        {place ? (
          <div style={{ display: "flex", fontSize: 30, opacity: 0.85, marginTop: 8 }}>
            {place}
          </div>
        ) : null}
      </div>
      {shape ? (
        <svg
          width={SHAPE.width}
          height={SHAPE.height}
          viewBox={`0 0 ${SHAPE.width} ${SHAPE.height}`}
        >
          {/* The white stroke is what makes a long, thin route readable:
              a 2 km street is drawn in blocks four pixels wide. */}
          <path
            d={shape}
            fill="white"
            stroke="white"
            strokeWidth={5}
            strokeLinejoin="round"
          />
        </svg>
      ) : null}
    </div>
  );
}
