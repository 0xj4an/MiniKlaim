import { ImageResponse } from "next/og";

export const alt = "MiniKlaim: Run it. Klaim it.";
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
      <div style={{ fontSize: 56, fontWeight: 500, opacity: 0.92 }}>
        Run it. Klaim it.
      </div>
      <div
        style={{
          marginTop: 64,
          fontSize: 28,
          opacity: 0.85,
          fontWeight: 400,
        }}
      >
        Territory-capture running game on Celo
      </div>
    </div>,
    { ...size },
  );
}
