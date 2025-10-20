'use client'

import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useMemo } from "react"
import { ArrowLeft, Phone, User, Truck, Calendar, Copy, CheckCheck, Loader2, AlertCircle } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card } from "@/components/ui/card"
import { database } from "@/lib/firebase"
import { ref, onValue } from "firebase/database"
import { toast } from "@/components/ui/use-toast"
import { ThemeToggle } from "@/components/ui/molecules/theme-toggle"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { motion } from 'framer-motion'
import { cn } from "@/lib/utils"
import { useProfileImage } from '@/hooks/useProfileImage'

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

// Custom hook for debounced search
function useDebounce<T>(value: T, delay: number): T {
  const [debouncedValue, setDebouncedValue] = useState<T>(value)

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value)
    }, delay)

    return () => {
      clearTimeout(handler)
    }
  }, [value, delay])

  return debouncedValue
}

export default function DriversPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [drivers, setDrivers] = useState<DriverInfo[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [mounted, setMounted] = useState(false)
  const [copiedItem, setCopiedItem] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [displayLimit, setDisplayLimit] = useState(20) // Show 20 initially
  const profilePicUrl = useProfileImage()

  // Use debounced search term to improve performance
  const debouncedSearchTerm = useDebounce(searchTerm, 300)

  // Add mounting effect
  useEffect(() => {
    setMounted(true)
  }, [])

  // Reset display limit when search changes
  useEffect(() => {
    setDisplayLimit(20)
  }, [debouncedSearchTerm])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    let isMounted = true
    setIsLoading(true)
    setError(null)
    
    const driversRef = ref(database, 'drivers')
    
    // Use onValue with once: true equivalent by using get instead for initial load
    const unsubscribe = onValue(driversRef, (snapshot) => {
      if (!isMounted) return
      
      try {
        if (snapshot.exists()) {
          const data = snapshot.val()
          
          // Handle different data structures with optimized processing
          let driversArray: DriverInfo[] = []
          
          if (Array.isArray(data)) {
            driversArray = data.filter(Boolean)
          } else if (typeof data === 'object') {
            // Pre-filter and process data more efficiently
            driversArray = Object.values(data)
              .filter((item): item is DriverInfo => {
                return Boolean(item) && 
                       item !== null &&
                       typeof item === 'object' && 
                       'phoneNumber' in item
              })
          }
          
          // Sort once at data load to avoid sorting on every search
          driversArray.sort((a, b) => (a.name || '').localeCompare(b.name || ''))
          
          setDrivers(driversArray)
        } else {
          setDrivers([])
        }
      } catch (err) {
        console.error('Error processing drivers data:', err)
        if (isMounted) {
          setError('Failed to load drivers data')
          toast({
            title: "Error",
            description: "Failed to load drivers data. Please refresh the page.",
            variant: "destructive",
          })
        }
      } finally {
        if (isMounted) {
          setIsLoading(false)
        }
      }
    }, (error) => {
      console.error('Firebase error:', error)
      if (isMounted) {
        setError('Failed to connect to database')
        setIsLoading(false)
        toast({
          title: "Connection Error",
          description: "Failed to connect to the database. Please check your connection.",
          variant: "destructive",
        })
      }
    })

    return () => {
      isMounted = false
      unsubscribe()
    }
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



  // Optimized filtered drivers with improved search logic
  const filteredDrivers = useMemo(() => {
    if (!debouncedSearchTerm.trim()) {
      return drivers
    }

    const searchTermLower = debouncedSearchTerm.toLowerCase().trim()
    
    // Use a more efficient filter with early returns
    return drivers.filter(driver => {
      // Quick null/undefined checks
      if (!driver) return false
      
      // Search in name (most common search)
      const name = driver.name?.toLowerCase()
      if (name && name.includes(searchTermLower)) {
        return true
      }
      
      // Search in phone number (exact match for numbers)
      const phoneNumber = driver.phoneNumber?.toString()
      if (phoneNumber && phoneNumber.includes(debouncedSearchTerm)) {
        return true
      }
      
      // Search in truck numbers (check if trucks exist first)
      if (Array.isArray(driver.trucks) && driver.trucks.length > 0) {
        return driver.trucks.some(truck => 
          truck && truck.toLowerCase().includes(searchTermLower)
        )
      }
      
      return false
    })
  }, [drivers, debouncedSearchTerm])

  // Paginated drivers for better performance
  const displayedDrivers = useMemo(() => {
    return filteredDrivers.slice(0, displayLimit)
  }, [filteredDrivers, displayLimit])

  const hasMore = filteredDrivers.length > displayLimit

  const loadMore = () => {
    setDisplayLimit(prev => prev + 20)
  }

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
                  <AvatarImage src={profilePicUrl || ''} alt="Profile" />
                  <AvatarFallback className="text-xs">
                    {session?.user?.name?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-28 sm:pt-24 pb-6 sm:pb-8">
        <div className="space-y-6">
            <div className="relative max-w-xl w-full mx-auto">
              <Input
                placeholder="Search by name, phone number, or truck..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full"
                disabled={isLoading}
              />
              {isLoading && (
                <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-muted-foreground" />
              )}
            </div>

            {/* Error display */}
            {error && (
              <Card className="p-6 border-destructive/20 bg-destructive/5">
                <div className="flex items-center gap-3 text-destructive">
                  <AlertCircle className="h-5 w-5" />
                  <div>
                    <h3 className="font-medium">Unable to load drivers</h3>
                    <p className="text-sm opacity-90">{error}</p>
                  </div>
                </div>
              </Card>
            )}

          {isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {[...Array(6)].map((_, i) => (
                <Card key={i} className="p-4 animate-pulse">
                  <div className="space-y-3">
                    <div className="flex items-center space-x-3">
                      <div className="h-8 w-8 rounded-full bg-muted" />
                      <div className="h-4 w-24 bg-muted rounded" />
                    </div>
                    <div className="h-10 bg-muted rounded" />
                    <div className="space-y-2">
                      <div className="h-4 w-32 bg-muted rounded" />
                      <div className="grid grid-cols-2 gap-2">
                        <div className="h-8 bg-muted rounded" />
                        <div className="h-8 bg-muted rounded" />
                      </div>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          ) : !error && drivers.length === 0 ? (
            <Card className="p-8 text-center">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <User className="h-12 w-12" />
                <div>
                  <h3 className="font-medium text-foreground">No drivers found</h3>
                  <p className="text-sm">No driver data is available in the system.</p>
                  <p className="text-xs mt-2 opacity-75">
                    If this seems incorrect, check your database connection or contact support.
                  </p>
                </div>
              </div>
            </Card>
          ) : filteredDrivers.length === 0 && debouncedSearchTerm ? (
            <Card className="p-8 text-center">
              <div className="flex flex-col items-center gap-3 text-muted-foreground">
                <User className="h-12 w-12" />
                <div>
                  <h3 className="font-medium text-foreground">No results found</h3>
                  <p className="text-sm">No drivers match your search for "{debouncedSearchTerm}"</p>
                  <p className="text-xs mt-2 opacity-75">
                    Try searching with different terms or check your spelling.
                  </p>
                </div>
              </div>
            </Card>
          ) : (
            <div className="space-y-4">
              {/* Results counter */}
              {!isLoading && !error && drivers.length > 0 && (
                <div className="text-center">
                  <p className="text-sm text-muted-foreground">
                    {debouncedSearchTerm ? (
                      <>
                        Showing {Math.min(displayLimit, filteredDrivers.length)} of {filteredDrivers.length} drivers
                        {debouncedSearchTerm && (
                          <span className="ml-1">
                            matching "{debouncedSearchTerm}"
                          </span>
                        )}
                      </>
                    ) : (
                      <>Showing {Math.min(displayLimit, drivers.length)} of {drivers.length} drivers</>
                    )}
                  </p>
                </div>
              )}
              
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {displayedDrivers.map((driver, index) => (
                <motion.div
                  key={`${driver.phoneNumber}-${driver.name}`}
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
                          {driver.name || 'Unknown Driver'}
                        </span>
                      </div>
                      
                      <div className="flex items-center space-x-3 bg-muted/50 p-2 rounded-md">
                        <Phone className="h-4 w-4 text-emerald-600" />
                        <a 
                          href={`tel:${driver.phoneNumber}`}
                          className="text-blue-600 hover:underline"
                        >
                          {driver.phoneNumber || 'No phone number'}
                        </a>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center space-x-3">
                            <Truck className="h-4 w-4 text-emerald-600" />
                            <span className="text-sm font-medium">Assigned Trucks</span>
                          </div>
                        </div>
                        {Array.isArray(driver.trucks) && driver.trucks.length > 0 ? (
                          <div className="grid grid-cols-2 gap-2">
                            {driver.trucks.map((truck, truckIndex) => (
                              <div
                                key={`${truck}-${truckIndex}`}
                                className="flex items-center justify-between p-2 bg-gradient-to-r from-emerald-50 to-blue-50 dark:from-emerald-950/50 dark:to-blue-950/50 rounded-md border group cursor-pointer hover:shadow-sm transition-all"
                                onClick={() => handleCopy(driver, truck)}
                              >
                                <span className="text-sm truncate flex-1">
                                  {truck || 'Unknown'}
                                </span>
                                {copiedItem === `${truck}-${driver.phoneNumber}` ? (
                                  <CheckCheck className="h-3 w-3 text-green-500 shrink-0" />
                                ) : (
                                  <Copy className="h-3 w-3 opacity-50 group-hover:opacity-100 transition-opacity shrink-0" />
                                )}
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-sm text-muted-foreground italic">
                            No trucks assigned
                          </div>
                        )}
                      </div>

                      <div className="flex items-center space-x-3 text-sm text-muted-foreground border-t pt-2">
                        <Calendar className="h-4 w-4" />
                        <span>
                          Last updated: {
                            driver.lastUpdated 
                              ? new Date(driver.lastUpdated).toLocaleDateString()
                              : 'Unknown'
                          }
                        </span>
                      </div>
                    </div>
                  </Card>
                </motion.div>
              ))}
            </div>
            
            {/* Load More Button */}
            {hasMore && !isLoading && (
              <div className="flex justify-center pt-6">
                <Button
                  onClick={loadMore}
                  variant="outline"
                  className="min-w-[200px]"
                >
                  Load More ({filteredDrivers.length - displayLimit} remaining)
                </Button>
              </div>
            )}
            </div>
          )}
        </div>
      </main>
    </div>
  )
}
