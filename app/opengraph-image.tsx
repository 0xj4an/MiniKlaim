import { ImageResponse } from "next/og";

export const alt = "MiniKlaim. Walk, bike, or drive. Klaim the blocks.";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

export default function OpengraphImage() {
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
          fontSize: 160,
          fontWeight: 800,
          letterSpacing: -4,
          lineHeight: 1,
          marginBottom: 24,
        }}
      >
        MiniKlaim
      </div>
      <div style={{ display: "flex", gap: 18, marginTop: 8 }}>
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            style={{
              width: 42,
              height: 48,
              background: "white",
              clipPath:
                "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
            }}
          />
        ))}
      </div>
      <div style={{ fontSize: 48, fontWeight: 600, marginTop: 36 }}>
        Walk, bike, or drive.
      </div>
      <div
        style={{
          marginTop: 16,
          fontSize: 28,
          opacity: 0.85,
          fontWeight: 400,
        }}
      >
        The blocks you cross are yours.
      </div>
    </div>,
    { ...size },
  );
}
