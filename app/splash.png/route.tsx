import { ImageResponse } from "next/og";

export const runtime = "nodejs";

const size = { width: 200, height: 200 };

export async function GET() {
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
        fontWeight: 800,
        fontSize: 140,
        letterSpacing: -4,
      }}
    >
      MK
    </div>,
    {
      ...size,
      headers: {
        "content-type": "image/png",
        "cache-control": "public, max-age=86400, immutable",
      },
    },
  );
}
