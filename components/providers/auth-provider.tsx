'use client'

import React, { createContext, useContext, useEffect, useState } from 'react'
import { SessionProvider } from 'next-auth/react'
import { useSession, signOut } from 'next-auth/react'
import { useRouter, usePathname } from 'next/navigation'
import { useInactivityTimer } from '@/hooks/useInactivityTimer'
import { AlertDialog, AlertDialogContent, AlertDialogHeader, 
         AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel } from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { AUTH_CONSTANTS } from '@/lib/constants'
import { FirebaseProvider } from '@/components/providers/firebase-provider'
import { Icons } from "@/components/ui/icons"
import { getFirebaseAuth } from '@/lib/firebase' // Adjust the import path as necessary
import { signInWithCustomToken } from 'firebase/auth'
import { ThemeProvider } from "next-themes"
import { Toaster } from "@/components/ui/toaster"

interface AuthContextType {
  isAuthenticated: boolean
  isLoading: boolean
}

const AuthContext = createContext<AuthContextType>({
  isAuthenticated: false,
  isLoading: true
})

export const useAuth = () => useContext(AuthContext)

// Create a combined provider component
export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <FirebaseProvider>
        <AuthProvider>{children}</AuthProvider>
      </FirebaseProvider>
    </SessionProvider>
  )
}

// Add LoadingScreen component
function LoadingScreen() {
  return (
    <div className="h-screen w-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <Icons.spinner className="h-8 w-8 animate-spin" />
        <p className="text-muted-foreground">Loading...</p>
      </div>
    </div>
  )
}

interface AuthProviderProps {
  children: React.ReactNode;
}

const InactivityTimer: React.FC = () => {
  const router = useRouter()
  const [showModal, setShowModal] = React.useState(false)

  const handleTimeout = async () => {
    await signOut({ redirect: false })
    router.push('/login')
  }

  const { sessionExpiryWarning, resetInactivityTimer } = useInactivityTimer({
    timeout: 30 * 60 * 1000, // 30 minutes
    warningTime: 5 * 60 * 1000, // Show warning 5 minutes before
    onTimeout: handleTimeout,
  })

  React.useEffect(() => {
    const events = ['mousedown', 'keydown', 'scroll', 'mousemove', 'touchstart']
    
    const handleActivity = () => {
      resetInactivityTimer()
    }

    events.forEach(event => {
      window.addEventListener(event, handleActivity)
    })

    return () => {
      events.forEach(event => {
        window.removeEventListener(event, handleActivity)
      })
    }
  }, [resetInactivityTimer])

  return (
    <AlertDialog open={sessionExpiryWarning}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Session Expiring Soon</AlertDialogTitle>
          <AlertDialogDescription>
            Your session will expire in 5 minutes due to inactivity. Please click continue to stay logged in.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel onClick={resetInactivityTimer}>Continue Session</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

const AuthProvider: React.FC<AuthProviderProps> = ({ children }) => {
  return (
    <SessionProvider refetchInterval={0}>
      <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
        {children}
        <Toaster />
      </ThemeProvider>
    </SessionProvider>
  )
}

export default AuthProvider
