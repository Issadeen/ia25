'use client'

import { useProfileImage } from '@/hooks/useProfileImage'
import { useState, useEffect, useCallback } from 'react'
import { getDatabase, ref, onValue, get, update, query, orderByChild, equalTo } from 'firebase/database'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { ArrowLeft, RefreshCw, Circle, Loader2 } from 'lucide-react'
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
import { useToast } from '@/components/ui/use-toast'
import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar, AvatarImage } from '@/components/ui/avatar'
import { AvatarFallback } from '@/components/ui/avatar'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { cleanupOrphanedAllocations, preAllocatePermitEntry, releasePreAllocation } from '@/lib/permit-allocation'
import { findAvailablePermitEntries, checkEntryVolumes, FoundPermitEntry, VolumeCheck } from '@/utils/permit-helpers'
import { cleanupZeroQuantityAllocations } from '@/lib/permit-cleanup'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'
import { PermitEntry } from '@/types/permits'

interface WorkDetailWithPermit {
  createdAt: number
  id: string
  truck_number: string
  product: string
  owner: string
  quantity: string
  destination: string
  loaded: boolean
  status: string
  permitRequired?: boolean
  permitAllocated?: boolean
}

interface PreAllocation {
  id: string
  truckNumber: string
  product: string
  owner: string
  quantity: number
  permitNumber: string
  destination: string
  allocatedAt: string
  used: boolean
}

interface LoadedTruckInfo {
  truckId: string
  truckNumber: string
  allocationId: string
  loadedAt: string
  product: string
  owner: string
  permitNumber?: string
  previousTruckNumber?: string
}

interface ExtendedWorkDetail extends WorkDetailWithPermit {
  destination: string
}

