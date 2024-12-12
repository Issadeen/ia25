import { Inter } from 'next/font/google'
import "./globals.css"
import { Providers } from '@/components/providers/auth-provider'
import { FirebaseProvider } from '@/lib/contexts/firebase-context'
import { ThemeProvider } from '@/components/theme-provider'

const inter = Inter({ subsets: ["latin"] })

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head />
      <body>
        <Providers>
          {children}
        </Providers>
      </body>
    </html>
  )
}