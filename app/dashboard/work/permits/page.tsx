'use client'

// Update imports to include useProfileImage
import { useProfileImage } from '@/hooks/useProfileImage'
import { useState, useEffect, useCallback } from 'react'
import { getDatabase, ref, onValue, get, update } from 'firebase/database'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, RefreshCw, Copy, Circle, Save } from 'lucide-react'
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
import { cleanupDuplicateAllocations, validateAllocations } from '@/lib/permit-cleanup';
import { resetPermitSystem } from '@/lib/permit-reset';
import { Badge } from '@/components/ui/badge'

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
      // Get all pre-allocations first
      const existingAllocations = preAllocationsRef.exists() 
        ? Object.entries(preAllocationsRef.val()).map(([id, pa]: [string, any]) => ({
          truckNumber: pa.truckNumber,
          used: pa.used
        }))
        : [];
        
      // Create a map of truck numbers to loaded status
      const loadedStatus = new Map<string, boolean>();
      Object.values(workDetailsRef.val()).forEach((detail: any) => {
        if (detail.truck_number) {
          loadedStatus.set(detail.truck_number, !!detail.loaded);
        }
      });
        
      // Filter work details to exclude already allocated trucks AND loaded trucks
      const details = Object.entries(workDetailsRef.val())
        .map(([id, detail]: [string, any]) => ({
          id,
          ...detail,
          permitRequired: detail.destination?.toLowerCase() === 'ssd',
        }))
        .filter((detail: ExtendedWorkDetail) => 
          detail.permitRequired && 
          !detail.loaded && // Exclude loaded trucks
          detail.status === 'queued' &&
          !detail.permitAllocated && 
          !existingAllocations.some(a => 
            a.truckNumber === detail.truck_number && !a.used // Only exclude if not used
          )
        );
      
      setPendingPermits(details);
    }
  }

  const fetchAvailableEntries = async (product: string, quantity: number) => {
    const db = getDatabase();
    const allocationsRef = ref(db, 'allocations');
    
    try {
      const snapshot = await get(allocationsRef);
      
      if (snapshot.exists()) {
        const entries = Object.entries(snapshot.val())
          .map(([id, data]: [string, any]) => ({
            id,
            ...data
          }))
          .filter(entry => (
            entry.product?.toLowerCase() === product.toLowerCase() &&
            entry.remainingQuantity >= parseFloat(quantity.toString()) &&
            entry.destination?.toLowerCase() === 'ssd'
          ))
          .sort((a, b) => a.timestamp - b.timestamp);

        setAvailableEntries(entries);

        if (process.env.NODE_ENV === 'development') {
          console.info(`[Permits] Found ${entries.length} available entries for ${product}`);
        }

        // Add feedback about available entries
        if (entries.length > 0) {
          toast({
            title: "Found Permit Entries",
            description: `${entries.length} entries available for allocation`,
          });
        } else {
          toast({
            title: "No Entries Available",
            description: "No matching entries found for allocation",
            variant: "destructive"
          });
        }
      }
    } catch (error) {
      console.error('[Permits Error] Failed to fetch entries:', error);
      toast({
        title: "Error",
        description: "Failed to fetch permit entries",
        variant: "destructive"
      });
    }
  };

  const handlePermitAllocation = async (workDetail: ExtendedWorkDetail) => {
    const selectedEntry = selectedPermitEntries[workDetail.id];
    if (!selectedEntry) {
      toast({
        title: "Error",
        description: "Please select a permit entry",
        variant: "destructive"
      });
      return;
    }

    const permitEntry = availableEntries.find(e => e.id === selectedEntry);
    if (!permitEntry) {
      toast({
        title: "Error",
        description: "Selected permit entry not found",
        variant: "destructive"
      });
      return;
    }

    // Convert quantity to liters
    const requiredQuantity = parseFloat(workDetail.quantity) * 1000; // Convert to liters
    if (permitEntry.remainingQuantity < requiredQuantity) {
      toast({
        title: "Error",
        description: `Insufficient volume. Required: ${requiredQuantity.toLocaleString()}L, Available: ${permitEntry.remainingQuantity.toLocaleString()}L`,
        variant: "destructive"
      });
      return;
    }

    setAllocatingPermit(true);
    const db = getDatabase();

    try {
      // Create the pre-allocation first
      const allocation = await preAllocatePermitEntry(
        db,
        workDetail.truck_number,
        workDetail.product,
        workDetail.owner,
        selectedEntry,
        permitEntry.number,
        requiredQuantity
      );

      toast({
        title: "Success",
        description: `Allocated ${(requiredQuantity/1000).toFixed(1)}K from permit ${permitEntry.number}`,
      });

      // Update UI states
      setSelectedPermitEntries(prev => {
        const updated = { ...prev };
        delete updated[workDetail.id];
        return updated;
      });
      setSelectedTruck(null);
      await Promise.all([
        fetchPendingPermits(),
        fetchAvailableEntries(workDetail.product, requiredQuantity)
      ]);

    } catch (error) {
      console.error('Allocation error:', error);
      toast({
        title: "Error",
        description: error instanceof Error ? error.message : "Failed to allocate permit",
        variant: "destructive"
      });
    } finally {
      setAllocatingPermit(false);
    }
  };

  useEffect(() => {
    const loadPermitData = async (detail: WorkDetailWithPermit) => {
      if (detail.product && detail.quantity) {
        await fetchAvailableEntries(detail.product, parseFloat(detail.quantity));
      }
    };

    pendingPermits.forEach(loadPermitData);
  }, [pendingPermits]);

  useEffect(() => {
    fetchPendingPermits()
  }, [])

  const handlePermitEntrySelect = async (detail: ExtendedWorkDetail) => {
    if (selectedTruck === detail.id) {
      setSelectedTruck(null);
      setSelectedPermitEntries(prev => {
        const updated = { ...prev };
        delete updated[detail.id];
        return updated;
      });
    } else {
      setSelectedTruck(detail.id);
      await fetchAvailableEntries(
        detail.product,
        parseFloat(detail.quantity)
      );
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

  // Update copy function to use "entry" instead of "permit"
  const handleCopyPermit = (allocation: PreAllocation) => {
    const text = `Truck: ${allocation.truckNumber}
Product: ${allocation.product}
Quantity: ${(allocation.quantity / 1000).toFixed(0)}K
Entry: ${allocation.permitNumber}`;

    navigator.clipboard.writeText(text).then(() => {
      toast({
        title: "Copied",
        description: "Permit details copied to clipboard",
      });
    });
  };

  // Add filter function for pre-allocations
  const getFilteredPreAllocations = () => {
    // Filter out used allocations first
    const unusedPreAllocations = preAllocations.filter(allocation => !allocation.used);

    if (!preAllocationSearch) return unusedPreAllocations;
    
    const searchLower = preAllocationSearch.toLowerCase();
    return unusedPreAllocations.filter(allocation => 
      allocation.truckNumber.toLowerCase().includes(searchLower) ||
      allocation.product.toLowerCase().includes(searchLower) ||
      allocation.permitNumber.toLowerCase().includes(searchLower)
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
            parseFloat(pendingPermits.find(p => p.id === selectedTruck)!.quantity)
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
          allocation.quantity // Add this parameter to preAllocatePermitEntry
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

  // Add this function inside your component
const handleCleanup = async () => {
  setIsRefreshing(true);
  try {
    const db = getDatabase();
    
    // Run cleanup
    const result = await cleanupDuplicateAllocations(db);
    
    if (result.duplicatesRemoved > 0 || result.consolidated > 0) {
      toast({
        title: "Cleanup Complete",
        description: `Removed ${result.duplicatesRemoved} invalid allocations and consolidated ${result.consolidated} entries. You can now reallocate permits.`,
      });
    } else {
      toast({
        title: "No Issues Found",
        description: "No invalid allocations were found",
      });
    }

    // Refresh data immediately after cleanup
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
const handleReallocation = async (truckNumber: string) => {
  try {
    const db = getDatabase();
    await resetTruckAllocation(db, truckNumber);
    
    toast({
      title: "Reset Complete",
      description: "You can now reallocate a permit for this truck",
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
    return `${entry.number} - ${remainingText}L remaining`;
  };

  // Add new handler for editing allocation
  const handleEditAllocation = (allocation: PreAllocation) => {
    if (!allocation.quantity || allocation.quantity <= 0) {
      handleReallocation(allocation.truckNumber);
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

  // Update the pre-allocation card content
  const renderAllocationContent = (allocation: PreAllocation) => {
    // Early return if quantity is invalid
    if (!allocation.quantity || allocation.quantity <= 0) {
      return (
        <Button
          variant="ghost"
          onClick={() => handleReallocation(allocation.truckNumber)}
          className="text-red-500 hover:text-red-600"
        >
          Invalid - Click to Reset
        </Button>
      );
    }

    // Check if this allocation belongs to a truck that was changed
    const usedByDifferentTruck = loadedTrucks.find(truck => 
      truck.allocationId === allocation.id && truck.truckNumber !== allocation.truckNumber
    );

    if (usedByDifferentTruck) {
      return (
        <div className="flex items-center gap-2">
          <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
            Used by {usedByDifferentTruck.truckNumber}
          </Badge>
        </div>
      );
    }

    if (editingAllocation === allocation.id) {
      return (
        <div className="flex items-center gap-2">
          <Input
            type="number"
            value={editQuantity / 1000} // Convert to thousands for display
            onChange={(e) => setEditQuantity(Number(e.target.value) * 1000)} // Convert back to liters
            className="w-24"
            min="0"
            step="0.1"
          />
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleSaveAllocation(allocation)}
          >
            <Save className="h-4 w-4" />
          </Button>
        </div>
      );
    }

    return (
      <Button
        variant="ghost"
        onClick={() => handleEditAllocation(allocation)}
        className={!allocation.quantity ? 'text-red-500' : ''}
      >
        {((allocation.quantity || 0) / 1000).toFixed(1)}K
      </Button>
    );
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
                <div key={truck.truckId} className="flex flex-col sm:flex-row sm:items-center sm:justify-between p-4 border rounded-lg space-y-4 sm:space-y-0">
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
                    <Select
                      value={selectedPermitEntries[detail.id] || ''}
                      onValueChange={(value) => {
                        setSelectedPermitEntries(prev => ({
                          ...prev,
                          [detail.id]: value
                        }));
                      }}
                      onOpenChange={(open) => {
                        if (open) {
                          handlePermitEntrySelect(detail);
                        }
                      }}
                    >
                      <SelectTrigger className="w-full sm:w-[200px]">
                        <SelectValue placeholder="Select permit entry" />
                      </SelectTrigger>
                      <SelectContent>
                        {availableEntries.length === 0 ? (
                          <SelectItem value="none" disabled>
                            No available entries found
                          </SelectItem>
                        ) : (
                          availableEntries.map((entry) => (
                            <SelectItem key={entry.id} value={entry.id}>
                              {renderEntryOption(entry)}
                            </SelectItem>
                          ))
                        )}
                      </SelectContent>
                    </Select>
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
            <div className="mt-2">
              <Input
                placeholder="Search pre-allocations..."
                value={preAllocationSearch}
                onChange={(e) => setPreAllocationSearch(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {getFilteredPreAllocations().map((allocation) => (
                <div 
                  key={allocation.id} 
                  className={cn(
                    "group relative rounded-lg border bg-card hover:bg-accent/50 transition-colors",
                    manualCleanupMode && "cursor-pointer",
                    selectedForCleanup.includes(allocation.id) && "bg-red-50 dark:bg-red-950/20"
                  )}
                  onClick={() => {
                    if (!manualCleanupMode) return;
                    setSelectedForCleanup(prev => 
                      prev.includes(allocation.id) 
                        ? prev.filter(id => id !== allocation.id)
                        : [...prev, allocation.id]
                    );
                  }}
                >
                  {/* Mobile Layout */}
                  <div className="block sm:hidden p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-semibold text-base">
                          {allocation.truckNumber}
                        </div>
                        <div className="text-sm text-muted-foreground mt-1">
                          {allocation.owner}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => handleCopyPermit(allocation)}
                        className="h-8 w-8 p-0 opacity-70 hover:opacity-100"
                      >
                        <Copy className="h-4 w-4" />
                      </Button>
                    </div>
                    <div className="flex items-center justify-between pt-2 border-t">
                      <div className="space-y-1">
                        <div className="text-sm font-medium">
                          {allocation.product} • {renderAllocationContent(allocation)}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Permit: {allocation.permitNumber}
                        </div>
                      </div>
                      <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 whitespace-nowrap">
                        Pre-allocated
                      </span>
                    </div>
                  </div>

                  {/* Desktop Layout */}
                  <div className="hidden sm:flex sm:items-center sm:justify-between p-4">
                    <div>
                      <div className="font-medium">{allocation.truckNumber}</div>
                      <div className="text-sm text-muted-foreground">
                        {allocation.owner} - {allocation.product} - {renderAllocationContent(allocation)}
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-muted-foreground">
                        Permit: {allocation.permitNumber}
                      </span>
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleCopyPermit(allocation)}
                          className="h-8 w-8 p-0"
                        >
                          <Copy className="h-4 w-4" />
                        </Button>
                        <span className="px-2 py-1 rounded-full text-xs bg-yellow-100 text-yellow-800 whitespace-nowrap">
                          Pre-allocated
                        </span>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              {getFilteredPreAllocations().length === 0 && (
                <div className="text-center text-muted-foreground py-8">
                  {preAllocations.length === 0 ? 
                    "No pre-allocated permits" : 
                    "No matches found"
                  }
                </div>
              )}
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
