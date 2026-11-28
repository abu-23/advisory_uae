import type { MetadataRoute } from "next";

/**
 * Lets phones "Add to Home Screen" and open the site like an app.
 * No offline mode and no push notifications: prices and quotes must always be live.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Advisr UAE",
    short_name: "Advisr",
    description: "Compare UAE business service companies.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#f4f6f8",
    theme_color: "#12213a",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
