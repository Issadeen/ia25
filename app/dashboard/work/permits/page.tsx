'use client'

import { useState, useEffect } from 'react'
import { getDatabase, ref, onValue, update } from 'firebase/database'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, RefreshCw, CheckCircle2, Sun, Moon, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useProfileImage } from '@/hooks/useProfileImage'
import { useTheme } from 'next-themes'
import { findAvailablePermitEntry } from '@/utils/permit-helpers'
import { preAllocatePermitEntry } from '@/lib/permit-allocation'
import type { WorkDetail } from '@/types/work'
import type { PreAllocation } from '@/types/permits'

export default function PermitsPage() {
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const { toast } = useToast()
  const { data: session } = useSession()
  const profilePicUrl = useProfileImage()
  const [unallocatedOrders, setUnallocatedOrders] = useState<WorkDetail[]>([])
  const [loading, setLoading] = useState(true)
  const [recentAllocations, setRecentAllocations] = useState<PreAllocation[]>([])
  const [allocating, setAllocating] = useState<string | null>(null)
  const [adminClickCount, setAdminClickCount] = useState(0)
  const [copying, setCopying] = useState<string | null>(null)

  useEffect(() => {
    const db = getDatabase()
    const workRef = ref(db, 'work_details')
    
    const unsubscribe = onValue(workRef, (snapshot) => {
      if (!snapshot.exists()) {
        setUnallocatedOrders([])
        setLoading(false)
        return
      }

      const orders: WorkDetail[] = []
      snapshot.forEach((child) => {
        const order = child.val() as WorkDetail
        const id = child.key
        
        const isLocalDestination = 
          order.destination === 'local' || 
          order.destination === 'LOCAL' || 
          order.destination?.toLowerCase() === 'local'
          
        if (!order.permitAllocated && 
            !order.loaded && 
            order.status !== 'cancelled' && 
            !isLocalDestination && 
            order.destination) {
          orders.push({ ...order, id: id as string })
        }
      })

      setUnallocatedOrders(orders.sort((a, b) => 
        new Date(b.createdAt || 0).getTime() - new Date(a.createdAt || 0).getTime()
      ))
      setLoading(false)
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const db = getDatabase()
    const allocationsRef = ref(db, 'permitPreAllocations')
    
    const unsubscribe = onValue(allocationsRef, (snapshot) => {
      if (!snapshot.exists()) return
      
      const allAllocations = Object.entries(snapshot.val())
        .map(([id, alloc]: [string, any]) => ({
          id,
          ...alloc
        }))
        .filter(alloc => !alloc.used)
        .sort((a, b) => new Date(b.allocatedAt).getTime() - new Date(a.allocatedAt).getTime())
        .slice(0, 10)
      
      setRecentAllocations(allAllocations)
    })

    return () => unsubscribe()
  }, [])

  const handleAllocatePermit = async (order: WorkDetail) => {
    try {
      setAllocating(order.id)
      
      const availablePermit = await findAvailablePermitEntry(
        getDatabase(),
        order.product,
        Number(order.quantity),
        order.destination
      )

      if (!availablePermit) {
        toast({
          title: "No Permit Available",
          description: `No permit found for ${order.product} to ${order.destination}`,
          variant: "destructive"
        })
        return
      }

      const result = await preAllocatePermitEntry(
        getDatabase(),
        order.truck_number,
        order.product,
        order.owner,
        availablePermit.id,
        availablePermit.number,
        order.destination,
        Number(order.quantity)
      )

      if (!result.success) {
        throw new Error(result.error)
      }

      const updates: Record<string, any> = {
        [`work_details/${order.id}/permitAllocated`]: true,
        [`work_details/${order.id}/permitNumber`]: availablePermit.number,
        [`work_details/${order.id}/permitEntryId`]: availablePermit.id
      }

      await update(ref(getDatabase()), updates)

      setUnallocatedOrders(prev => 
        prev.filter(o => o.id !== order.id)
      )

      toast({
        title: "Success",
        description: `Allocated permit ${availablePermit.number} to ${order.truck_number}`
      })

    } catch (error) {
      console.error('Allocation error:', error)
      toast({
        title: "Allocation Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      })
    } finally {
      setAllocating(null)
    }
  }

  const handleAdminAccess = () => {
    setAdminClickCount(prev => {
      const newCount = prev + 1
      if (newCount >= 3) {
        router.push('/dashboard/work/permits/admin')
        return 0
      }
      return newCount
    })
    
    setTimeout(() => {
      setAdminClickCount(0)
    }, 2000)
  }

  const copyAllocationData = (allocation: PreAllocation) => {
    setCopying(allocation.id);
    
    // Format allocation data with structure and proper units
    // For quantities: check if they're stored in liters or cubic meters
    // If it's a small number (likely m³), display as is, otherwise convert from liters to K
    const quantityDisplay = allocation.quantity < 100 
      ? `${allocation.quantity}m³` // Already in cubic meters
      : `${Math.round(allocation.quantity/1000)}K`; // Convert liters to K (thousands)
    
    const formattedData = 
`Truck: ${allocation.truckNumber}
Product: ${allocation.product}
Quantity: ${quantityDisplay}
Entry: ${allocation.permitNumber}`;
    
    navigator.clipboard.writeText(formattedData)
      .then(() => {
        toast({
          title: "Copied to clipboard",
          description: "Entry details copied",
          duration: 2000
        });
        
        setTimeout(() => {
          setCopying(null);
        }, 1000);
      })
      .catch(err => {
        console.error('Failed to copy:', err)
        toast({
          title: "Copy failed",
          description: "Couldn't copy to clipboard",
          variant: "destructive"
        })
        setCopying(null)
      });
  };

  const renderAllocationsList = () => {
    if (recentAllocations.length === 0) return null;

    return (
      <Card className="mt-8 border bg-card shadow-sm">
        <CardHeader className="pb-3">
          <CardTitle>Recent Allocations</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {recentAllocations.map(allocation => (
              <Card key={allocation.id} className="overflow-hidden bg-background hover:bg-muted/50 transition-colors">
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="font-medium flex items-center gap-2">
                        <span className="mr-1">{allocation.truckNumber}</span>
                        <Badge variant="outline">{allocation.product}</Badge>
                      </div>
                      <div className="flex flex-col mt-1">
                        <div className="text-sm flex items-center">
                          <span className="text-muted-foreground">Entry: </span>
                          <span className="ml-1 font-medium">{allocation.permitNumber}</span>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-6 w-6 ml-1 text-muted-foreground hover:text-foreground"
                            onClick={() => copyAllocationData(allocation)}
                            title="Copy all details"
                          >
                            {copying === allocation.id ? (
                              <Check className="h-3.5 w-3.5 text-emerald-500" />
                            ) : (
                              <Copy className="h-3.5 w-3.5" />
                            )}
                          </Button>
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(allocation.allocatedAt).toLocaleString()}
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col items-end">
                      <Badge variant="secondary">{allocation.destination.toUpperCase()}</Badge>
                      <span className="text-sm font-medium mt-1">{allocation.quantity.toLocaleString()}L</span>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 
              className="font-semibold cursor-pointer bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent"
              onClick={handleAdminAccess}
            >
              Permit Allocation {adminClickCount > 0 && `(${adminClickCount}/3)`}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
            >
              {theme === "dark" ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
            <Avatar 
              className="h-8 w-8 ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-background transition-shadow hover:ring-emerald-500/75 cursor-pointer"
              onClick={() => router.push('/dashboard')}
            >
              <AvatarImage 
                src={session?.user?.image || profilePicUrl || ''} 
                alt={session?.user?.name || 'User Profile'}
              />
              <AvatarFallback className="bg-emerald-100 text-emerald-700">
                {session?.user?.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="container max-w-screen-2xl pt-20 pb-8">
        <Card className="shadow-sm border bg-card">
          <CardHeader className="pb-3 flex flex-row items-center justify-between">
            <CardTitle>Unallocated Orders</CardTitle>
            <Badge variant="outline">{unallocatedOrders.length}</Badge>
          </CardHeader>
          <CardContent>
            {loading ? (
              <div className="flex items-center justify-center p-8">
                <RefreshCw className="h-6 w-6 animate-spin text-muted-foreground" />
              </div>
            ) : unallocatedOrders.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                No orders waiting for permit allocation
              </div>
            ) : (
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {unallocatedOrders.map((order) => (
                  <Card key={order.id} className="overflow-hidden bg-background hover:bg-muted/50 transition-colors">
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <div>
                          <CardTitle className="text-lg">{order.truck_number}</CardTitle>
                          <p className="text-sm text-muted-foreground">{order.owner}</p>
                        </div>
                        <Badge className="bg-primary/90 hover:bg-primary transition-colors">{order.product}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="pb-3">
                      <div className="space-y-2">
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Quantity:</span>
                          <span className="font-medium">{Number(order.quantity).toLocaleString()}L</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Destination:</span>
                          <span className="font-medium">{order.destination}</span>
                        </div>
                        <div className="flex justify-between">
                          <span className="text-sm text-muted-foreground">Created:</span>
                          <span className="text-xs text-muted-foreground">{new Date(order.createdAt || '').toLocaleDateString()}</span>
                        </div>
                      </div>
                    </CardContent>
                    <CardFooter className="pt-0">
                      <Button 
                        className="w-full"
                        onClick={() => handleAllocatePermit(order)}
                        disabled={allocating === order.id}
                      >
                        {allocating === order.id ? (
                          <>
                            <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                            Allocating...
                          </>
                        ) : (
                          'Allocate Permit'
                        )}
                      </Button>
                    </CardFooter>
                  </Card>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {renderAllocationsList()}
      </main>
    </div>
  )
}

