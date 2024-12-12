import { initializeApp, getApps, getApp } from 'firebase/app'
import { getDatabase } from 'firebase/database'
import { getAuth } from 'firebase/auth'
import { getStorage } from 'firebase/storage'

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  databaseURL: process.env.NEXT_PUBLIC_FIREBASE_DATABASE_URL,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID
}

// Initialize Firebase
const getFirebaseApp = () => {
  try {
    if (getApps().length) {
      return getApp()
    }
    return initializeApp(firebaseConfig)
  } catch (error) {
    console.error('Firebase initialization error:', error)
    throw error
  }
}

const app = getFirebaseApp()
const auth = getAuth(app)
const database = getDatabase(app)
const storage = getStorage(app)

export { 
  app,
  auth,
  database,
  storage,
  getFirebaseApp,
  getAuth as getFirebaseAuth, // Export getAuth as getFirebaseAuth
  getStorage as getFirebaseStorage, // Export getStorage as getFirebaseStorage
  getDatabase as getFirebaseDatabase // Export getDatabase as getFirebaseDatabase
}