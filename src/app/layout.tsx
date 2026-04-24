import './globals.css'
import type { Metadata } from 'next'
import { Providers } from '@/components/Providers'

export const metadata: Metadata = {
  title: 'DRAFTMAN5.0',
  description: 'Tournament platform for Day of Defeat 1.3',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <script dangerouslySetInnerHTML={{ __html: `
          (function() {
            try {
              var t = localStorage.getItem('draftman-theme');
              if (t === 'slate') document.documentElement.setAttribute('data-theme', 'slate');
            } catch(e) {}
          })();
        `}} />
      </head>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
