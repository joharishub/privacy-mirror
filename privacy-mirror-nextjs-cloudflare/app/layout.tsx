export const metadata = { title: 'Privacy Mirror', description: 'See what a website can learn about you the moment you land on it.' };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body style={{ fontFamily: 'Inter, system-ui, Arial, sans-serif', background: '#f8fafc', color: '#0f172a' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', padding: 24 }}>{children}</div>
      </body>
    </html>
  );
}
