import type { Metadata } from 'next';
import './globals.css';
export const metadata: Metadata = {
  title: 'Adaptive Layout Lab — Multi-Surface Ad Resolver',
  description:
    'A typed, constraint-based layout engine that adapts one ad specification to real-world surfaces.',
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  );
}
