'use client'

import { useState, useEffect } from 'react'
import { getDatabase, ref, onValue } from 'firebase/database'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import { migrateExistingTrucks } from '@/lib/migrations/permit-migration'
import { useToast } from '@/components/ui/use-toast'
import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import { AvatarFallback } from '@/components/ui/avatar'
import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage'

interface PermitAllocation {
  truckNumber: string
  product: string
  owner: string
  permitEntryId: string
  permitNumber: string
  quantity: string
  allocatedAt: string
  createdAt: string
  used?: boolean
  usedAt?: string
}

export default function PermitsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const [permits, setPermits] = useState<{ [key: string]: PermitAllocation }>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [isMigrating, setIsMigrating] = useState(false)
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login')
      return
    }

    const db = getDatabase()
    const permitsRef = ref(db, 'permit_allocations')
    
    const unsubscribe = onValue(permitsRef, (snapshot) => {
      if (snapshot.exists()) {
        setPermits(snapshot.val())
      } else {
        setPermits({})
      }
    })

    return () => unsubscribe()
  }, [status, router])

  useEffect(() => {
    const fetchImageUrl = async () => {
      const userEmail = session?.user?.email
      if (!userEmail || session?.user?.image) return
  
      try {
        const storage = getStorage()
        const filename = `${userEmail}.jpg`
        const imageRef = storageRef(storage, `profile-pics/${filename}`)
        const url = await getDownloadURL(imageRef)
        setLastUploadedImage(url)
      } catch (error) {
        // Silently handle missing profile image
      }
    }
  
    fetchImageUrl()
  }, [session?.user?.email, session?.user?.image])

  const handleMigration = async () => {
    setIsMigrating(true)
    try {
      const result = await migrateExistingTrucks()
      if (result && result.success) {
        toast({
          title: 'Migration Successful',
          description: `Migrated ${result.migratedCount} trucks to the new permit system`,
        })
      } else {
        throw new Error(result?.error || 'Migration failed')
      }
    } catch (error) {
      toast({
        title: 'Migration Failed',
        description: error instanceof Error ? error.message : 'Unknown error occurred',
        variant: 'destructive'
      })
    } finally {
      setIsMigrating(false)
    }
  }

  const filteredPermits = Object.entries(permits)
    .filter(([_, permit]) => {
      if (!searchTerm) return true
      const searchLower = searchTerm.toLowerCase()
      return (
        permit.truckNumber.toLowerCase().includes(searchLower) ||
        permit.owner.toLowerCase().includes(searchLower) ||
        permit.permitNumber.toLowerCase().includes(searchLower)
      )
    })
    .sort((a, b) => new Date(b[1].allocatedAt).getTime() - new Date(a[1].allocatedAt).getTime())

  return (
    <div className="min-h-screen">
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-2 py-2">
            {/* Main header row */}
            <div className="flex items-center justify-between">
              {/* Left side - essential controls */}
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.push('/dashboard/work')}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-sm font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent truncate max-w-[150px] sm:max-w-none sm:text-base">
                  Permit Allocations
                </h1>
              </div>

              {/* Right side - actions */}
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleMigration}
                  disabled={isMigrating}
                  className="hidden sm:flex items-center"
                >
                  {isMigrating ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Migrate Existing Trucks
                </Button>

                <ThemeToggle />
                
                <div className="relative group">
                  <Avatar 
                    className="h-8 w-8 ring-1 ring-pink-500/50"
                    onClick={() => router.push('/dashboard')}
                  >
                    <AvatarImage 
                      src={session?.user?.image || lastUploadedImage || ''} 
                      alt={session?.user?.name || 'User Profile'}
                      className="h-8 w-8"
                    />
                    <AvatarFallback className="text-xs">
                      {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                    </AvatarFallback>
                  </Avatar>
                </div>
              </div>
            </div>

            {/* Mobile row */}
            <div className="flex mt-2 sm:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={handleMigration}
                disabled={isMigrating}
                className="w-full"
              >
                {isMigrating ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Migrate Existing Trucks
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-28 sm:pt-24 pb-6 sm:pb-8">
        {/* Search Card */}
        <Card className="mb-6 border-emerald-500/20">
          <CardHeader>
            <CardTitle className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Search & Filter
            </CardTitle>
          </CardHeader>
          <CardContent>
            <Input
              placeholder="Search by truck number, owner, or permit number..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="max-w-xl"
            />
          </CardContent>
        </Card>

        {/* Results Card */}
        <Card className="border-0 shadow-lg bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-emerald-500/20">
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Truck Number</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Owner</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Product</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Permit Number</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Quantity</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Allocated At</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredPermits.map(([id, permit]) => (
                    <TableRow 
                      key={id}
                      className="border-b border-emerald-500/10 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20"
                    >
                      <TableCell>{permit.truckNumber}</TableCell>
                      <TableCell>{permit.owner}</TableCell>
                      <TableCell>{permit.product}</TableCell>
                      <TableCell>{permit.permitNumber}</TableCell>
                      <TableCell>{parseInt(permit.quantity).toLocaleString()}</TableCell>
                      <TableCell>
                        {new Date(permit.allocatedAt).toLocaleString()}
                      </TableCell>
                      <TableCell>
                        <span className={`px-2 py-1 rounded-full text-xs ${
                          permit.used 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/20 dark:text-emerald-400'
                            : 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/20 dark:text-yellow-400'
                        }`}>
                          {permit.used ? 'Used' : 'Pending'}
                        </span>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
