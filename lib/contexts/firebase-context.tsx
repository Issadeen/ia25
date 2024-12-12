'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
import { auth, getFirebaseApp } from '../firebase'
import type { Auth } from 'firebase/auth'

interface FirebaseContextType {
  isInitialized: boolean
  auth: Auth | null
  error: Error | null
}

const FirebaseContext = createContext<FirebaseContextType>({
  isInitialized: false,
  auth: null,
  error: null
})

export function FirebaseProvider({ children }: { children: ReactNode }) {
  const [isInitialized, setIsInitialized] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  useEffect(() => {
    try {
      const app = getFirebaseApp()
      if (!app) {
        throw new Error('Firebase app initialization failed')
      }
      
      if (auth) {
        console.log('Firebase initialized successfully')
        setIsInitialized(true)
      }
    } catch (err) {
      console.error('Firebase context initialization error:', err)
      setError(err instanceof Error ? err : new Error('Firebase initialization failed'))
    }
  }, [])

  return (
    <FirebaseContext.Provider value={{ isInitialized, auth, error }}>
      {children}
    </FirebaseContext.Provider>
  )
}

export const useFirebase = () => {
  const context = useContext(FirebaseContext)
  if (context === undefined) {
    throw new Error('useFirebase must be used within a FirebaseProvider')
  }
  return context
}