import type { Metadata } from 'next'
import './globals.css'

export const metadata: Metadata = {
  title: 'Recordings Viewer',
  description: 'Browse and play session recordings from R2 storage',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-950 text-zinc-100 antialiased">
        <div className="flex flex-col min-h-screen">
          <header className="border-b border-zinc-800 px-6 py-4">
            <h1 className="text-xl font-semibold">Recordings Viewer</h1>
          </header>
          <main className="flex-1">
            {children}
          </main>
        </div>
      </body>
    </html>
  )
}
