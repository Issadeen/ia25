'use client'

import { useEffect, useState } from 'react'
import { app, getFirebaseApp } from '@/lib/firebase'
import { Icons } from "@/components/ui/icons"

export function FirebaseProvider({ children }: { children: React.ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false)

  useEffect(() => {
    try {
      const app = getFirebaseApp()
      if (app) {
        setIsInitialized(true)
      }
    } catch (error) {
      console.error('Firebase initialization error:', error)
    }
  }, [])

  if (!isInitialized) {
    return (
      <div className="h-screen w-screen flex items-center justify-center">
        <Icons.spinner className="h-8 w-8 animate-spin" />
      </div>
    )
  }

  return children
}