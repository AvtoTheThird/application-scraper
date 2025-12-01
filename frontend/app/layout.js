import "./globals.css";

export const metadata = {
  title: "CS:GO Sticker Investment Tracker",
  description:
    "Track CS:GO sticker applications and find the best investment opportunities",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body className="bg-cs-darker text-white min-h-screen">{children}</body>
    </html>
  );
}
