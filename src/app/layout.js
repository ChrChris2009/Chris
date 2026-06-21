import "./globals.css";

export const metadata = {
  title: "VibeNet Premium Chat",
  description: "L'évolution ultime de la messagerie en temps réel",
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body className="antialiased select-none">{children}</body>
    </html>
  );
}

