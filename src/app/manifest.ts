import { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Zolvo - Local Services Marketplace",
    short_name: "Zolvo",
    description: "Find and book trusted local professionals (electricians and plumbers) in Bhilwara.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#14826f",
    orientation: "portrait",
    categories: ["utilities", "productivity"],
    icons: [
      {
        src: "/favicon.ico",
        sizes: "any",
        type: "image/x-icon",
      },
      {
        src: "/icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/apple-icon.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
