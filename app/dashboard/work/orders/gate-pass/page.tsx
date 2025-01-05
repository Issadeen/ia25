'use client'

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useState, useEffect } from "react"
import { ArrowLeft } from 'lucide-react'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { ThemeToggle } from "@/components/ui/molecules/theme-toggle"
import { GatePassForm } from "@/components/ui/molecules/GatePassForm"
import { ThemeProvider } from '@/components/theme-provider'
import { Toaster } from "@/components/ui/toaster"
import { storage } from "@/lib/firebase"
import { ref as storageRef, getDownloadURL } from "firebase/storage"

export default function GatePassPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [mounted, setMounted] = useState(false)
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    const fetchImageUrl = async () => {
      if (!session?.user?.email || session?.user?.image) return
  
      try {
        const filename = `${session.user.email}.jpg`
        const imageRef = storageRef(storage, `profile-pics/${filename}`)
        const url = await getDownloadURL(imageRef)
        setLastUploadedImage(url)
      } catch (error) {
        console.log('Profile image not found:', error)
      }
    }
  
    fetchImageUrl()
  }, [session?.user])

  if (!mounted) {
    return null
  }

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
            {/* Left side */} 
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/dashboard/work/orders')}
                className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
                Gate Pass Generator
              </h1>
            </div>
            {/* Right side */} 
            <div className="flex items-center gap-4">
              <ThemeToggle />
              <Avatar 
                className="h-8 w-8 ring-2 ring-pink-500/50 ring-offset-2 ring-offset-background shadow-lg shadow-pink-500/10 transition-shadow hover:ring-pink-500/75"
              >
                <AvatarImage 
                  src={session?.user?.image || lastUploadedImage || ''} 
                  alt="Profile"
                />
                <AvatarFallback className="bg-pink-100 text-pink-700">
                  {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </header>

      <div className="container mx-auto py-10 pt-24">
        <GatePassForm />
        <Toaster />
      </div>
    </ThemeProvider>
  )
}

