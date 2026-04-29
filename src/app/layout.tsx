import type { Metadata } from 'next'
import './globals.css'
import { Providers } from '@/components/Providers'

export const metadata: Metadata = {
  title: 'DRAFT MAN 5.0',
  description: 'Draft management for the Day of Defeat community.',
  icons: {
    icon: '/favicon.ico',
    apple: '/icon.png',
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
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
