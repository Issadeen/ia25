'use client'

// Update imports to include useProfileImage
import { useProfileImage } from '@/hooks/useProfileImage'
import { useState, useEffect, useCallback } from 'react'
import { getDatabase, ref, onValue, get, update } from 'firebase/database'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, RefreshCw, Copy, Circle, Save, Loader2, Edit, Receipt } from 'lucide-react'
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
import { cn } from '@/lib/utils'
import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { preAllocatePermitEntry, resetTruckAllocation, updatePermitAllocation } from '@/lib/permit-allocation'
import type { PermitAllocation, PreAllocation } from '@/types/permits' // Add this line
import { findAvailablePermitEntries, type EntryAllocation } from '@/utils/permit-helpers';
import { cleanupOrphanedAllocations, consolidatePermitAllocations } from '@/lib/permit-allocation';
import { cleanupDuplicateAllocations, validateAllocations, cleanupZeroQuantityAllocations } from '@/lib/permit-cleanup';
import { resetPermitSystem } from '@/lib/permit-reset';
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Label } from '@/components/ui/label'

interface WorkDetailWithPermit {
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

interface PermitEntry {
  permitNumber: any
  key: any
  id: string
  product: string
  destination: string
  remainingQuantity: number
  allocated: boolean
  number: string
  timestamp: number
}

// Add new interface to track permit allocation status
interface ExtendedWorkDetail extends WorkDetailWithPermit {
  permitAllocated?: boolean;
  permitNumber?: string;
}

// Add this new interface to track truck loading status
interface LoadedTruckInfo {
  truckId: string;
  truckNumber: string;
  allocationId: string;
  loadedAt: string;
  product: string;
  owner: string;
  permitNumber?: string; // Add permit number field
  previousTruckNumber?: string; // Add previous truck number field
}

export default function PermitsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const profilePicUrl = useProfileImage()  // Add this line
  const { toast } = useToast()
  const [permits, setPermits] = useState<{ [key: string]: PermitAllocation }>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [pendingPermits, setPendingPermits] = useState<WorkDetailWithPermit[]>([])
  const [availableEntries, setAvailableEntries] = useState<PermitEntry[]>([])
  const [selectedPermitEntries, setSelectedPermitEntries] = useState<{ [truckId: string]: string }>({});
  const [allocatingPermit, setAllocatingPermit] = useState(false)
  const [selectedTruck, setSelectedTruck] = useState<string | null>(null);
  const [preAllocations, setPreAllocations] = useState<PreAllocation[]>([]);
  const [preAllocationSearch, setPreAllocationSearch] = useState('');
  const [titleClickCount, setTitleClickCount] = useState(0);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date())
  const [isAutoAllocating, setIsAutoAllocating] = useState(false);
  const [cleanupClickCount, setCleanupClickCount] = useState(0);
  const [manualCleanupMode, setManualCleanupMode] = useState(false);
  const [selectedForCleanup, setSelectedForCleanup] = useState<string[]>([]);
  const [editingAllocation, setEditingAllocation] = useState<string | null>(null);
  const [editQuantity, setEditQuantity] = useState<number>(0);
  const [loadedTrucks, setLoadedTrucks] = useState<LoadedTruckInfo[]>([]);
  const [showLoadedHistory, setShowLoadedHistory] = useState(false);
  const [destinationFilter, setDestinationFilter] = useState('ALL');
  const [at20Quantity, setAt20Quantity] = useState<string>('');
  const [selectedEntriesWithVolumes, setSelectedEntriesWithVolumes] = useState<EntryAllocation[]>([]);
  const [permitAllocation, setPermitAllocation] = useState<PermitAllocation | null>(null);

  // Add title click handler
  const handleTitleClick = () => {
    const newCount = titleClickCount + 1;
    if (newCount === 3) {
      setTitleClickCount(0);
      router.push('/dashboard/work/permits/admin');
    } else {
      setTitleClickCount(newCount);
    }
  };

  const renderManualAllocationContent = () => {
    const requiredQuantity = parseFloat(at20Quantity || '0');
    const totalAllocated = selectedEntriesWithVolumes.reduce((sum, item) => sum + item.allocatedVolume, 0);
    const remaining = requiredQuantity - totalAllocated;

    return (
      <div className="mt-6">
        <div className="flex justify-between items-center mb-4">
          <Label className="text-lg font-semibold">Available Entries:</Label>
          <div className="text-sm text-muted-foreground">
            Required: {requiredQuantity.toLocaleString()} liters
            <br />
            Remaining: <span className={remaining > 0 ? 'text-yellow-600' : remaining < 0 ? 'text-red-600' : 'text-green-600'}>
              {remaining.toLocaleString()} liters
            </span>
          </div>
        </div>

        {permitAllocation && (
          <div className="mb-4 p-4 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center justify-between">
              <div className="text-sm">
                <span className="font-medium">Pre-allocated Permit: </span>
                <Badge variant="outline" className="ml-2 bg-blue-100/50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                  {permitAllocation.permitNumber}
                </Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground mt-2">
              Please prioritize allocating from this permit entry first
            </p>
          </div>
        )}

        <div className="space-y-4 mt-2">
          {availableEntries.map((entry) => {
            const isPermitEntry = permitAllocation && entry.key === permitAllocation.permitEntryId;
            
            return (
              <div 
                key={entry.key} 
                className={cn(
                  "p-4 border rounded-lg bg-card",
                  isPermitEntry && "border-blue-200 dark:border-blue-800 bg-blue-50/50 dark:bg-blue-900/20"
                )}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="font-medium flex items-center gap-2">
                    {entry.number}
                    {entry.permitNumber && (
                      <Badge variant="outline" className="bg-blue-100/50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                        <Receipt className="h-3 w-3 mr-1" />
                        {isPermitEntry ? "Pre-allocated Permit Entry" : "Permit Entry"}
                      </Badge>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Available: {entry.remainingQuantity.toLocaleString()} liters
                  </div>
                </div>
                {/* ... rest of entry content ... */}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

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

  const fetchPendingPermits = async () => {
    const db = getDatabase()
    const [workDetailsRef, preAllocationsRef] = await Promise.all([
      get(ref(db, 'work_details')),
      get(ref(db, 'permitPreAllocations'))
    ]);
    
    if (workDetailsRef.exists()) {
      const data = workDetailsRef.val();
      const pendingTrucks: ExtendedWorkDetail[] = [];
      
      // Track truck numbers that already have pre-allocations
      const preAllocatedTrucks: { [key: string]: string[] } = {};
      
      // Build a map of pre-allocated trucks by destination
      if (preAllocationsRef.exists()) {
        const preAllocations = preAllocationsRef.val();
        Object.values(preAllocations as PreAllocation[]).forEach((allocation: PreAllocation) => {
          if (!allocation.used) {
            if (!preAllocatedTrucks[allocation.truckNumber]) {
              preAllocatedTrucks[allocation.truckNumber] = [];
            }
            preAllocatedTrucks[allocation.truckNumber].push(allocation.destination.toLowerCase());
          }
        });
      }

      // Iterate through work details and check if they need permits
      Object.entries(data).forEach(([id, workDetail]: [string, any]) => {
        const detail = { id, ...workDetail } as ExtendedWorkDetail;
        
        // Remove the condition that excluded non-SSD destinations
        const needsPermit = 
          !detail.loaded && 
          (detail.destination.toLowerCase() === 'ssd' || detail.destination.toLowerCase() === 'drc');
        
        // Check if this truck already has a pre-allocation for this destination
        const hasPreAllocation = preAllocatedTrucks[detail.truck_number]?.includes(detail.destination.toLowerCase());
        
        if (needsPermit && !hasPreAllocation && detail.status === "queued") {
          pendingTrucks.push(detail);
        }
      });
      
      setPendingPermits(pendingTrucks);
    }
  }

  const fetchAvailableEntries = async (product: string, quantity: number, destination: string = 'ssd') => {
    const db = getDatabase();
    const allocationsRef = ref(db, 'allocations');
    
    try {
      // Get allocations with correct destination
      const snapshot = await get(allocationsRef);
      if (snapshot.exists()) {
        const allocations = Object.entries(snapshot.val())
          .map(([key, value]: [string, any]) => ({
            id: key,
            ...value,
          }))
          .filter(entry => {
            // Match entries by product, sufficient quantity and correct destination
            return (
              entry.product.toLowerCase() === product.toLowerCase() &&
              entry.destination?.toLowerCase() === destination.toLowerCase() && // Match destination
              entry.remainingQuantity >= quantity * 1000
            );
          })
          .sort((a, b) => a.timestamp - b.timestamp);
          
        setAvailableEntries(allocations);
      } else {
        setAvailableEntries([]);
      }
    } catch (error) {
      console.error('Error fetching available entries:', error);
      toast({
        title: "Error",
        description: "Failed to fetch available entries",
        variant: "destructive"
      });
    }
  };

  const handlePermitAllocation = async (workDetail: ExtendedWorkDetail) => {
    const selectedEntry = selectedPermitEntries[workDetail.id];
    if (!selectedEntry) {
      toast({
        title: "Permit Required",
        description: `Please select permit entries for ${workDetail.destination.toUpperCase()}`,
        variant: "destructive"
      });
      return;
    }

    // Split the concatenated entry IDs
    const permitEntryIds = selectedEntry.split(',');
    if (permitEntryIds.length > 2) {
      toast({
        title: "Too Many Entries",
        description: "Maximum 2 permit entries can be selected",
        variant: "destructive"
      });
      return;
    }

    const permitEntries = permitEntryIds.map(id => 
      availableEntries.find(e => e.id === id)
    ).filter((e): e is PermitEntry => e !== undefined);

    if (permitEntries.length === 0) {
      toast({
        title: "Entry Not Found",
        description: "Selected permit entries not found",
        variant: "destructive"
      });
      return;
    }

    // Convert quantity to liters
    const requiredQuantity = parseFloat(workDetail.quantity) * 1000;
    const totalAvailable = permitEntries.reduce((sum, entry) => sum + entry.remainingQuantity, 0);

    if (totalAvailable < requiredQuantity) {
      toast({
        title: "Insufficient Quantity",
        description: `Selected entries have insufficient quantity. Required: ${requiredQuantity}, Available: ${totalAvailable}`,
        variant: "destructive"
      });
      return;
    }

    setAllocatingPermit(true);
    const db = getDatabase();

    try {
      // Allocate from multiple entries
      let remainingToAllocate = requiredQuantity;
      for (const permitEntry of permitEntries) {
        const quantityFromThisEntry = Math.min(permitEntry.remainingQuantity, remainingToAllocate);
        
        await preAllocatePermitEntry(
          db,
          workDetail.truck_number,
          workDetail.product,
          workDetail.owner,
          permitEntry.id,
          permitEntry.number,
          workDetail.destination,
          quantityFromThisEntry
        );
        
        remainingToAllocate -= quantityFromThisEntry;
        if (remainingToAllocate <= 0) break;
      }

      // Mark the truck as having permits allocated
      await update(ref(db, `work_details/${workDetail.id}`), {
        permitRequired: true,
        permitAllocated: true,
        permitNumbers: permitEntries.map(e => e.number),
        permitEntryIds: permitEntries.map(e => e.id),
        permitDestination: workDetail.destination
      });

      // Update UI state
      setPendingPermits(prev => prev.filter(p => p.id !== workDetail.id));
      setSelectedTruck(null);
      setSelectedPermitEntries(prev => {
        const newState = { ...prev };
        delete newState[workDetail.id];
        return newState;
      });

      toast({
        title: "Success",
        description: `Allocated ${permitEntries.length} permit entries for truck ${workDetail.truck_number}`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to allocate permit",
        variant: "destructive"
      });
    } finally {
      setAllocatingPermit(false);
    }
  };

  const renderPermitEntrySelect = (detail: ExtendedWorkDetail) => {
    const selectedEntries = selectedPermitEntries[detail.id]?.split(',') || [];
    
    return (
      <div className="space-y-2">
        {[0, 1].map((index) => (
          <Select
            key={index}
            value={selectedEntries[index] || ''}
            onValueChange={(value) => {
              const newEntries = [...selectedEntries];
              newEntries[index] = value;
              // Filter out empty values and join with comma
              setSelectedPermitEntries(prev => ({
                ...prev,
                [detail.id]: newEntries.filter(Boolean).join(',')
              }));
            }}
            onOpenChange={(open) => {
              if (open) {
                handlePermitEntrySelect(detail);
              }
            }}
          >
            <SelectTrigger className="w-full sm:w-[200px]">
              <SelectValue placeholder={`Select permit entry ${index + 1}`} />
            </SelectTrigger>
            <SelectContent>
              {availableEntries.length === 0 ? (
                <SelectItem value="none" disabled>
                  No available entries found
                </SelectItem>
              ) : (
                availableEntries
                  .filter(entry => !selectedEntries.includes(entry.id) || selectedEntries[index] === entry.id)
                  .map((entry) => (
                    <SelectItem key={entry.id} value={entry.id}>
                      {renderEntryOption(entry)}
                    </SelectItem>
                  ))
              )}
            </SelectContent>
          </Select>
        ))}
      </div>
    );
  };

  useEffect(() => {
    const loadPermitData = async (detail: WorkDetailWithPermit) => {
      if (selectedTruck === detail.id) {
        // Fetch available entries for the specific destination
        await fetchAvailableEntries(detail.product, parseFloat(detail.quantity), detail.destination);
      }
    };

    pendingPermits.forEach(loadPermitData);
  }, [pendingPermits, selectedTruck]);

  const handlePermitEntrySelect = async (detail: ExtendedWorkDetail) => {
    if (selectedTruck === detail.id) {
      setSelectedTruck(null);
      setAvailableEntries([]);
    } else {
      setSelectedTruck(detail.id);
      // Fetch entries for the specific destination of this detail
      await fetchAvailableEntries(detail.product, parseFloat(detail.quantity), detail.destination);
    }
  };

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

  useEffect(() => {
    const db = getDatabase();
    const preAllocationsRef = ref(db, 'permitPreAllocations');
    
    const unsubscribe = onValue(preAllocationsRef, (snapshot) => {
      if (snapshot.exists()) {
        const allocations = Object.values(snapshot.val() as { [key: string]: PreAllocation });
        setPreAllocations(allocations.filter(alloc => !alloc.used));
      } else {
        setPreAllocations([]);
      }
    });

    return () => unsubscribe();
  }, []);

  // Update filter function for pre-allocations to always show data
  const getFilteredPreAllocations = () => {
    // Filter out used allocations first regardless of cleanup mode
    const unusedPreAllocations = preAllocations.filter(allocation => !allocation.used);

    if (!preAllocationSearch && destinationFilter === 'ALL') {
      return unusedPreAllocations;
    }
    
    return unusedPreAllocations.filter(allocation => {
      const matchesSearch = !preAllocationSearch || 
        allocation.truckNumber.toLowerCase().includes(preAllocationSearch.toLowerCase()) ||
        allocation.product.toLowerCase().includes(preAllocationSearch.toLowerCase()) ||
        allocation.permitNumber.toLowerCase().includes(preAllocationSearch.toLowerCase());
        
      const matchesDestination = destinationFilter === 'ALL' || 
        allocation.destination?.toLowerCase() === destinationFilter.toLowerCase();
        
      return matchesSearch && matchesDestination;
    });
  };

  // Update the pre-allocation card content to include destination
  const renderAllocationContent = (allocation: PreAllocation) => {
    if (editingAllocation === allocation.id) {
      return (
        <div className="space-y-2">
          <div>
            <label className="text-sm text-muted-foreground">Quantity:</label>
            <Input 
              type="number" 
              value={editQuantity}
              onChange={(e) => setEditQuantity(parseFloat(e.target.value))}
              className="mt-1"
            />
          </div>
          <div className="flex justify-end space-x-2 mt-2">
            <Button 
              size="sm" 
              variant="outline"
              onClick={() => setEditingAllocation(null)}
            >
              Cancel
            </Button>
            <Button 
              size="sm"
              onClick={() => handleSaveAllocation(allocation)}
            >
              Save
            </Button>
          </div>
        </div>
      );
    }

    return (
      <div className="space-y-2">
        <div className="flex justify-between items-center">
          <div className="font-semibold">{allocation.truckNumber}</div>
          <Badge 
            variant={
              allocation.destination?.toLowerCase() === 'ssd' ? 'default' : 
              allocation.destination?.toLowerCase() === 'drc' ? 'secondary' : 
              'outline'
            }
            className="ml-2"
          >
            {allocation.destination?.toUpperCase() || 'UNKNOWN'}
          </Badge>
        </div>
        <div>Product: {allocation.product}</div>
        <div>Permit: {allocation.permitNumber}</div>
        <div>Quantity: {(allocation.quantity / 1000).toFixed(2)}K</div>
        <div className="text-xs text-muted-foreground">
          {new Date(allocation.allocatedAt).toLocaleString()}
        </div>
        <div className="flex justify-between mt-2">
          {manualCleanupMode ? (
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
          ) : (
            <Button 
              variant="outline" 
              size="sm"
              onClick={() => handleReallocation(allocation.truckNumber, allocation.destination)}
            >
              Reset
            </Button>
          )}
          <div className="flex gap-2">
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => handleCopyPermit(allocation)}
            >
              <Copy className="h-4 w-4" />
            </Button>
            <Button 
              variant="ghost" 
              size="sm"
              onClick={() => setEditingAllocation(allocation.id)}
            >
              <Edit className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    );
  };

  // Add refresh function
  const refreshData = useCallback(async () => {
    setIsRefreshing(true)
    try {
      const db = getDatabase();
      
      // Clean up duplicate allocations
      await cleanupOrphanedAllocations(db);
      
      // Consolidate allocations for each truck
      const uniqueTrucks = new Set(preAllocations.map(a => `${a.truckNumber}-${a.product}`));
      for (const key of uniqueTrucks) {
        const [truckNumber, product] = key.split('-');
        await consolidatePermitAllocations(db, truckNumber, product);
      }
      
      await Promise.all([
        fetchPendingPermits(),
        selectedTruck && pendingPermits.find(p => p.id === selectedTruck)?.product && 
          fetchAvailableEntries(
            pendingPermits.find(p => p.id === selectedTruck)!.product,
            parseFloat(pendingPermits.find(p => p.id === selectedTruck)!.quantity),
            pendingPermits.find(p => p.id === selectedTruck)!.destination
          )
      ])
      setLastRefresh(new Date())
    } catch (error) {
      console.error('Refresh error:', error)
    } finally {
      setIsRefreshing(false)
    }
  }, [selectedTruck, pendingPermits, preAllocations])

  // Update auto-refresh effect (every 10 minutes)
  useEffect(() => {
    const intervalId = setInterval(refreshData, 600000) // 10 minutes = 600000ms
    return () => clearInterval(intervalId)
  }, [refreshData])

  // Add new function to handle multiple allocations
  const handleMultipleAllocations = async (
    workDetail: ExtendedWorkDetail,
    allocations: EntryAllocation[] 
  ) => {
    const db = getDatabase();
    
    for (const allocation of allocations) {
      try {
        await preAllocatePermitEntry(
          db,
          workDetail.truck_number,
          workDetail.product,
          workDetail.owner,
          allocation.entry.id,
          allocation.entry.number,
          allocation.entry.destination // Pass the destination instead of quantity
        );
      } catch (error) {
        console.error('Error allocating permit:', error);
        throw error;
      }
    }
  };

  // Update auto allocation function
  const handleAutoAllocate = async () => {
    setIsAutoAllocating(true);
    let successCount = 0;
    let failCount = 0;

    try {
      // Get existing allocations first
      const db = getDatabase();
      const preAllocationsSnapshot = await get(ref(db, 'permitPreAllocations'));
      const existingAllocations = preAllocationsSnapshot.exists() 
        ? Object.values(preAllocationsSnapshot.val()).map((pa: any) => pa.truckNumber)
        : [];

      // Filter out already allocated trucks
      const unallocatedPending = pendingPermits.filter(
        detail => !existingAllocations.includes(detail.truck_number)
      );

      for (const detail of unallocatedPending) {
        try {
          const requiredQuantity = parseFloat(detail.quantity) * 1000;
          const availableAllocations = await findAvailablePermitEntries(
            getDatabase(),
            detail.product,
            requiredQuantity
          );
          
          if (availableAllocations.length > 0) {
            await handleMultipleAllocations(detail, availableAllocations);
            successCount++;
          } else {
            failCount++;
          }
        } catch (error) {
          console.error(`Failed to allocate permit for ${detail.truck_number}:`, error);
          failCount++;
        }
      }

      toast({
        title: "Auto-Allocation Complete",
        description: `Successfully allocated: ${successCount}, Failed: ${failCount}`,
        variant: successCount > 0 ? "default" : "destructive"
      });

      await refreshData();
      
    } catch (error) {
      console.error('Auto-allocation error:', error);
      toast({
        title: "Error",
        description: "Failed to complete auto-allocation",
        variant: "destructive"
      });
    } finally {
      setIsAutoAllocating(false);
    }
  };

  // Update the cleanup function to be more selective
  const handleCleanup = async () => {
    setIsRefreshing(true);
    try {
      const db = getDatabase();
      
      // Get work details to check loaded status
      const workDetailsRef = ref(db, 'work_details');
      const workSnapshot = await get(workDetailsRef);
      const loadedTrucks = new Map();
      
      if (workSnapshot.exists()) {
        Object.values(workSnapshot.val()).forEach((detail: any) => {
          if (detail.loaded && detail.truck_number) {
            loadedTrucks.set(detail.truck_number, detail.loadedAt || new Date().toISOString());
          }
        });
      }

      // Check pre-allocations
      const preAllocationsRef = ref(db, 'permitPreAllocations');
      const preAllocSnapshot = await get(preAllocationsRef);
      const updates: { [key: string]: null } = {};
      let cleanedCount = 0;

      if (preAllocSnapshot.exists()) {
        preAllocSnapshot.forEach((child) => {
          const allocation = child.val();
          const loadInfo = loadedTrucks.get(allocation.truckNumber);
          
          // Clean up if:
          // 1. Truck is loaded and allocation is not marked as used
          // 2. Allocation is older than 24 hours
          const isOld = new Date().getTime() - new Date(allocation.allocatedAt).getTime() > 24 * 60 * 60 * 1000;
          
          if ((loadInfo && !allocation.used) || isOld) {
            updates[`permitPreAllocations/${child.key}`] = null;
            cleanedCount++;
          }
        });
      }

      if (cleanedCount > 0) {
        await update(ref(db), updates);
        toast({
          title: "Cleanup Complete",
          description: `Removed ${cleanedCount} pre-allocations`,
        });
      } else {
        toast({
          title: "No Cleanup Needed",
          description: "No invalid allocations were found",
        });
      }

      await refreshData();

    } catch (error) {
      console.error('Cleanup error:', error);
      toast({
        title: "Error",
        description: "Failed to clean up allocations",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Add a new handler for manual reallocation
  const handleReallocation = async (truckNumber: string, destination?: string) => {
    try {
      const db = getDatabase();
      await resetTruckAllocation(db, truckNumber, destination);
      
      toast({
        title: "Reset Complete",
        description: destination 
          ? `Reset allocation for ${truckNumber} to ${destination.toUpperCase()}` 
          : "You can now reallocate a permit for this truck",
      });

      await refreshData();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reset allocation",
        variant: "destructive"
      });
    }
  };

  // Add this function to your component
  const handleReset = async () => {
    if (!confirm('⚠️ WARNING: This will reset the entire permit system. All pre-allocations will be deleted. Are you sure?')) {
      return;
    }
    
    setIsRefreshing(true);
    try {
      const db = getDatabase();
      const result = await resetPermitSystem(db);
      
      toast({
        title: result.success ? "Reset Complete" : "Reset Failed",
        description: result.message,
        variant: result.success ? "default" : "destructive"
      });

      if (result.success) {
        // Refresh the page data
        await refreshData();
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to reset permit system",
        variant: "destructive"
      });
    } finally {
      setIsRefreshing(false);
    }
  };

  // Add handler for cleanup button clicks
  const handleCleanupClick = () => {
    const newCount = cleanupClickCount + 1;
    if (newCount === 5) { // Require 5 clicks to show reset
      setCleanupClickCount(0);
      if (confirm('Show system reset button? This is a dangerous operation.')) {
        toast({
          title: "Reset Button Enabled",
          description: "System reset button is now visible. Please be careful.",
          variant: "destructive"
        });
        // You could set a state here to show the reset button temporarily
        setTimeout(() => {
          handleReset();
        }, 100);
      }
    } else {
      setCleanupClickCount(newCount);
    }
  };

  // Add new function to handle double click on title
  const handlePreAllocatedTitleDoubleClick = () => {
    setManualCleanupMode(!manualCleanupMode);
    setSelectedForCleanup([]);
    toast({
      title: manualCleanupMode ? "Manual Cleanup Mode Disabled" : "Manual Cleanup Mode Enabled",
      description: manualCleanupMode ? 
        "Exiting cleanup mode" : 
        "Click on pre-allocations to select them for cleanup",
    });
  };

  // Add function to handle manual cleanup
  const handleManualCleanup = async () => {
    if (!selectedForCleanup.length) return;

    try {
      const db = getDatabase();
      const updates: { [key: string]: any } = {};

      // Mark each selected allocation as loaded
      selectedForCleanup.forEach(allocationId => {
        updates[`permitPreAllocations/${allocationId}`] = null;
      });

      await update(ref(db), updates);

      toast({
        title: "Cleanup Complete",
        description: `Removed ${selectedForCleanup.length} pre-allocations`,
      });

      setSelectedForCleanup([]);
      setManualCleanupMode(false);
    } catch (error) {
      console.error('Manual cleanup error:', error);
      toast({
        title: "Error",
        description: "Failed to cleanup selected pre-allocations",
        variant: "destructive"
      });
    }
  };

  // Update the entries display to show remaining balance
  const renderEntryOption = (entry: PermitEntry) => {
    const remainingText = entry.remainingQuantity.toLocaleString();
    return `${entry.number} - ${remainingText}L remaining (${entry.destination.toUpperCase()})`;
  };

  // Add new handler for editing allocation
  const handleEditAllocation = (allocation: PreAllocation) => {
    if (!allocation.quantity || allocation.quantity <= 0) {
      handleReallocation(allocation.truckNumber, allocation.destination);
      return;
    }
    setEditingAllocation(allocation.id);
    setEditQuantity(allocation.quantity); // Store in liters
  };

  // Add save handler
  const handleSaveAllocation = async (allocation: PreAllocation) => {
    if (editQuantity <= 0) {
      toast({
        title: "Error",
        description: "Quantity must be greater than 0",
        variant: "destructive"
      });
      return;
    }

    try {
      const db = getDatabase();
      await updatePermitAllocation(db, allocation.id, editQuantity, allocation.quantity);
      
      toast({
        title: "Success",
        description: `Updated quantity to ${(editQuantity/1000).toFixed(1)}K`,
      });
      
      setEditingAllocation(null);
      await refreshData();
    } catch (error) {
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to update allocation",
        variant: "destructive"
      });
    }
  };

  // Add function to copy permit information to clipboard
  const handleCopyPermit = (allocation: PreAllocation) => {
    const textToCopy = `Truck: ${allocation.truckNumber}
Product: ${allocation.product}
Permit: ${allocation.permitNumber}
Destination: ${allocation.destination?.toUpperCase() || 'Unknown'}
Quantity: ${(allocation.quantity / 1000).toFixed(2)}K
Date: ${new Date(allocation.allocatedAt).toLocaleString()}`;

    navigator.clipboard.writeText(textToCopy)
      .then(() => {
        toast({
          title: "Copied",
          description: "Permit information copied to clipboard",
        });
      })
      .catch((error) => {
        console.error('Failed to copy:', error);
        toast({
          title: "Error",
          description: "Failed to copy permit information",
          variant: "destructive"
        });
      });
  };

  // Add function to fetch loaded trucks that had pre-allocated permits
  const fetchLoadedTrucks = async () => {
    try {
      const db = getDatabase();
      
      // Get all work details
      const workDetailsRef = ref(db, 'work_details');
      const workSnapshot = await get(workDetailsRef);
      
      if (!workSnapshot.exists()) return;
      
      // Get pre-allocations
      const preAllocationsRef = ref(db, 'permitPreAllocations');
      const preAllocationsSnapshot = await get(preAllocationsRef);
      const preAllocations = preAllocationsSnapshot.exists() ? preAllocationsSnapshot.val() : {};

      // Create a map of truck numbers to pre-allocations
      const truckAllocations: { [truckNumber: string]: any } = {};
      Object.entries(preAllocations).forEach(([id, alloc]: [string, any]) => {
        truckAllocations[alloc.truckNumber] = {
          id,
          ...alloc
        };
      });
      
      // Find loaded trucks that had pre-allocations
      const loaded: LoadedTruckInfo[] = [];
      
      Object.entries(workSnapshot.val()).forEach(([id, work]: [string, any]) => {
        if (work.loaded) {
          // Check if this truck has an allocation
          let allocation = truckAllocations[work.truck_number];
          
          // If no direct allocation, check if this truck was changed from another one
          if (!allocation && work.previous_trucks && work.previous_trucks.length > 0) {
            for (const prevTruck of work.previous_trucks) {
              if (truckAllocations[prevTruck]) {
                allocation = truckAllocations[prevTruck];
                allocation.previousTruckNumber = prevTruck;
                break;
              }
            }
          }
          
          if (allocation) {
            loaded.push({
              truckId: id,
              truckNumber: work.truck_number,
              allocationId: allocation.id,
              loadedAt: work.loadedAt || new Date().toISOString(),
              product: work.product,
              owner: work.owner,
              permitNumber: allocation.permitNumber,
              previousTruckNumber: allocation.previousTruckNumber
            });
          }
        }
      });
      
      setLoadedTrucks(loaded);
      
      // Mark these allocations as used in the database
      const updates: { [key: string]: any } = {};
      for (const truck of loaded) {
        if (preAllocations[truck.allocationId] && !preAllocations[truck.allocationId].used) {
          updates[`permitPreAllocations/${truck.allocationId}/used`] = true;
          updates[`permitPreAllocations/${truck.allocationId}/loadedAt`] = truck.loadedAt;
          updates[`permitPreAllocations/${truck.allocationId}/actualTruckNumber`] = truck.truckNumber;
          
          if (truck.previousTruckNumber) {
            updates[`permitPreAllocations/${truck.allocationId}/previousTruckNumber`] = truck.previousTruckNumber;
          }
        }
      }
      
      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
      }
      
    } catch (error) {
      console.error('Error fetching loaded trucks:', error);
      toast({
        title: "Error",
        description: "Failed to fetch loaded trucks data",
        variant: "destructive"
      });
    }
  };

  // Add this hook to fetch loaded trucks periodically
  useEffect(() => {
    // Initial fetch
    fetchLoadedTrucks();
    
    // Fetch every minute
    const interval = setInterval(fetchLoadedTrucks, 60000);
    
    return () => clearInterval(interval);
  }, []);

  // Add a section to display loaded trucks with their allocations
  const renderLoadedTrucksSection = () => {
    if (loadedTrucks.length === 0) return null;
    
    return (
      <Card className="mb-6 border-emerald-500/20">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Recently Loaded Trucks
            </CardTitle>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setShowLoadedHistory(!showLoadedHistory)}
            >
              {showLoadedHistory ? "Hide History" : "Show History"}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {showLoadedHistory ? (
            <div className="space-y-4">
              {loadedTrucks.map((truck) => (
                <div 
                  key={`${truck.truckId}-${truck.loadedAt}`} 
                  className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg space-y-4 sm:space-y-0"
                >
                  <div>
                    <div className="font-medium">{truck.truckNumber}</div>
                    {truck.previousTruckNumber && (
                      <div className="text-xs text-orange-600 font-medium">
                        Previous: {truck.previousTruckNumber}
                      </div>
                    )}
                    <div className="text-sm text-muted-foreground">
                      {truck.owner} - {truck.product} - Loaded at: {new Date(truck.loadedAt).toLocaleString()}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
                    <Badge variant="secondary" className="flex gap-2 items-center">
                      <span>Permit Used: {truck.permitNumber}</span>
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center text-muted-foreground py-4">
              {loadedTrucks.length} loaded truck(s) with allocated permits
            </div>
          )}
        </CardContent>
      </Card>
    );
  };

  // Add cleanup on component mount
  useEffect(() => {
    const cleanup = async () => {
      try {
        const db = getDatabase();
        const cleanedCount = await cleanupZeroQuantityAllocations(db);
        if (cleanedCount > 0) {
          toast({
            title: "Cleanup Complete",
            description: `Removed ${cleanedCount} invalid permit allocations`,
            variant: "default"
          });
        }
      } catch (error) {
        console.error('Cleanup error:', error);
      }
    };
    
    cleanup();
  }, []);

  // Update the pre-allocations rendering with proper keys
  const renderPreAllocations = () => (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
      {getFilteredPreAllocations().map((allocation) => (
        <Card key={allocation.id || `${allocation.truckNumber}-${allocation.timestamp}`} className="overflow-hidden">
          <CardContent className="p-4">
            {renderAllocationContent(allocation)}
          </CardContent>
        </Card>
      ))}
    </div>
  );

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
                  onClick={() => router.push('/dashboard/work/entries')}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <div className="flex items-center gap-2">
                  <h1 
                    onClick={handleTitleClick}
                    className="text-sm font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent truncate max-w-[150px] sm:max-w-none sm:text-base cursor-pointer"
                  >
                    Permit Allocations
                  </h1>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground">
                    <Circle 
                      className={`h-2 w-2 ${isRefreshing ? 'text-green-500 animate-pulse' : 'text-muted-foreground'}`} 
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

              {/* Right side - actions */}
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
                  onClick={handleCleanupClick} // Changed to new handler
                  disabled={isRefreshing}
                  className="hidden sm:flex items-center"
                >
                  {isRefreshing ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
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

            {/* Mobile row */}
            <div className="flex mt-2 sm:hidden">
              <Button
                variant="outline"
                size="sm"
                onClick={handleCleanup}
                disabled={isRefreshing}
                className="w-full"
              >
                {isRefreshing ? (
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4 mr-2" />
                )}
                Clean Up
              </Button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-28 sm:pt-24 pb-6 sm:pb-8">
        {/* Loaded Trucks Section - Add this before the Pending Permits section */}
        {renderLoadedTrucksSection()}
        
        {/* Pending Permits Section */}
        <Card className="mb-6 border-emerald-500/20">
          <CardHeader>
            <div className="flex justify-between items-center">
              <CardTitle className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
                Pending Permit Allocations
              </CardTitle>
              {pendingPermits.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleAutoAllocate}
                  disabled={isAutoAllocating}
                  className="relative"
                >
                  {isAutoAllocating ? (
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  ) : null}
                  Auto-Allocate {pendingPermits.length > 1 ? `(${pendingPermits.length})` : ''}
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
                <div key={detail.id} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg space-y-4 sm:space-y-0">
                  <div>
                    <div className="font-medium">{detail.truck_number}</div>
                    <div className="text-sm text-muted-foreground">
                      {detail.owner} - {detail.product} - {detail.quantity}L
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 sm:gap-4">
                    {renderPermitEntrySelect(detail)}
                    <Button
                      onClick={() => handlePermitAllocation(detail)}
                      disabled={allocatingPermit || !selectedPermitEntries[detail.id]}
                      className="w-full sm:w-auto"
                    >
                      {allocatingPermit ? (
                        <RefreshCw className="h-4 w-4 animate-spin mr-2" />
                      ) : null}
                      Allocate Permit
                    </Button>
                  </div>
                </div>
              ))}
              {pendingPermits.length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  No pending permits to allocate
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Updated Pre-Allocations Card with improved mobile layout */}
        <Card className="border-emerald-500/20">
          <CardHeader className="sm:pb-3">
            <CardTitle 
              className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent flex items-center justify-between"
              onDoubleClick={handlePreAllocatedTitleDoubleClick}
            >
              <span>Pre-Allocated Permits</span>
              <div className="flex items-center gap-2">
                {manualCleanupMode && (
                  <Button
                    variant="destructive"
                    size="sm"
                    onClick={handleManualCleanup}
                    disabled={!selectedForCleanup.length}
                  >
                    Clean Selected ({selectedForCleanup.length})
                  </Button>
                )}
                <span className="text-sm font-normal text-muted-foreground">
                  {getFilteredPreAllocations().length} Active
                </span>
              </div>
            </CardTitle>
            <div className="mt-2 grid grid-cols-1 sm:grid-cols-2 gap-2">
              <Input
                placeholder="Search pre-allocations..."
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
          <CardContent className="px-2 sm:px-6 pb-6">
            {getFilteredPreAllocations().length > 0 ? (
              renderPreAllocations()
            ) : (
              <div className="text-center p-4 text-muted-foreground">
                No active pre-allocations found.
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
