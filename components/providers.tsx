'use client'

import { ThemeProvider } from "@/components/theme-provider"
import { SessionProvider } from "next-auth/react"
import { Toaster } from "@/components/ui/toaster"
import { ToastProvider } from "@/components/ui/toast-notification"
import { ToastNotificationInitializer } from "@/components/ToastNotificationInitializer"

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
        <ToastProvider>
          <ToastNotificationInitializer />
          {children}
          <Toaster />
        </ToastProvider>
      </ThemeProvider>
    </SessionProvider>
  )
}