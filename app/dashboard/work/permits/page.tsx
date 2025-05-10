'use client'

import { useState, useEffect } from 'react'
import { getDatabase, ref, onValue, update, get } from 'firebase/database'
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
import type { PreAllocation, PermitEntry } from '@/types/permits'

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

  const [showManualAllocation, setShowManualAllocation] = useState(false)
  const [selectedOrder, setSelectedOrder] = useState<WorkDetail | null>(null)
  const [availableEntries, setAvailableEntries] = useState<PermitEntry[]>([])
  const [entriesLoading, setEntriesLoading] = useState(false)
  const [selectedEntries, setSelectedEntries] = useState<PermitEntry[]>([])
  const [allocationValues, setAllocationValues] = useState<{ [entryId: string]: number }>({})
  const [autoFillEntries, setAutoFillEntries] = useState<{ [entryId: string]: boolean }>({})

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

  const handleManualAllocate = async (order: WorkDetail) => {
    setSelectedOrder(order)
    setEntriesLoading(true)
    setShowManualAllocation(true)
    setSelectedEntries([])
    setAllocationValues({})
    setAutoFillEntries({})

    try {
      const db = getDatabase()

      const entriesRef = ref(db, 'allocations')
      const snapshot = await get(entriesRef)

      if (!snapshot.exists()) {
        setAvailableEntries([])
        toast({
          title: "No entries available",
          description: `No permit entries found for ${order.product} to ${order.destination}`,
          variant: "destructive"
        })
        return
      }

      const allEntries: PermitEntry[] = []

      snapshot.forEach((child) => {
        const entry = child.val() as PermitEntry
        const entryId = child.key

        if (
          entryId &&
          entry.product?.toLowerCase() === order.product.toLowerCase() &&
          entry.destination?.toLowerCase() === order.destination.toLowerCase() &&
          entry.remainingQuantity > 0 &&
          !entry.used
        ) {
          const entryWithId = {
            ...entry,
            id: entryId,
            remainingQuantity: entry.remainingQuantity < 100
              ? entry.remainingQuantity * 1000
              : entry.remainingQuantity
          }

          allEntries.push(entryWithId)
        }
      })

      if (allEntries.length === 0) {
        toast({
          title: "No available entries",
          description: `No entries with remaining quantity found for ${order.product} to ${order.destination}`,
          variant: "destructive"
        })
      }

      const sortedEntries = allEntries.sort((a, b) => a.timestamp - b.timestamp)
      setAvailableEntries(sortedEntries)

    } catch (error) {
      console.error('Error fetching entries:', error)
      toast({
        title: "Error",
        description: "Failed to fetch available entries",
        variant: "destructive"
      })
    } finally {
      setEntriesLoading(false)
    }
  }

  const toggleEntrySelection = (entry: PermitEntry) => {
    if (selectedEntries.find(e => e.id === entry.id)) {
      setSelectedEntries(prev => prev.filter(e => e.id !== entry.id))
      setAllocationValues(prev => {
        const updated = { ...prev }
        delete updated[entry.id]
        return updated
      })
    } else if (selectedEntries.length < 2) {
      setSelectedEntries(prev => [...prev, entry])

      if (selectedOrder) {
        const remainingToAllocate = Number(selectedOrder.quantity) -
          Object.values(allocationValues).reduce((sum, val) => sum + val, 0)

        setAllocationValues(prev => ({
          ...prev,
          [entry.id]: Math.min(remainingToAllocate, entry.remainingQuantity)
        }))
      }
    } else {
      toast({
        title: "Selection limit reached",
        description: "You can select up to 2 entries for allocation",
        variant: "destructive"
      })
    }
  }

  const handleAllocationValueChange = (entryId: string, value: number) => {
    if (value < 0) return

    const entry = availableEntries.find(e => e.id === entryId)
    if (!entry) return

    const maxValue = Math.min(entry.remainingQuantity, value)

    setAllocationValues(prev => ({
      ...prev,
      [entryId]: maxValue
    }))
  }

  const recommendSecondEntry = (firstEntryId: string, requiredVolume: number): PermitEntry | null => {
    const firstEntry = availableEntries.find(e => e.id === firstEntryId)
    if (!firstEntry) return null

    const remainingNeeded = requiredVolume - (firstEntry.remainingQuantity || 0)
    if (remainingNeeded <= 0) return null

    console.log(`Finding second entry after ${firstEntryId}. Need ${remainingNeeded}L more.`)

    const otherEntries = availableEntries
      .filter(e => e.id !== firstEntryId)
      .sort((a, b) => a.timestamp - b.timestamp)

    let bestEntry: PermitEntry | null = null
    let bestVolume = 0

    for (const entry of otherEntries) {
      if (entry.remainingQuantity >= remainingNeeded) {
        return entry
      }

      if (entry.remainingQuantity > bestVolume) {
        bestVolume = entry.remainingQuantity
        bestEntry = entry
      }
    }

    return bestEntry
  }

  const handleAutoFillToggle = (entryId: string, checked: boolean) => {
    if (!selectedOrder) return

    setAutoFillEntries(prev => ({
      ...prev,
      [entryId]: checked
    }))

    if (checked) {
      const entry = availableEntries.find(e => e.id === entryId)
      if (!entry) return

      const orderQuantity = Number(selectedOrder.quantity) < 100
        ? Number(selectedOrder.quantity) * 1000
        : Number(selectedOrder.quantity)

      console.log('Auto-allocating with orderQuantity:', orderQuantity, 'entry remaining:', entry.remainingQuantity)

      const allocateFromEntry = Math.min(entry.remainingQuantity, orderQuantity)

      setAllocationValues(prev => ({
        ...prev,
        [entryId]: allocateFromEntry
      }))

      if (allocateFromEntry < orderQuantity) {
        const recommended = recommendSecondEntry(entryId, orderQuantity)

        if (recommended) {
          if (!selectedEntries.some(e => e.id === recommended.id)) {
            setSelectedEntries(prev => [...prev, recommended])
          }

          const remainingNeeded = orderQuantity - allocateFromEntry
          const allocateFromSecond = Math.min(recommended.remainingQuantity, remainingNeeded)

          setAllocationValues(prev => ({
            ...prev,
            [recommended.id]: allocateFromSecond
          }))

          setAutoFillEntries(prev => ({
            ...prev,
            [recommended.id]: true
          }))
        }
      }
    }
  }

  const executeManualAllocation = async () => {
    if (!selectedOrder || selectedEntries.length === 0) return

    const totalAllocated = Object.values(allocationValues).reduce((sum, val) => sum + val, 0)

    if (totalAllocated !== Number(selectedOrder.quantity)) {
      toast({
        title: "Allocation mismatch",
        description: `Total allocation (${totalAllocated}L) must match required quantity (${Number(selectedOrder.quantity)}L)`,
        variant: "destructive"
      })
      return
    }

    setAllocating(selectedOrder.id)

    try {
      const db = getDatabase()
      const updates: Record<string, any> = {}

      for (const entry of selectedEntries) {
        const allocationValue = allocationValues[entry.id] || 0
        if (allocationValue <= 0) continue

        const result = await preAllocatePermitEntry(
          db,
          selectedOrder.truck_number,
          selectedOrder.product,
          selectedOrder.owner,
          entry.id,
          entry.number,
          selectedOrder.destination,
          allocationValue
        )

        if (!result.success) {
          throw new Error(result.error)
        }
      }

      updates[`work_details/${selectedOrder.id}/permitAllocated`] = true

      const permitNumbers = selectedEntries.map(e => e.number).join(', ')
      updates[`work_details/${selectedOrder.id}/permitNumber`] = permitNumbers

      await update(ref(db), updates)

      setUnallocatedOrders(prev =>
        prev.filter(o => o.id !== selectedOrder.id)
      )

      toast({
        title: "Success",
        description: `Allocated ${selectedEntries.length} entries to ${selectedOrder.truck_number}`
      })

      setShowManualAllocation(false)
      setSelectedOrder(null)

    } catch (error) {
      console.error('Manual allocation error:', error)
      toast({
        title: "Allocation Failed",
        description: error instanceof Error ? error.message : "Unknown error",
        variant: "destructive"
      })
    } finally {
      setAllocating(null)
    }
  }

  const renderManualAllocationDialog = () => {
    if (!showManualAllocation || !selectedOrder) return null

    const orderQuantityL = Number(selectedOrder.quantity) < 100
      ? Number(selectedOrder.quantity) * 1000
      : Number(selectedOrder.quantity)

    const orderQuantityM3 = orderQuantityL / 1000

    const totalAllocated = Object.values(allocationValues).reduce((sum, val) => sum + val, 0)
    const remainingToAllocate = orderQuantityL - totalAllocated
    const remainingToAllocateM3 = remainingToAllocate / 1000

    return (
      <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-xl max-h-[90vh] overflow-auto">
          <CardHeader>
            <CardTitle className="flex justify-between items-center">
              <span>Manual Allocation for {selectedOrder.truck_number}</span>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setShowManualAllocation(false)}
              >
                &times;
              </Button>
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              <div className="flex flex-col space-y-1">
                <span className="text-sm font-medium">Truck Information</span>
                <div className="flex justify-between text-sm">
                  <span>Product: <strong>{selectedOrder.product}</strong></span>
                  <span>Destination: <strong>{selectedOrder.destination}</strong></span>
                </div>
                <div className="flex justify-between text-sm">
                  <span>Required: <strong>{orderQuantityL.toLocaleString()}L ({orderQuantityM3.toFixed(1)}m³)</strong></span>
                  <span>Owner: <strong>{selectedOrder.owner}</strong></span>
                </div>
              </div>

              <div className="p-3 rounded-md bg-muted/20 flex flex-col">
                <div className="flex justify-between mb-1">
                  <span className="text-sm font-medium">Allocation Progress</span>
                  <span className={`text-sm font-semibold ${remainingToAllocate === 0 ? 'text-green-600 dark:text-green-400' : ''}`}>
                    {totalAllocated.toLocaleString()}L / {orderQuantityL.toLocaleString()}L
                  </span>
                </div>

                <div className="w-full bg-muted h-2 rounded-full overflow-hidden">
                  <div
                    className={`h-full ${remainingToAllocate === 0 ? 'bg-green-500' : 'bg-primary'}`}
                    style={{ width: `${Math.min(100, (totalAllocated / orderQuantityL) * 100)}%` }}
                  ></div>
                </div>

                <div className="flex justify-between mt-1 text-xs text-muted-foreground">
                  <span>
                    {remainingToAllocate > 0
                      ? `Still need ${remainingToAllocate.toLocaleString()}L (${remainingToAllocateM3.toFixed(1)}m³)`
                      : 'Full allocation complete'}
                  </span>
                  <span>{((totalAllocated / orderQuantityL) * 100).toFixed(0)}%</span>
                </div>
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between items-center mb-2">
                  <span className="text-sm font-medium">Available Entries</span>
                  <Button
                    variant="outline"
                    size="sm"
                    className="text-xs"
                    onClick={() => {
                      setSelectedEntries([])
                      setAllocationValues({})
                      setAutoFillEntries({})
                    }}
                  >
                    Reset Selections
                  </Button>
                </div>

                {entriesLoading ? (
                  <div className="flex justify-center p-4">
                    <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
                  </div>
                ) : availableEntries.length === 0 ? (
                  <div className="text-center p-4 text-muted-foreground">
                    No available entries found
                  </div>
                ) : (
                  <div className="space-y-3 max-h-[300px] overflow-y-auto p-1">
                    {availableEntries.map(entry => {
                      const isSelected = selectedEntries.some(e => e.id === entry.id)
                      const remainingM3 = entry.remainingQuantity / 1000
                      const isAutoFilled = autoFillEntries[entry.id] || false

                      const maxSelectable = isSelected
                        ? Math.min(entry.remainingQuantity, remainingToAllocate + (allocationValues[entry.id] || 0))
                        : Math.min(entry.remainingQuantity, remainingToAllocate)

                      const isBestEntry = availableEntries.filter(e => e.remainingQuantity >= orderQuantityL)[0]?.id === entry.id
                      const bestEntry = selectedEntries.length === 1 ?
                        recommendSecondEntry(selectedEntries[0].id, orderQuantityL) : null
                      const isRecommendedSecond = bestEntry?.id === entry.id

                      return (
                        <div
                          key={entry.id}
                          className={`p-3 border rounded-lg ${
                            isSelected
                              ? "border-primary/50 bg-primary/5"
                              : remainingToAllocate > 0
                                ? isBestEntry
                                  ? "border-green-500/30 hover:bg-green-50 dark:hover:bg-green-900/20"
                                  : "hover:bg-muted/50"
                                : "opacity-50"
                          } transition-colors cursor-pointer`}
                          onClick={() => remainingToAllocate > 0 || isSelected ? toggleEntrySelection(entry) : null}
                        >
                          <div className="flex justify-between">
                            <div className="flex items-center gap-2">
                              <span className="font-medium">{entry.number}</span>
                              {isBestEntry && !isSelected && (
                                <Badge variant="outline" className="bg-green-50 text-green-700 dark:bg-green-900/20 dark:text-green-400 text-xs">
                                  Recommended
                                </Badge>
                              )}
                              {isRecommendedSecond && !isSelected && (
                                <Badge variant="outline" className="bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-400 text-xs">
                                  Complementary
                                </Badge>
                              )}
                            </div>
                            <Badge variant="outline">
                              {remainingM3.toFixed(1)}m³
                              {entry.remainingQuantity >= orderQuantityL &&
                                <span className="ml-1 text-green-500">✓</span>}
                            </Badge>
                          </div>

                          <div className="flex items-center justify-between mt-1 text-xs text-muted-foreground">
                            <span>Added: {new Date(entry.timestamp).toLocaleDateString()}</span>
                            {entry.remainingQuantity >= orderQuantityL && (
                              <span className="text-green-600 dark:text-green-400">
                                Can fulfill entire order
                              </span>
                            )}
                          </div>

                          {isSelected && (
                            <div className="mt-3 flex flex-col gap-2 pt-2 border-t border-muted/30">
                              <div className="flex items-center justify-between">
                                <label className="flex items-center gap-2 cursor-pointer">
                                  <input
                                    type="checkbox"
                                    className="rounded border-gray-300 text-primary focus:ring-primary"
                                    checked={isAutoFilled}
                                    onChange={(e) => handleAutoFillToggle(entry.id, e.target.checked)}
                                    onClick={(e) => e.stopPropagation()}
                                  />
                                  <span className="text-sm">Auto-allocate optimal amount</span>
                                </label>
                                {isAutoFilled && (
                                  <span className="text-xs text-primary">
                                    FIFO applied
                                  </span>
                                )}
                              </div>

                              {!isAutoFilled && (
                                <div className="flex flex-col gap-1">
                                  <div className="flex items-center justify-between">
                                    <span className="text-xs text-muted-foreground">Allocate:</span>
                                    <span className="text-xs">
                                      Up to {(maxSelectable / 1000).toFixed(1)}m³ available
                                    </span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <input
                                      type="number"
                                      className="w-full rounded-md border border-input px-3 py-1 text-sm"
                                      value={allocationValues[entry.id] || 0}
                                      onChange={(e) => {
                                        const value = parseInt(e.target.value) || 0
                                        if (selectedEntries.length === 1 && value < orderQuantityL) {
                                          handleAllocationValueChange(entry.id, orderQuantityL)
                                        } else {
                                          handleAllocationValueChange(entry.id, value)
                                        }
                                      }}
                                      onClick={(e) => e.stopPropagation()}
                                      max={maxSelectable}
                                      min={0}
                                      step={1000}
                                    />
                                    <span className="text-xs text-muted-foreground min-w-16">
                                      {((allocationValues[entry.id] || 0) / 1000).toFixed(1)}m³
                                    </span>
                                  </div>
                                </div>
                              )}

                              {isAutoFilled && (
                                <div className="flex items-center justify-between text-sm">
                                  <span>Auto-allocated:</span>
                                  <span className="font-medium">
                                    {(allocationValues[entry.id] || 0).toLocaleString()}L ({((allocationValues[entry.id] || 0) / 1000).toFixed(1)}m³)
                                  </span>
                                </div>
                              )}
                            </div>
                          )}
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>

              <div className="border-t pt-4">
                <div className="flex justify-between text-sm mb-2">
                  <span>Total Allocated:</span>
                  <strong>
                    {Object.values(allocationValues).reduce((sum, val) => sum + val, 0).toLocaleString()}L
                    ({(Object.values(allocationValues).reduce((sum, val) => sum + val, 0) / 1000).toFixed(1)}m³)
                  </strong>
                </div>
                <div className="flex justify-between text-sm mb-4">
                  <span>Required:</span>
                  <strong>
                    {orderQuantityL.toLocaleString()}L
                    ({orderQuantityM3.toFixed(1)}m³)
                  </strong>
                </div>

                <Button
                  className="w-full"
                  onClick={executeManualAllocation}
                  disabled={
                    selectedEntries.length === 0 ||
                    Object.values(allocationValues).reduce((sum, val) => sum + val, 0) !== orderQuantityL ||
                    allocating === selectedOrder.id
                  }
                >
                  {allocating === selectedOrder.id ? (
                    <>
                      <RefreshCw className="mr-2 h-4 w-4 animate-spin" />
                      Allocating...
                    </>
                  ) : (
                    'Allocate Selected Entries'
                  )}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    )
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

    const quantityDisplay = allocation.quantity < 100
      ? `${allocation.quantity}m³`
      : `${Math.round(allocation.quantity / 1000)}K`;

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
              <div className="space-y-2">
                {unallocatedOrders.map((order) => (
                  <div
                    key={order.id}
                    className="flex items-center justify-between p-3 border rounded-lg bg-background hover:bg-muted/50 transition-colors"
                  >
                    <div className="flex items-center space-x-4">
                      <div>
                        <div className="font-medium">{order.truck_number}</div>
                        <div className="text-xs text-muted-foreground">{order.owner}</div>
                      </div>
                      <Badge className="ml-2">{order.product}</Badge>
                      <div className="hidden md:flex space-x-4">
                        <span className="text-sm">
                          <span className="text-muted-foreground">Qty:</span> {Number(order.quantity).toLocaleString()}L
                        </span>
                        <span className="text-sm">
                          <span className="text-muted-foreground">Dest:</span> {order.destination}
                        </span>
                      </div>

                      <div className="md:hidden text-xs">
                        <div><span className="text-muted-foreground">Qty:</span> {Number(order.quantity).toLocaleString()}L</div>
                        <div><span className="text-muted-foreground">Dest:</span> {order.destination}</div>
                        <div><span className="text-muted-foreground">Date:</span> {new Date(order.createdAt || '').toLocaleDateString()}</div>
                      </div>
                    </div>
                    <div className="flex-shrink-0 flex items-center gap-2">
                      <Badge variant="outline" className="hidden sm:flex text-xs">
                        {new Date(order.createdAt || '').toLocaleDateString()}
                      </Badge>
                      <Button
                        size="sm"
                        variant="outline"
                        className="whitespace-nowrap"
                        onClick={() => handleManualAllocate(order)}
                      >
                        Manual
                      </Button>
                      <Button
                        size="sm"
                        variant="default"
                        className="whitespace-nowrap"
                        onClick={() => handleAllocatePermit(order)}
                        disabled={allocating === order.id}
                      >
                        {allocating === order.id ? (
                          <>
                            <RefreshCw className="mr-2 h-3 w-3 animate-spin" />
                            <span className="hidden sm:inline">Allocating...</span>
                            <span className="sm:hidden">...</span>
                          </>
                        ) : (
                          'Auto'
                        )}
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {renderAllocationsList()}
        {renderManualAllocationDialog()}
      </main>
    </div>
  )
}

