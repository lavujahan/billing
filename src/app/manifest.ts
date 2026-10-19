import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Business Assistant · வணிக உதவி",
    short_name: "Business",
    description: "Tamil-first billing, purchase, expense and collection assistant",
    start_url: "/",
    display: "standalone",
    background_color: "#F6F5F1",
    theme_color: "#0F6E66",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