export default function PermitsPage() {
  const { data: session } = useSession()
  const router = useRouter()
  const profilePicUrl = useProfileImage()
  const { toast } = useToast()
  const [pendingPermits, setPendingPermits] = useState<WorkDetailWithPermit[]>([])
  const [preAllocations, setPreAllocations] = useState<PreAllocation[]>([])
  const [loadedTrucks, setLoadedTrucks] = useState<LoadedTruckInfo[]>([])
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [showLoadedHistory, setShowLoadedHistory] = useState(false)
  const [destinationFilter, setDestinationFilter] = useState('ALL')
  const [preAllocationSearch, setPreAllocationSearch] = useState('')
  const [manualCleanupMode, setManualCleanupMode] = useState(false)
  const [selectedForCleanup, setSelectedForCleanup] = useState<string[]>([])
  const [isReleasing, setIsReleasing] = useState<string | null>(null)
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null)
  const [availableEntries, setAvailableEntries] = useState<FoundPermitEntry[]>([])
  const [isLoadingEntries, setIsLoadingEntries] = useState(false)
  const [selectedEntries, setSelectedEntries] = useState<string[]>([])
  const [isAutoAllocating, setIsAutoAllocating] = useState(false)

  const refreshData = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const db = getDatabase()

      const workDetailsRef = query(ref(db, 'work_details'), orderByChild('permitAllocated'), equalTo(false))
      const workSnapshot = await get(workDetailsRef)
      const pending: WorkDetailWithPermit[] = []
      if (workSnapshot.exists()) {
        Object.entries(workSnapshot.val()).forEach(([id, detail]: [string, any]) => {
          if (!detail.loaded && detail.permitRequired !== false) {
            pending.push({ id, ...detail })
          }
        })
      }
      setPendingPermits(pending.sort((a, b) => (a.createdAt || 0) - (b.createdAt || 0)))

      const preAllocRef = ref(db, 'permitPreAllocations')
      const preAllocSnapshot = await get(preAllocRef)
      const preAllocs: PreAllocation[] = []
      if (preAllocSnapshot.exists()) {
        Object.entries(preAllocSnapshot.val()).forEach(([id, alloc]: [string, any]) => {
          if (!alloc.used) {
            preAllocs.push({ id, ...alloc })
          }
        })
      }
      setPreAllocations(preAllocs.sort((a, b) => new Date(b.allocatedAt).getTime() - new Date(a.allocatedAt).getTime()))

      const loadedTrucksRef = query(ref(db, 'work_details'), orderByChild('loaded'), equalTo(true))
      const loadedSnapshot = await get(loadedTrucksRef)
      const loaded: LoadedTruckInfo[] = []
      if (loadedSnapshot.exists()) {
        Object.entries(loadedSnapshot.val()).forEach(([id, detail]: [string, any]) => {
          const allocation = preAllocations.find(pa => pa.truckNumber === detail.truck_number && pa.destination === detail.destination && pa.used)
          loaded.push({
            truckId: id,
            truckNumber: detail.truck_number,
            allocationId: allocation?.id || 'N/A',
            loadedAt: detail.loadedAt || new Date().toISOString(),
            product: detail.product,
            owner: detail.owner,
            permitNumber: Array.isArray(detail.permitNumbers) ? detail.permitNumbers.map((p: any) => p.number).join(', ') : detail.permitNumbers?.number || 'N/A',
            previousTruckNumber: detail.previous_trucks?.slice(-1)[0]
          })
        })
      }
      setLoadedTrucks(loaded.sort((a, b) => new Date(b.loadedAt).getTime() - new Date(a.loadedAt).getTime()))

      setLastRefresh(new Date())
      setSelectedTruck(null)
      setAvailableEntries([])
      setSelectedEntries([])
    } catch (error) {
      console.error("Refresh error:", error)
      toast({ title: "Error", description: "Failed to refresh data.", variant: "destructive" })
    } finally {
      setIsRefreshing(false)
    }
  }, [toast])

  const handleCleanup = async () => {
    setIsRefreshing(true)
    try {
      const db = getDatabase()

      const zeroQtyCleaned = await cleanupZeroQuantityAllocations(db)
      console.log(`Cleaned ${zeroQtyCleaned} zero-quantity allocations.`)

      const orphanedResult = await cleanupOrphanedAllocations(db)
      console.log(`Cleaned ${orphanedResult.cleaned || 0} orphaned/old allocations.`)

      toast({ title: "Cleanup Complete", description: `Finished cleanup tasks. Cleaned ${zeroQtyCleaned + (orphanedResult.cleaned || 0)} items.` })
      refreshData()
    } catch (error) {
      console.error("Cleanup Error:", error)
      toast({ title: "Cleanup Error", description: `Cleanup failed: ${error instanceof Error ? error.message : 'Unknown error'}`, variant: "destructive" })
    } finally {
      setIsRefreshing(false)
    }
  }

  const renderLoadedTrucksSection = () => {
    return (
      <Card className="mb-6 border-blue-500/20">
        <CardHeader>
          <CardTitle className="text-xl font-semibold bg-gradient-to-r from-blue-600 via-sky-500 to-cyan-500 bg-clip-text text-transparent flex justify-between items-center">
            <span>Loaded Trucks History</span>
            <Button variant="outline" size="sm" onClick={() => setShowLoadedHistory(!showLoadedHistory)}>
              {showLoadedHistory ? 'Hide' : 'Show'} History ({loadedTrucks.length})
            </Button>
          </CardTitle>
        </CardHeader>
        {showLoadedHistory && (
          <CardContent>
            {loadedTrucks.length > 0 ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Truck</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Permit(s)</TableHead>
                    <TableHead>Loaded At</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {loadedTrucks.slice(0, 10).map((truck) => (
                    <TableRow key={truck.truckId}>
                      <TableCell>
                        {truck.truckNumber}
                        {truck.previousTruckNumber && (
                          <span className="text-xs text-muted-foreground ml-1 line-through">({truck.previousTruckNumber})</span>
                        )}
                      </TableCell>
                      <TableCell>{truck.product}</TableCell>
                      <TableCell className="text-xs">{truck.permitNumber || 'N/A'}</TableCell>
                      <TableCell>{new Date(truck.loadedAt).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <div className="text-center text-muted-foreground py-4">No loaded trucks found.</div>
            )}
          </CardContent>
        )}
      </Card>
    )
  }

  const findEntriesForTruck = async (truckDetail: ExtendedWorkDetail) => {
    if (!truckDetail || !truckDetail.product || !truckDetail.quantity || !truckDetail.destination) {
      console.error("Missing truck details for finding entries", truckDetail);
      toast({ title: "Error", description: "Missing truck details.", variant: "destructive" });
      return;
    }
    setIsLoadingEntries(true);
    setSelectedEntries([]); // Clear previous selection
    try {
      const db = getDatabase();
      const requiredQuantity = parseFloat(truckDetail.quantity); // Treat quantity directly as liters

      const entries = await findAvailablePermitEntries(
        db,
        truckDetail.product,
        requiredQuantity, // Use quantity directly
        truckDetail.destination
      );

      setAvailableEntries(entries);

      if (entries.length === 0) {
         toast({ title: "No Permits", description: `No available ${truckDetail.product} permit entries found for destination ${truckDetail.destination.toUpperCase()}.`, variant: "default" });
      }

    } catch (error) {
      console.error("Error finding permit entries:", error);
      toast({ title: "Error", description: "Failed to fetch available permit entries.", variant: "destructive" });
      setAvailableEntries([]);
    } finally {
      setIsLoadingEntries(false);
    }
  };

  const handleMultipleAllocations = async (workDetail: ExtendedWorkDetail, entriesToUse: FoundPermitEntry[]) => {
    const db = getDatabase();
    const requiredQuantity = parseFloat(workDetail.quantity); // Treat quantity directly as liters
    let remainingToAllocate = requiredQuantity;
    const allocatedPermitInfo: { id: string; number: string; quantity: number }[] = [];
    const updates: Record<string, any> = {};

    console.log(`Starting allocation for ${workDetail.truck_number}: ${requiredQuantity}L of ${workDetail.product} to ${workDetail.destination}`); // Log as L

    try {
      entriesToUse.sort((a, b) => a.timestamp - b.timestamp);

      for (const entry of entriesToUse) {
        if (remainingToAllocate <= 0) break;
        console.log(`Checking entry: ${entry.number} (${entry.id})`);
        const volumeCheck: VolumeCheck = await checkEntryVolumes(db, entry.id);

        if (!volumeCheck.isValid || volumeCheck.remainingVolume <= 0) {
          console.log(`Skipping entry ${entry.number}: No available volume (${volumeCheck.remainingVolume}) or invalid state.`);
          continue;
        }

        const quantityFromThisEntry = Math.min(volumeCheck.remainingVolume, remainingToAllocate);
        console.log(`Entry ${entry.number}: Available=${volumeCheck.remainingVolume}, Needed=${remainingToAllocate}, Allocating=${quantityFromThisEntry}`);

        if (quantityFromThisEntry > 0) {
          const allocationResult = await preAllocatePermitEntry(
            db,
            workDetail.truck_number,
            workDetail.product,
            workDetail.owner,
            entry.id,
            entry.number,
            workDetail.destination,
            quantityFromThisEntry
          );

          if (allocationResult.success && allocationResult.data) {
            allocatedPermitInfo.push({
                id: entry.id,
                number: entry.number,
                quantity: quantityFromThisEntry
            });
            remainingToAllocate -= quantityFromThisEntry;
            console.log(`Successfully allocated ${quantityFromThisEntry}L from ${entry.number}. Remaining needed: ${remainingToAllocate}L`);
          } else {
            console.error(`Failed to allocate from permit entry ${entry.number}: ${allocationResult.error}`);
            throw new Error(`Failed during allocation from ${entry.number}. Reason: ${allocationResult.error || 'Unknown'}. Please check logs.`);
          }
        }
      }

      if (remainingToAllocate > 0.01) {
         console.error(`Allocation incomplete for ${workDetail.truck_number}. Still need ${remainingToAllocate.toLocaleString()} L.`);
         throw new Error(`Allocation incomplete. ${remainingToAllocate.toLocaleString()} liters remaining. Check permit availability and logs.`);
      }

      updates[`work_details/${workDetail.id}/permitRequired`] = true;
      updates[`work_details/${workDetail.id}/permitAllocated`] = true;
      updates[`work_details/${workDetail.id}/permitNumbers`] = allocatedPermitInfo;
      updates[`work_details/${workDetail.id}/permitEntryIds`] = allocatedPermitInfo.map(p => p.id);
      updates[`work_details/${workDetail.id}/permitDestination`] = workDetail.destination;

      await update(ref(db), updates);

      toast({
        title: "Allocation Successful",
        description: `Allocated ${requiredQuantity.toLocaleString()}L for truck ${workDetail.truck_number} using ${allocatedPermitInfo.length} permit(s).`,
      });

      refreshData();

    } catch (error) {
      console.error(`Allocation process failed for truck ${workDetail.truck_number}:`, error);
      toast({
        title: "Allocation Failed",
        description: error instanceof Error ? error.message : "An unknown error occurred during allocation.",
        variant: "destructive",
      });
    }
  };

  const handleAllocateSelected = async () => {
    if (!selectedTruck || selectedEntries.length === 0) {
      toast({ title: "Error", description: "Please select a truck and at least one permit entry.", variant: "destructive" });
      return;
    }

    const workDetail = pendingPermits.find(p => p.id === selectedTruck);
    if (!workDetail) {
      toast({ title: "Error", description: "Selected truck details not found.", variant: "destructive" });
      return;
    }

    if (!workDetail.destination) {
       toast({ title: "Error", description: `Truck ${workDetail.truck_number} is missing destination information.`, variant: "destructive" });
       return;
    }

    const entriesToUse = selectedEntries
        .map(entryId => availableEntries.find(entry => entry.id === entryId))
        .filter((entry): entry is FoundPermitEntry => entry !== undefined);

    if (entriesToUse.length !== selectedEntries.length) {
        toast({ title: "Error", description: "Some selected entries could not be found. Please refresh.", variant: "destructive" });
        return;
    }

    setIsAutoAllocating(true);
    await handleMultipleAllocations(workDetail as ExtendedWorkDetail, entriesToUse);
    setIsAutoAllocating(false);
  };

  const renderEntryOption = (entry: FoundPermitEntry) => {
    const baseRemainingText = entry.remainingQuantity.toLocaleString();
    return `${entry.number} - ${baseRemainingText}L (${entry.destination.toUpperCase()})`;
  };

  const handlePermitAllocation = async (detail: WorkDetailWithPermit) => {
    console.log("Select Permit button clicked for:", detail.truck_number);
    setSelectedTruck(detail.id);
    await findEntriesForTruck(detail as ExtendedWorkDetail);
    toast({ title: "Select Entries", description: `Select permit entries for ${detail.truck_number} below.` });
  };

  const handleAutoAllocate = async () => {
    setIsAutoAllocating(true);
    let successCount = 0;
    let failCount = 0;
    const db = getDatabase();

    try {
      const preAllocSnapshot = await get(query(ref(db, 'permitPreAllocations'), orderByChild('used'), equalTo(false)));
      const activeAllocations = preAllocSnapshot.exists() ? preAllocSnapshot.val() : {};
      const allocatedTrucks = new Set(Object.values(activeAllocations).map((a: any) => `${a.truckNumber}-${a.destination?.toLowerCase()}-${a.product?.toLowerCase()}`));

      const unallocatedPending = pendingPermits.filter(
        detail => detail.destination && !allocatedTrucks.has(`${detail.truck_number}-${detail.destination?.toLowerCase()}-${detail.product?.toLowerCase()}`)
      );

      if (unallocatedPending.length === 0) {
          toast({ title: "Auto-Allocate", description: "No pending trucks require allocation.", variant: "default" });
          setIsAutoAllocating(false);
          return;
      }

      toast({ title: "Auto-Allocate", description: `Attempting to allocate for ${unallocatedPending.length} trucks...`, variant: "default" });

      for (const detail of unallocatedPending) {
        try {
          const requiredQuantity = parseFloat(detail.quantity);
          const availableAllocations = await findAvailablePermitEntries(
            db,
            detail.product,
            requiredQuantity,
            detail.destination
          );

          if (availableAllocations.length > 0) {
            await handleMultipleAllocations(detail as ExtendedWorkDetail, availableAllocations);
            successCount++;
          } else {
            console.log(`Auto-Allocate: No suitable permits found for ${detail.truck_number} (${detail.product} to ${detail.destination})`);
            failCount++;
          }
        } catch (error) {
           console.error(`Auto-Allocate failed for truck ${detail.truck_number}:`, error);
           failCount++;
        }
      }

      toast({
        title: "Auto-Allocate Complete",
        description: `Processed ${unallocatedPending.length} trucks. Successful: ${successCount}, Failed/Skipped: ${failCount}.`,
      });
      refreshData();

    } catch (error) {
      console.error('Auto-allocation main loop error:', error);
      toast({
        title: "Auto-Allocate Error",
        description: "An unexpected error occurred during the auto-allocation process.",
        variant: "destructive"
      });
    } finally {
      setIsAutoAllocating(false);
    }
  };

  const renderPermitEntrySelect = (detail: WorkDetailWithPermit) => {
     if (selectedTruck !== detail.id) {
        return <Button variant="outline" onClick={() => handlePermitAllocation(detail)} disabled={isRefreshing || isAutoAllocating}>Select Permit</Button>;
     }

     if (isLoadingEntries) {
        return <div className="flex items-center justify-center p-4"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
     }

     return (
       <div className="space-y-2">
         <Label className="text-sm font-medium">Available Entries ({availableEntries.length})</Label>
         {availableEntries.length > 0 ? (
           <div className="max-h-48 overflow-y-auto border rounded p-2 space-y-1 bg-background">
             {availableEntries.map(entry => (
               <div key={entry.id} className="flex items-center space-x-2 p-1 hover:bg-muted/50 rounded">
                 <Checkbox
                   id={`entry-${detail.id}-${entry.id}`}
                   checked={selectedEntries.includes(entry.id)}
                   onCheckedChange={(checked) => {
                     setSelectedEntries(prev =>
                       checked
                         ? [...prev, entry.id]
                         : prev.filter(id => id !== entry.id)
                     );
                   }}
                 />
                 <Label htmlFor={`entry-${detail.id}-${entry.id}`} className="text-sm font-normal cursor-pointer flex-grow">
                   {renderEntryOption(entry)}
                 </Label>
               </div>
             ))}
           </div>
         ) : (
           <div className="text-sm text-muted-foreground p-2 border rounded">No suitable permit entries found for this product/destination.</div>
         )}
         {availableEntries.length > 0 && (
            <Button
              onClick={handleAllocateSelected}
              disabled={isAutoAllocating || selectedEntries.length === 0 || isRefreshing}
              className="w-full sm:w-auto"
              size="sm"
            >
              {isAutoAllocating ? (
                <Loader2 className="h-4 w-4 animate-spin mr-2" />
              ) : null}
              Allocate Selected ({selectedEntries.length})
            </Button>
         )}
         <Button variant="ghost" size="sm" onClick={() => { setSelectedTruck(null); setAvailableEntries([]); setSelectedEntries([]); }}>Cancel</Button>
       </div>
     );
  };

  const handlePreAllocatedTitleDoubleClick = () => {
    setManualCleanupMode(prev => !prev);
    if (manualCleanupMode) {
      setSelectedForCleanup([]);
      toast({
        title: "Manual Cleanup Mode Disabled",
        description: "Exited manual cleanup mode",
        variant: "default"
      });
    } else {
      toast({
        title: "Manual Cleanup Mode Enabled",
        description: "Select items to manually clean up pre-allocations",
        variant: "default"
      });
    }
  };

  useEffect(() => {
    refreshData()
    const intervalId = setInterval(refreshData, 300000)
    return () => clearInterval(intervalId)
  }, [refreshData])

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
                  onClick={() => router.push('/dashboard/work/entries')}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2">
                  <h1
                    className="text-sm font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent truncate max-w-[150px] sm:max-w-none sm:text-base cursor-pointer"
                  >
                    Permit Allocations
                  </h1>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Circle
                      className={`h-2 w-2 ${isRefreshing ? 'text-yellow-500 animate-pulse' : 'text-green-500'}`}
                      fill="currentColor"
                    />
                    <span className="hidden sm:inline">
                      {isRefreshing
                        ? 'Refreshing...'
                        : `Last: ${lastRefresh.toLocaleTimeString()}`
                      }
                    </span>
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={refreshData}
                  disabled={isRefreshing}
                  className="h-8 w-8"
                >
                  <RefreshCw className={`h-4 w-4 ${isRefreshing ? 'animate-spin' : ''}`} />
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleCleanup}
                  disabled={isRefreshing}
                  className="hidden sm:flex items-center"
                >
                  {isRefreshing ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4 mr-2" />
                  )}
                  Clean Up
                </Button>
                <ThemeToggle />
                <div className="relative group">
                  <Avatar
                    className="h-8 w-8 ring-1 ring-pink-500/50"
                    onClick={() => router.push('/dashboard')}
                  >
                    <AvatarImage
                      src={session?.user?.image || profilePicUrl || ''}
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
            <div className="flex mt-2 sm:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCleanup}
                disabled={isRefreshing}
                className="w-full"
              >
                {isRefreshing ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Clean Up
              </Button>
            </div>
          </div>
        </div>
      </header>
      <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-36 sm:pt-24 pb-6 sm:pb-8">
        {renderLoadedTrucksSection()}
        <Card className="mb-6 border-emerald-500/20">
          <CardHeader>
            <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2">
              <CardTitle className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
                Pending Permit Allocations ({pendingPermits.length})
              </CardTitle>
              {pendingPermits.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoAllocate}
                  disabled={isAutoAllocating || isRefreshing}
                  className="relative w-full sm:w-auto"
                >
                  {isAutoAllocating ? (
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Auto-Allocate All
                  {isAutoAllocating && (
                    <span className="absolute -top-1 -right-1 h-2 w-2 bg-green-500 rounded-full animate-ping" />
                  )}
                </Button>
              )}
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingPermits.map((detail) => (
                <div key={detail.id} className="flex flex-col sm:flex-row sm:items-start sm:justify-between p-4 border rounded-lg space-y-4 sm:space-y-0 sm:space-x-4 bg-card">
                  <div className="flex-shrink-0">
                    <div className="font-medium">{detail.truck_number}</div>
                    <div className="text-sm text-muted-foreground">
                      {detail.owner} - {detail.product}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {detail.destination?.toUpperCase()} - {parseFloat(detail.quantity).toLocaleString()} L
                    </div>
                  </div>
                  <div className="flex-grow">
                    {renderPermitEntrySelect(detail)}
                  </div>
                </div>
              ))}
              {pendingPermits.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No pending permits to allocate.
                </div>
              )}
            </div>
          </CardContent>
        </Card>
        <Card className="border-emerald-500/20">
          <CardHeader className="sm:pb-3">
            <CardTitle
              className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2"
              onDoubleClick={handlePreAllocatedTitleDoubleClick}
            >
              <span>Active Pre-Allocated Permits</span>
              <div className="flex items-center gap-2 w-full sm:w-auto">
                {manualCleanupMode && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleCleanup}
                    disabled={!selectedForCleanup.length || isRefreshing}
                    className="flex-grow sm:flex-grow-0"
                  >
                    Clean Selected ({selectedForCleanup.length})
                  </Button>
                )}
                <Badge variant="outline" className="ml-auto">
                  {preAllocations.length} Active
                </Badge>
              </div>
            </CardTitle>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                placeholder="Search truck, permit, owner..."
                value={preAllocationSearch}
                onChange={(e) => setPreAllocationSearch(e.target.value)}
              />
              <Select
                value={destinationFilter}
                onValueChange={setDestinationFilter}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Filter by Destination" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Destinations</SelectItem>
                  <SelectItem value="ssd">SSD</SelectItem>
                  <SelectItem value="local">LOCAL</SelectItem>
                  <SelectItem value="drc">DRC</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent className="px-0 sm:px-6 pb-6">
            {preAllocations.length > 0 ? (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      {manualCleanupMode && <TableHead className="w-12"></TableHead>}
                      <TableHead>Truck</TableHead>
                      <TableHead>Product</TableHead>
                      <TableHead>Permit</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Allocated</TableHead>
                      <TableHead></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {preAllocations
                      .filter(alloc => {
                        if (destinationFilter !== 'ALL' && alloc.destination.toLowerCase() !== destinationFilter.toLowerCase()) {
                          return false;
                        }
                        if (preAllocationSearch) {
                          const search = preAllocationSearch.toLowerCase();
                          return (
                            alloc.truckNumber.toLowerCase().includes(search) ||
                            alloc.permitNumber.toLowerCase().includes(search) ||
                            alloc.owner.toLowerCase().includes(search) ||
                            alloc.product.toLowerCase().includes(search)
                          );
                        }
                        return true;
                      })
                      .map((allocation) => (
                        <TableRow key={allocation.id} className={isPreAllocationExpired(allocation) ? 'bg-yellow-500/10' : ''}>
                          {manualCleanupMode && (
                            <TableCell>
                              <Checkbox
                                checked={selectedForCleanup.includes(allocation.id)}
                                onCheckedChange={(checked) => {
                                  if (checked) {
                                    setSelectedForCleanup(prev => [...prev, allocation.id]);
                                  } else {
                                    setSelectedForCleanup(prev => prev.filter(id => id !== allocation.id));
                                  }
                                }}
                              />
                            </TableCell>
                          )}
                          <TableCell className="font-medium">{allocation.truckNumber}</TableCell>
                          <TableCell>{allocation.product}</TableCell>
                          <TableCell className="font-mono text-xs">{allocation.permitNumber}</TableCell>
                          <TableCell>{allocation.destination}</TableCell>
                          <TableCell className="text-xs text-muted-foreground">
                            {new Date(allocation.allocatedAt).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={async () => {
                                setIsReleasing(allocation.id);
                                try {
                                  const db = getDatabase();
                                  await releasePreAllocation(db, allocation.id);
                                  toast({ title: "Released", description: `Allocation ${allocation.permitNumber} for ${allocation.truckNumber} released.` });
                                  refreshData();
                                } catch (error) {
                                  console.error(`Error releasing allocation ${allocation.id}:`, error);
                                  toast({ title: "Error", description: "Failed to release allocation.", variant: "destructive" });
                                } finally {
                                  setIsReleasing(null);
                                }
                              }}
                              disabled={isReleasing === allocation.id || isRefreshing}
                              className="h-7 px-2"
                            >
                              {isReleasing === allocation.id ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                'Release'
                              )}
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="text-center p-4 text-muted-foreground">
                No active pre-allocations found matching filters.
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}

function isPreAllocationExpired(allocation: PreAllocation): boolean {
  const age = Date.now() - new Date(allocation.allocatedAt).getTime()
  return age > 48 * 60 * 60 * 1000 || allocation.used
}

