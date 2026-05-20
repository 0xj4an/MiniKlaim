import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "MiniKlaim",
    short_name: "MiniKlaim",
    description: "Capture city blocks by running through them.",
    start_url: "/",
    display: "standalone",
    background_color: "#FF6B35",
    theme_color: "#FF6B35",
    orientation: "portrait",
    icons: [
      {
        src: "/icon1",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon2",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
