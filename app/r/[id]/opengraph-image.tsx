import { ImageResponse } from "next/og";
import { serverT } from "@/lib/i18nServer";
import { isMoveMode, moveModeLabelKey } from "@/lib/runs/moveMode";
import {
  distanceLabel,
  durationLabel,
  fetchRunCard,
  placeLabel,
  speedLabel,
  type RunCard,
} from "@/lib/share/runCard";
import { runShape } from "@/lib/share/runShape";

export const alt = "A MiniKlaim run";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

const ORANGE = "#FF6B35";
const INK = "#0D1017";
const PANEL = { width: 540, height: 502, padding: 56 };

/**
 * The picture a shared run shows on X, Facebook and in chats.
 *
 * It is drawn the way the game looks: the blocks the run captured lit up in
 * orange on a dark board of empty blocks, with a dot where it started and
 * one where it ended, and the numbers beside it. A shared run used to be a
 * line of text ("0 m route"), then a white line on a flat orange card; this
 * is meant to be something a player wants to post.
 *
 * The board has no streets and no coordinates: it shows what the run looked
 * like, not where the player lives.
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
      distance: t("r.stat.distance"),
      time: t("r.stat.time"),
      speed: t("r.stat.speed"),
      mode: isMoveMode(card.moveMode) ? t(moveModeLabelKey(card.moveMode)) : "",
      tagline: t("r.card.tagline"),
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
        background: INK,
        color: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        fontFamily: "sans-serif",
        fontSize: 72,
      }}
    >
      {label}
    </div>
  );
}

export type CardLabels = {
  player: string;
  blocks: string;
  place: string;
  distance: string;
  time: string;
  speed: string;
  mode: string;
  tagline: string;
};

/** A hexagon, the game's block, as a small mark. */
function Hex({ size: s, color }: { size: number; color: string }) {
  return (
    <div
      style={{
        width: s,
        height: s * 1.14,
        background: color,
        clipPath: "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
      }}
    />
  );
}

function Stat({ value, label }: { value: string; label: string }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", marginRight: 30 }}>
      <div style={{ display: "flex", fontSize: 34, color: "white", lineHeight: 1.1 }}>
        {value}
      </div>
      <div
        style={{
          display: "flex",
          fontSize: 16,
          letterSpacing: 3,
          textTransform: "uppercase",
          color: "rgba(255,255,255,0.5)",
          marginTop: 6,
        }}
      >
        {label}
      </div>
    </div>
  );
}

/** Exported so the renderer itself is covered by a test. */
export function runCard(card: RunCard, labels: CardLabels) {
  const shape = runShape(card.h3Ids, PANEL);
  const moved = card.distanceMeters > 0;
  const speed = speedLabel(card);
  // The big number, sized to how many digits it has.
  const count = card.hexesClaimed.toLocaleString("en-US");
  const countSize = count.length <= 3 ? 176 : count.length <= 5 ? 150 : 118;
  // Thin routes get a wider line; big blocks need none.
  const line = shape ? Math.max(0, Math.min(7, 9 - shape.cellPx)) : 0;
  const dot = shape ? Math.max(7, Math.min(11, shape.cellPx * 0.28)) : 0;

  return (
    <div
      style={{
        width: "100%",
        height: "100%",
        background: INK,
        backgroundImage:
          "radial-gradient(circle at 78% 50%, rgba(255,107,53,0.20) 0%, rgba(255,107,53,0.05) 38%, rgba(13,16,23,0) 62%)",
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
          justifyContent: "space-between",
          height: "100%",
          width: shape ? 500 : 1072,
        }}
      >
        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex", alignItems: "center" }}>
            <Hex size={26} color={ORANGE} />
            <div style={{ display: "flex", fontSize: 30, marginLeft: 12, letterSpacing: 0.5 }}>
              MiniKlaim
            </div>
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 40,
              color: "rgba(255,255,255,0.78)",
              marginTop: 26,
            }}
          >
            {card.username ? `@${card.username}` : labels.player}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div
            style={{
              display: "flex",
              fontSize: countSize,
              lineHeight: 0.95,
              letterSpacing: -2,
              color: "white",
              // The only font next/og ships is a regular weight; a stroke in
              // the text's own color is what makes the number heavy.
              WebkitTextStroke: "4px white",
            }}
          >
            {count}
          </div>
          <div
            style={{
              display: "flex",
              fontSize: 28,
              letterSpacing: 5,
              textTransform: "uppercase",
              color: ORANGE,
              marginTop: 10,
              WebkitTextStroke: `1px ${ORANGE}`,
            }}
          >
            {labels.blocks}
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column" }}>
          <div style={{ display: "flex" }}>
            {moved ? <Stat value={distanceLabel(card.distanceMeters)} label={labels.distance} /> : null}
            <Stat value={durationLabel(card.durationSec)} label={labels.time} />
            {speed ? <Stat value={speed} label={labels.speed} /> : null}
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              fontSize: 24,
              color: "rgba(255,255,255,0.62)",
              marginTop: 22,
            }}
          >
            {[labels.place, labels.mode].filter(Boolean).join("  ·  ") || labels.tagline}
          </div>
        </div>
      </div>

      {shape ? (
        <div
          style={{
            display: "flex",
            width: PANEL.width,
            height: PANEL.height,
            position: "relative",
            borderRadius: 36,
            overflow: "hidden",
            background: "rgba(255,255,255,0.035)",
            border: "1px solid rgba(255,255,255,0.10)",
          }}
        >
          <svg
            width={PANEL.width}
            height={PANEL.height}
            viewBox={`0 0 ${PANEL.width} ${PANEL.height}`}
          >
            {/* The empty blocks around the run. */}
            {shape.grid ? (
              <path
                d={shape.grid}
                fill="rgba(255,255,255,0.025)"
                stroke="rgba(255,255,255,0.13)"
                strokeWidth={1}
              />
            ) : null}
            {/* Three wide, faint strokes under the blocks read as a glow. */}
            <path d={shape.cells} fill="none" stroke={ORANGE} strokeOpacity={0.1} strokeWidth={line + 34} strokeLinejoin="round" />
            <path d={shape.cells} fill="none" stroke={ORANGE} strokeOpacity={0.16} strokeWidth={line + 20} strokeLinejoin="round" />
            <path d={shape.cells} fill="none" stroke={ORANGE} strokeOpacity={0.28} strokeWidth={line + 10} strokeLinejoin="round" />
            <path
              d={shape.cells}
              fill={ORANGE}
              stroke={line > 0 ? ORANGE : INK}
              strokeWidth={line > 0 ? line : 1.5}
              strokeLinejoin="round"
            />
            {/* Start is a hollow ring, the end a solid dot. */}
            {shape.start ? (
              <circle cx={shape.start[0]} cy={shape.start[1]} r={dot} fill={INK} stroke="white" strokeWidth={3} />
            ) : null}
            {shape.end ? (
              <circle cx={shape.end[0]} cy={shape.end[1]} r={dot + 2} fill="white" stroke={INK} strokeWidth={3} />
            ) : null}
          </svg>
          <div
            style={{
              position: "absolute",
              right: 24,
              bottom: 18,
              display: "flex",
              fontSize: 20,
              letterSpacing: 1,
              color: "rgba(255,255,255,0.45)",
            }}
          >
            miniklaim.fun
          </div>
        </div>
      ) : null}
    </div>
  );
}
