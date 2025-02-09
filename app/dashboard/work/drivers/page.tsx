'use client'

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState } from "react"
import { ArrowLeft, Phone, User, Truck, Calendar, Copy, CheckCheck } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { database } from "@/lib/firebase"
import { ref, onValue } from "firebase/database"
import { toast } from "@/components/ui/use-toast"
import { ThemeToggle } from "@/components/ui/molecules/theme-toggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { motion } from 'framer-motion'
import { storage } from "@/lib/firebase"
import { ref as storageRef, getDownloadURL } from "firebase/storage"
import { cn } from "@/lib/utils"

interface DriverInfo {
  phoneNumber: string;
  name: string;
  trucks: string[];
  lastUpdated: string;
}

// Add animation variants
const cardVariants = {
  hidden: { opacity: 0, y: 20 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: {
      delay: i * 0.1,
      duration: 0.3,
    },
  }),
}

export default function DriversPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [drivers, setDrivers] = useState<DriverInfo[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [mounted, setMounted] = useState(false)
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
  const [copiedItem, setCopiedItem] = useState<string | null>(null)

  // Add mounting effect
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

  useEffect(() => {
    const driversRef = ref(database, 'drivers')
    const unsubscribe = onValue(driversRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = Object.values(snapshot.val()) as DriverInfo[]
        setDrivers(data)
      }
    })

    return () => unsubscribe()
  }, [])

  // Update handleCopy to always copy both truck and phone
  const handleCopy = async (driver: DriverInfo, truck: string) => {
    try {
      const textToCopy = `${truck} - ${driver.phoneNumber}`;
      await navigator.clipboard.writeText(textToCopy);
      setCopiedItem(`${truck}-${driver.phoneNumber}`);
      toast({
        title: "Copied!",
        description: `Truck: ${truck}\nPhone: ${driver.phoneNumber}`,
        duration: 2000,
      });
      setTimeout(() => setCopiedItem(null), 2000);
    } catch (err) {
      toast({
        title: "Error",
        description: "Failed to copy to clipboard",
        variant: "destructive",
      });
    }
  };

  const filteredDrivers = drivers.filter(driver => 
    driver.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    driver.phoneNumber.includes(searchTerm) ||
    driver.trucks.some(truck => truck.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  if (!mounted) return null

  return (
    <div className="min-h-screen">
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-2 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push('/dashboard/work/orders')}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-sm font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent truncate max-w-[150px] sm:max-w-none sm:text-base">
                  Driver Directory
                </h1>
              </div>

              <div className="flex items-center gap-2">
                <ThemeToggle />
                <Avatar className="h-8 w-8 ring-1 ring-pink-500/50">
                  <AvatarImage src={session?.user?.image || lastUploadedImage || ''} alt="Profile" />
                  <AvatarFallback className="text-xs">
                    {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-28 sm:pt-24 pb-6 sm:pb-8">
        <div className="space-y-6">
          <Input
            placeholder="Search by name, phone number, or truck..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="max-w-xl w-full mx-auto"
          />

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {filteredDrivers.map((driver, index) => (
              <motion.div
                key={driver.phoneNumber}
                variants={cardVariants}
                initial="hidden"
                animate="visible"
                custom={index}
              >
                <Card className="p-4 hover:shadow-md transition-shadow bg-gradient-to-br from-background to-muted">
                  <div className="flex flex-col space-y-3">
                    <div className="flex items-center space-x-3">
                      <div className="h-8 w-8 rounded-full bg-gradient-to-br from-emerald-500 to-blue-500 flex items-center justify-center">
                        <User className="h-4 w-4 text-white" />
                      </div>
                      <span className="font-medium bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
                        {driver.name}
                      </span>
                    </div>
                    
                    <div className="flex items-center space-x-3 bg-muted/50 p-2 rounded-md">
                      <Phone className="h-4 w-4 text-emerald-600" />
                      <a 
                        href={`tel:${driver.phoneNumber}`}
                        className="text-blue-600 hover:underline"
                      >
                        {driver.phoneNumber}
                      </a>
                    </div>

                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center space-x-3">
                          <Truck className="h-4 w-4 text-emerald-600" />
                          <span className="text-sm font-medium">Assigned Trucks</span>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        {driver.trucks.map((truck) => (
                          <div
                            key={truck}
                            className="flex items-center justify-between p-2 bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950/50 dark:to-blue-950/50 rounded-md border group cursor-pointer hover:shadow-sm transition-all"
                            onClick={() => handleCopy(driver, truck)}
                          >
                            <span className="text-sm truncate flex-1">
                              {truck}
                            </span>
                            {copiedItem === `${truck}-${driver.phoneNumber}` ? (
                              <CheckCheck className="h-3 w-3 text-green-500 shrink-0" />
                            ) : (
                              <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity shrink-0" />
                            )}
                          </div>
                        ))}
                      </div>
                    </div>

                    <div className="flex items-center space-x-3 text-sm text-muted-foreground border-t pt-2">
                      <Calendar className="h-4 w-4" />
                      <span>Last updated: {new Date(driver.lastUpdated).toLocaleDateString()}</span>
                    </div>
                  </div>
                </Card>
              </motion.div>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
