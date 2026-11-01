import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "A to F — Every seat gets the view",
    short_name: "A to F",
    description: "Which side of the plane has the view? For JetBlue flyers. Independent student project.",
    start_url: "/",
    display: "standalone",
    background_color: "#211B1D",
    theme_color: "#211B1D",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
