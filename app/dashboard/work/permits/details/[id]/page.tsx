'use client'

import { useState, useEffect } from 'react'
import { getDatabase } from 'firebase/database'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, RefreshCw, TruckIcon, Calendar, CheckCircle, XCircle, Sun, Moon, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter, CardDescription } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useProfileImage } from '@/hooks/useProfileImage'
import { useTheme } from 'next-themes'
import { Separator } from '@/components/ui/separator'
import { getMultiPermitWorkOrder } from '@/lib/active-permit-service'
import type { WorkDetail } from '@/types/work'
import React from 'react'

interface PermitEntry {
  id: string;
  number: string;
  quantity: number;
  remainingQuantity?: number;
}

export default function PermitDetailsPage({ params }: { params: { id: string } }) {
  const id = params.id;

  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const { toast } = useToast()
  const { data: session } = useSession()
  const profilePicUrl = useProfileImage()

  const [workOrder, setWorkOrder] = useState<WorkDetail | null>(null)
  const [permitEntries, setPermitEntries] = useState<PermitEntry[]>([])
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
      const result = await getMultiPermitWorkOrder(db, orderId)

      setWorkOrder(result.workOrder)
      setPermitEntries(result.permitEntries)
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

  const copyPermitDetails = () => {
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
        : `Entry: ${workOrder.permitNumber}`;
    }

    const formattedData =
`Truck: ${workOrder.truck_number}
Product: ${workOrder.product}
Quantity: ${quantityDisplay}
${permitNumbersDisplay}
Destination: ${workOrder.destination}
Owner: ${workOrder.owner}`;

    navigator.clipboard.writeText(formattedData)
      .then(() => {
        toast({
          title: "Copied to clipboard",
          description: "Permit details copied",
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
      <div className="min-h-screen bg-background flex items-center justify-center">
        <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
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
              Permit Details
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={copyPermitDetails}
              disabled={copying === 'details'}
              className="flex items-center gap-2"
            >
              {copying === 'details' ? (
                <Check className="h-3.5 w-3.5 text-green-500" />
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
                  {workOrder.permitAllocated && (
                    <Badge variant="secondary" className="bg-green-500/10 text-green-700 dark:text-green-400">
                      Permit Allocated
                    </Badge>
                  )}
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
                  <div className="text-sm font-medium">Status</div>
                  <div className="text-sm capitalize">{workOrder.status}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium">Created</div>
                  <div className="text-sm">{formatDate(workOrder.createdAt)}</div>
                </div>
              </div>

              <Separator />

              <div>
                <h3 className="font-medium mb-2">Permit Information</h3>
                {permitEntries.length === 0 ? (
                  <div className="text-sm text-muted-foreground">
                    No permit entries assigned to this work order
                  </div>
                ) : (
                  <div className="space-y-3">
                    {permitEntries.map((entry) => (
                      <div key={entry.id} className="p-3 border rounded-md bg-muted/10">
                        <div className="flex justify-between mb-2">
                          <div className="text-sm font-medium">Permit #{entry.number}</div>
                          <Badge variant="outline">
                            {entry.quantity.toLocaleString()}L
                          </Badge>
                        </div>
                        <div className="grid grid-cols-2 gap-4 text-sm">
                          <div className="flex flex-col">
                            <span className="text-xs text-muted-foreground">ID</span>
                            <span className="font-mono">{entry.id}</span>
                          </div>
                          {entry.remainingQuantity !== undefined && (
                            <div className="flex flex-col">
                              <span className="text-xs text-muted-foreground">Remaining</span>
                              <span className="font-mono">{entry.remainingQuantity.toLocaleString()}L</span>
                            </div>
                          )}
                        </div>
                        <div className="mt-2 flex justify-end">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7"
                            onClick={() => {
                              setCopying(entry.id);

                              const entryData =
`Permit: ${entry.number}
Quantity: ${entry.quantity.toLocaleString()}L
Remaining: ${entry.remainingQuantity ? entry.remainingQuantity.toLocaleString() + 'L' : 'N/A'}
ID: ${entry.id}`;

                              navigator.clipboard.writeText(entryData)
                                .then(() => {
                                  toast({
                                    title: "Copied",
                                    description: `Permit ${entry.number} details copied`,
                                    duration: 2000
                                  });

                                  setTimeout(() => {
                                    setCopying(null);
                                  }, 1000);
                                })
                                .catch(() => {
                                  toast({
                                    title: "Copy failed",
                                    description: "Couldn't copy to clipboard",
                                    variant: "destructive"
                                  });
                                  setCopying(null);
                                });
                            }}
                          >
                            {copying === entry.id ? (
                              <Check className="h-4 w-4 text-green-500" />
                            ) : (
                              <Copy className="h-4 w-4" />
                            )}
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <Separator />

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <h3 className="font-medium mb-2">Loading Status</h3>
                  <div className="flex items-center gap-2 text-sm">
                    {workOrder.loaded ? (
                      <>
                        <CheckCircle className="h-4 w-4 text-green-500" />
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
                        <CheckCircle className="h-4 w-4 text-green-500" />
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
            <CardFooter>
              <Button
                variant="outline"
                onClick={() => router.push(`/dashboard/work/orders/${workOrder.id}`)}
              >
                View Full Order Details
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
                  <div className="text-sm space-y-1">
                    {workOrder.previous_trucks.map((truck, index) => (
                      <Badge key={index} variant="outline" className="mr-1">
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
                      <CheckCircle className="h-4 w-4 text-green-500" />
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

              <div className="space-y-1">
                <div className="text-sm font-medium">Price</div>
                <div className="text-sm">KES {workOrder.price}</div>
              </div>

              <div className="space-y-1">
                <div className="text-sm font-medium">Actions</div>
                <div className="space-y-2">
                  <Button
                    variant="secondary"
                    className="w-full"
                    onClick={() => router.push(`/dashboard/work/permits/active`)}
                  >
                    View All Active Allocations
                  </Button>
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={() => router.push(`/dashboard/work/permits`)}
                  >
                    Back to Permit Allocation
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </main>
    </div>
  )
}
