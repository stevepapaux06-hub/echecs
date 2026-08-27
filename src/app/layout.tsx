import type { Metadata } from "next";
import "./globals.css";

const deploymentHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const metadataBase = new URL(deploymentHost ? `https://${deploymentHost}` : "http://localhost:3000");

export const metadata: Metadata = {
  metadataBase,
  title: "ChessPath — Ton entraînement d’échecs personnalisé",
  description:
    "Analyse tes parties, identifie tes faiblesses récurrentes et entraîne-toi sur les positions qui comptent vraiment.",
  openGraph: {
    title: "ChessPath",
    description: "Ton jeu. Tes faiblesses. Ton entraînement.",
    images: [{ url: "/og.png", width: 1200, height: 630, alt: "ChessPath" }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "ChessPath",
    description: "Ton jeu. Tes faiblesses. Ton entraînement.",
    images: ["/og.png"],
  },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="fr">
      <body>{children}</body>
    </html>
  );
}
