import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Spendwise · Expense Tracker",
    short_name: "Spendwise",
    description: "Track your spending, income, budgets and dues.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#14151c",
    theme_color: "#14151c",
    categories: ["finance", "productivity"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Add expense", url: "/expenses/new", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
      { name: "Dues", url: "/dues", icons: [{ src: "/icon-192.png", sizes: "192x192" }] },
    ],
  };
}
