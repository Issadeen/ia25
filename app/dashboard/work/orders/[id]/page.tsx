'use client'

import { useState, useEffect } from 'react'
import { getDatabase, ref, get } from 'firebase/database'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { 
  ArrowLeft, RefreshCw, TruckIcon, CheckCircle2, XCircle, 
  Calendar, Sun, Moon, FileText, CreditCard, Copy, Check 
} from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useProfileImage } from '@/hooks/useProfileImage'
import { useTheme } from 'next-themes'
import { Separator } from '@/components/ui/separator'
import type { WorkDetail } from '@/types/work'
import type { PreAllocation } from '@/types/permits'
import { Skeleton } from '@/components/ui/skeleton'
import React from 'react'

export default function WorkOrderDetailsPage({ params: paramsPromise }: { params: Promise<{ id: string }> }) {
  const params = React.use(paramsPromise);
  const id = params.id;
  
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const { toast } = useToast()
  const { data: session } = useSession()
  const profilePicUrl = useProfileImage()
  
  const [workOrder, setWorkOrder] = useState<WorkDetail | null>(null)
  const [permitAllocations, setPermitAllocations] = useState<PreAllocation[]>([])
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const [copying, setCopying] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      fetchWorkOrderDetails(id)
    }
  }, [id])

  const fetchWorkOrderDetails = async (orderId: string) => {
    try {
      setLoading(true)
      const db = getDatabase()
      
      // Get work order details
      const workOrderRef = ref(db, `work_details/${orderId}`)
      const workOrderSnapshot = await get(workOrderRef)
      
      if (!workOrderSnapshot.exists()) {
        toast({
          title: "Not Found",
          description: "Work order not found",
          variant: "destructive"
        })
        return
      }
      
      const workOrderData = {
        ...workOrderSnapshot.val(),
        id: orderId
      } as WorkDetail
      
      setWorkOrder(workOrderData)
      
      // If work order has permit, get permit allocation details
      if (workOrderData.permitAllocated && workOrderData.permitNumber) {
        // Fetch permit pre-allocations for this truck
        const preAllocationsRef = ref(db, 'permitPreAllocations')
        const preAllocationsSnapshot = await get(preAllocationsRef)
        
        if (preAllocationsSnapshot.exists()) {
          const allPreAllocations = Object.entries(preAllocationsSnapshot.val())
            .map(([id, data]: [string, any]) => ({ 
              id, 
              ...data 
            }))
            .filter((preAlloc: PreAllocation) => 
              preAlloc.truckNumber === workOrderData.truck_number && 
              !preAlloc.used &&
              preAlloc.product?.toLowerCase() === workOrderData.product?.toLowerCase()
            )
          
          setPermitAllocations(allPreAllocations)
        }
      }
    } catch (error) {
      console.error('Error fetching work order details:', error)
      toast({
        title: "Error",
        description: "Failed to load work order details",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    if (!id) return
    setRefreshing(true)
    fetchWorkOrderDetails(id)
  }

  const formatDate = (dateString?: string) => {
    if (!dateString) return 'N/A'
    
    try {
      return new Date(dateString).toLocaleString()
    } catch (e) {
      return dateString
    }
  }

  const copyOrderDetails = () => {
    if (!workOrder) return;
    
    setCopying('details');
    
    const quantityDisplay = Number(workOrder.quantity) < 100
      ? `${workOrder.quantity}m³`
      : `${Math.round(Number(workOrder.quantity) / 1000)}K`;
      
    let permitNumbersDisplay = '';
    if (workOrder.permitNumber) {
      const permitNumbers = workOrder.permitNumber.split(',').map(num => num.trim());
      permitNumbersDisplay = permitNumbers.length > 1 
        ? `Entries: ${permitNumbers.join(' & ')}` 
        : `Permit: ${workOrder.permitNumber}`;
    }
    
    const formattedData = 
`Order: ${workOrder.orderno}
Truck: ${workOrder.truck_number}
Product: ${workOrder.product}
Quantity: ${quantityDisplay}
${permitNumbersDisplay ? permitNumbersDisplay + '\n' : ''}Destination: ${workOrder.destination}
Owner: ${workOrder.owner}
Status: ${workOrder.status}
Price: KES ${workOrder.price}`;
    
    navigator.clipboard.writeText(formattedData)
      .then(() => {
        toast({
          title: "Copied to clipboard",
          description: "Order details copied",
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

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <header className="fixed top-0 left-0 w-full border-b z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <div className="container flex h-14 max-w-screen-2xl items-center justify-between">
            <div className="flex items-center gap-2">
              <Button variant="ghost" size="icon" onClick={() => router.back()}>
                <ArrowLeft className="h-4 w-4" />
              </Button>
              <h1 className="font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
                Work Order Details
              </h1>
            </div>
          </div>
        </header>
        
        <main className="container max-w-screen-2xl pt-20 pb-8">
          <div className="space-y-6">
            <Card>
              <CardHeader>
                <Skeleton className="h-8 w-[200px]" />
                <Skeleton className="h-4 w-[150px]" />
              </CardHeader>
              <CardContent className="space-y-8">
                <div className="space-y-4">
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                  <Skeleton className="h-4 w-full" />
                </div>
              </CardContent>
            </Card>
          </div>
        </main>
      </div>
    )
  }

  if (!workOrder) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <div className="text-xl mb-4 text-muted-foreground">Work order not found</div>
        <Button onClick={() => router.back()}>Go Back</Button>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Work Order Details
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={copyOrderDetails}
              disabled={copying === 'details'}
              className="flex items-center gap-2"
            >
              {copying === 'details' ? (
                <div className="h-4 w-4 rounded-full border-2 border-solid border-current border-t-transparent animate-spin" />
              ) : (
                <Copy className="h-3.5 w-3.5" />
              )}
              Copy Details
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2"
            >
              {refreshing ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
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
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="md:col-span-2">
            <CardHeader>
              <div className="flex justify-between items-start">
                <div>
                  <CardTitle className="flex items-center gap-2">
                    <TruckIcon className="h-5 w-5 text-muted-foreground" />
                    <span>{workOrder.truck_number}</span>
                  </CardTitle>
                  <CardDescription>
                    Order {workOrder.orderno}
                  </CardDescription>
                </div>
                <div className="flex flex-col items-end gap-2">
                  <Badge variant="outline" className="bg-primary/10 hover:bg-primary/20">
                    {workOrder.product?.toUpperCase()} • {workOrder.destination?.toUpperCase()}
                  </Badge>
                  <Badge variant={workOrder.status === 'cancelled' ? 'destructive' : 'secondary'}>
                    {workOrder.status?.toUpperCase() || 'PENDING'}
                  </Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="space-y-1">
                  <div className="text-sm font-medium">Owner</div>
                  <div className="text-sm">{workOrder.owner}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">Quantity</div>
                  <div className="text-sm">{Number(workOrder.quantity).toLocaleString()}L</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">Price</div>
                  <div className="text-sm">KES {workOrder.price}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">Created</div>
                  <div className="text-sm">{formatDate(workOrder.createdAt)}</div>
                </div>
              </div>
              
              <Separator />
              
              {workOrder.permitAllocated && workOrder.permitNumber && (
                <div>
                  <h3 className="font-medium mb-2">Permit Information</h3>
                  <div className="p-3 border rounded-md bg-muted/10">
                    <div className="flex justify-between mb-2">
                      <div className="text-sm font-medium">
                        {workOrder.permitNumber.includes(',') ? 'Permit Entries' : 'Permit'}
                      </div>
                      <Badge variant="outline" className="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-400">
                        Allocated
                      </Badge>
                    </div>
                    
                    {workOrder.permitNumber.includes(',') ? (
                      <div className="flex flex-wrap gap-1 mb-2">
                        {workOrder.permitNumber.split(',').map((num, idx) => (
                          <Badge key={idx} variant="outline" className="font-mono">
                            {num.trim()}
                          </Badge>
                        ))}
                      </div>
                    ) : (
                      <div className="mb-2 font-mono text-sm">
                        {workOrder.permitNumber}
                      </div>
                    )}
                    
                    {permitAllocations.length > 0 && (
                      <div className="text-xs text-muted-foreground">
                        Allocated on {formatDate(permitAllocations[0].allocatedAt)}
                      </div>
                    )}
                  </div>
                </div>
              )}
              
              <Separator />
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-2">Loading Status</h3>
                  <div className="flex items-center gap-2 text-sm">
                    {workOrder.loaded ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span>Truck loaded</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                        <span>Not loaded</span>
                      </>
                    )}
                  </div>
                </div>
                
                <div>
                  <h3 className="font-medium mb-2">Payment Status</h3>
                  <div className="flex items-center gap-2 text-sm">
                    {workOrder.paid ? (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-500" />
                        <span>Payment completed</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="h-4 w-4 text-muted-foreground" />
                        <span>Payment pending</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
            <CardFooter className="flex flex-wrap gap-2">
              {workOrder.permitAllocated && workOrder.permitNumber && (
                <Button 
                  variant="outline"
                  className="flex items-center gap-2"
                  onClick={() => {
                    if (workOrder.permitEntryId) {
                      router.push(`/dashboard/work/permits/details/${workOrder.id}`);
                    }
                  }}
                >
                  <FileText className="h-4 w-4" />
                  View Permit Details
                </Button>
              )}
              
              {!workOrder.paid && (
                <Button 
                  variant="outline" 
                  className="flex items-center gap-2"
                  onClick={() => router.push(`/dashboard/payments/process/${workOrder.id}`)}
                >
                  <CreditCard className="h-4 w-4" />
                  Process Payment
                </Button>
              )}
              
              <Button 
                variant="secondary"
                className="flex items-center gap-2 ml-auto"
                onClick={() => router.push('/dashboard/work/orders')}
              >
                View All Orders
              </Button>
            </CardFooter>
          </Card>
          
          <Card>
            <CardHeader>
              <CardTitle>Additional Information</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-1">
                <div className="text-sm font-medium">Depot</div>
                <div className="text-sm">{workOrder.depot || 'Not specified'}</div>
              </div>
              
              {workOrder.previous_trucks && workOrder.previous_trucks.length > 0 && (
                <div className="space-y-1">
                  <div className="text-sm font-medium">Previous Trucks</div>
                  <div className="text-sm">
                    {workOrder.previous_trucks.map((truck, index) => (
                      <Badge key={index} variant="outline" className="mr-1 mb-1">
                        {truck}
                      </Badge>
                    ))}
                  </div>
                </div>
              )}
              
              <div className="space-y-1">
                <div className="text-sm font-medium">Gate Pass</div>
                <div className="text-sm">
                  {workOrder.gatePassGenerated ? (
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="h-4 w-4 text-green-500" />
                      <span>Generated {workOrder.gatePassGeneratedAt && formatDate(workOrder.gatePassGeneratedAt)}</span>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <XCircle className="h-4 w-4 text-muted-foreground" />
                      <span>Not generated</span>
                    </div>
                  )}
                </div>
              </div>
              
              {!workOrder.permitAllocated && workOrder.destination?.toLowerCase() !== 'local' && (
                <div className="border-t pt-4">
                  <Button 
                    variant="default" 
                    className="w-full"
                    onClick={() => router.push(`/dashboard/work/permits`)}
                  >
                    Allocate Permit
                  </Button>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
