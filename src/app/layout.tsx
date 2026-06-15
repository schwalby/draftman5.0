import type { Metadata } from 'next'
import './globals.css'
import './reimagined.css'
import { Providers } from '@/components/Providers'
import { ReactiveCanvas } from '@/components/ReactiveCanvas'

export const metadata: Metadata = {
  metadataBase: new URL('https://draftman50-production.up.railway.app'),
  title: 'DRAFT MAN 5.0',
  description: 'Draft management for the Day of Defeat community.',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon.png',
  },
  openGraph: {
    title: 'DRAFT MAN 5.0',
    description: 'Draft management for the Day of Defeat community.',
    siteName: 'DRAFT MAN 5.0',
    images: [{ url: '/icon.png', width: 512, height: 512 }],
    type: 'website',
  },
  twitter: {
    card: 'summary',
    title: 'DRAFT MAN 5.0',
    description: 'Draft management for the Day of Defeat community.',
    images: ['/icon.png'],
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{
          __html: `
            (function() {
              try {
                var theme = localStorage.getItem('draftman-theme');
                if (theme === 'slate') {
                  document.documentElement.setAttribute('data-theme', 'slate');
                }
              } catch(e) {}
            })();
          `
        }} />
      </head>
      <body>
        <ReactiveCanvas />
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
