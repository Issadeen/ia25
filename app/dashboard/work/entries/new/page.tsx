'use client'

import React from 'react'
import { useState, useEffect } from 'react'
import { useSession } from "next-auth/react"
import { useRouter } from 'next/navigation'
import { useTheme } from "next-themes"
import { getDatabase, ref, push, query, orderByChild, equalTo, get, set } from 'firebase/database'
import { 
  ArrowLeft,
  Sun,
  Moon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "components/ui/avatar"
import { motion } from 'framer-motion'
import { auth, storage } from "lib/firebase"
import { getDownloadURL, ref as storageRef } from "firebase/storage"
import { useToast } from "components/ui/use-toast"

const AddEntriesPage: React.FC = () => {
  // State management
  const [tr800Number, setTr800Number] = useState('')
  const [tr800Quantity, setTr800Quantity] = useState('')
  const [product, setProduct] = useState('')
  const [destination, setDestination] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)

  // Hooks
  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()

  // Profile image handling
  useEffect(() => {
    const fetchImageUrl = async () => {
      const userEmail = session?.user?.email
      if (!userEmail || session?.user?.image) return

      try {
        const filename = `${userEmail}.jpg`
        const imageRef = storageRef(storage, `profile-pics/${filename}`)
        const url = await getDownloadURL(imageRef)
        setLastUploadedImage(url)
      } catch (error) {
        console.log('Profile image not found:', error)
      }
    }

    fetchImageUrl()
  }, [session?.user?.email, session?.user?.image])

  // Authentication check
  useEffect(() => {
    setMounted(true)
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  if (!mounted || status === "loading") return null

  // Form submission handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      // Validation
      if (!tr800Number.trim() || !tr800Quantity || !product.trim() || !destination.trim()) {
        toast({
          title: "Validation Error",
          description: "All fields are required",
          variant: "destructive"
        })
        setIsSaving(false)
        return
      }

      const db = getDatabase()
      
      // Check for duplicates using transaction
      const tr800Ref = ref(db, `tr800/${tr800Number.trim()}`)
      const snapshot = await get(tr800Ref)

      if (snapshot.exists()) {
        toast({
          title: "Duplicate Entry",
          description: "This TR830 number already exists",
          variant: "destructive"
        })
        setIsSaving(false)
        return
      }

      // Prepare entry data
      const entryData = {
        number: tr800Number.trim(),
        initialQuantity: parseFloat(tr800Quantity),
        remainingQuantity: parseFloat(tr800Quantity),
        product: product.trim().toLowerCase(),
        destination: destination.trim().toLowerCase(),
        product_destination: `${product.trim().toLowerCase()}_${destination.trim().toLowerCase()}`,
        timestamp: Date.now(),
        createdBy: session?.user?.email || 'unknown'
      }

      // Save to tr800
      await set(tr800Ref, entryData)

      // Save to allocations if destination is SSD
      if (destination.trim().toLowerCase() === 'ssd') {
        const allocationsRef = ref(db, `allocations/${tr800Number.trim()}`)
        await set(allocationsRef, entryData)
      }

      toast({
        title: "Success",
        description: "Entry saved successfully",
      })

      // Reset form
      setTr800Number('')
      setTr800Quantity('')
      setProduct('')
      setDestination('')

    } catch (error: any) {
      console.error('Save error:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to save entry",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  const avatarSrc = session?.user?.image || lastUploadedImage || ''

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 right-0 z-50 border-b bg-background/80 backdrop-blur-md">
        <div className="container mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/dashboard/work')}
              className="text-muted-foreground hover:text-foreground"
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold">Add Mother Entries (TR830)</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
              className="text-muted-foreground hover:text-foreground"
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Avatar>
              <AvatarImage src={avatarSrc} />
              <AvatarFallback>
                {session?.user?.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 pt-20 pb-8 md:pt-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <Card className="max-w-lg mx-auto">
            <CardHeader>
              <CardTitle>Add TR830 Entry</CardTitle>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">TR830 Number</label>
                    <Input
                      required
                      value={tr800Number}
                      onChange={(e) => setTr800Number(e.target.value)}
                      placeholder="Enter TR830 number"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Quantity</label>
                    <Input
                      required
                      type="number"
                      step="0.01"
                      value={tr800Quantity}
                      onChange={(e) => setTr800Quantity(e.target.value)}
                      placeholder="Enter quantity"
                    />
                  </div>
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Product</label>
                    <Input
                      required
                      value={product}
                      onChange={(e) => setProduct(e.target.value.toLowerCase())}
                      placeholder="Enter product name"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Destination</label>
                    <Input
                      required
                      value={destination}
                      onChange={(e) => setDestination(e.target.value.toLowerCase())}
                      placeholder="Enter destination"
                    />
                  </div>
                </div>

                <Button 
                  type="submit" 
                  className="w-full"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⏳</span> Saving...
                    </span>
                  ) : 'Add Entry'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </motion.div>
      </main>
    </div>
  )
}

export default AddEntriesPage