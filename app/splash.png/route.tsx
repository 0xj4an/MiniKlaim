import { ImageResponse } from "next/og";

export const runtime = "nodejs";

const size = { width: 200, height: 200 };

export async function GET() {
  return new ImageResponse(
    <div
      style={{
        width: "100%",
        height: "100%",
        background: "white",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        style={{
          width: "100%",
          height: "100%",
          background: "#FF6B35",
          clipPath:
            "polygon(50% 0%, 100% 25%, 100% 75%, 50% 100%, 0% 75%, 0% 25%)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "white",
          fontWeight: 800,
          fontSize: 90,
          letterSpacing: -4,
        }}
      >
        MK
      </div>
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
