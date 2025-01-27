'use client'

import { useState, useEffect, useCallback } from 'react'
import { getDatabase, ref, onValue, get } from 'firebase/database'
import { useSession } from 'next-auth/react'
import { useRouter } from 'next/navigation'
import { motion } from 'framer-motion'
import { ArrowLeft, RefreshCw, Copy, Circle } from 'lucide-react'
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { preAllocatePermitEntry } from '@/lib/permit-allocation'
import type { PermitAllocation, PreAllocation } from '@/types/permits' // Add this line
import { findAvailablePermitEntries, type EntryAllocation } from '@/utils/permit-helpers';
import { cleanupOrphanedAllocations, consolidatePermitAllocations } from '@/lib/permit-allocation';
import { cleanupDuplicateAllocations, validateAllocations } from '@/lib/permit-cleanup';
import { resetPermitSystem } from '@/lib/permit-reset';

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

export default function PermitsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { toast } = useToast()
  const [permits, setPermits] = useState<{ [key: string]: PermitAllocation }>({})
  const [searchTerm, setSearchTerm] = useState('')
  const [isRefreshing, setIsRefreshing] = useState(false)
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
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

  const fetchPendingPermits = async () => {
    const db = getDatabase()
    const [workDetailsRef, preAllocationsRef] = await Promise.all([
      get(ref(db, 'work_details')),
      get(ref(db, 'permitPreAllocations'))
    ]);
    
    if (workDetailsRef.exists()) {
      // Get all pre-allocations first
      const existingAllocations = preAllocationsRef.exists() 
        ? Object.values(preAllocationsRef.val()).map((pa: any) => pa.truckNumber)
        : [];

      // Filter work details to exclude already allocated trucks
      const details = Object.entries(workDetailsRef.val())
        .map(([id, detail]: [string, any]) => ({
          id,
          ...detail,
          permitRequired: detail.destination?.toLowerCase() === 'ssd',
        }))
        .filter((detail: ExtendedWorkDetail) => 
          detail.permitRequired && 
          !detail.loaded && 
          detail.status === 'queued' &&
          !detail.permitAllocated && // Check permitAllocated flag
          !existingAllocations.includes(detail.truck_number) // Exclude trucks that already have allocations
        );
      
      setPendingPermits(details);
    }
  }

  const fetchAvailableEntries = async (product: string, quantity: number) => {
    const db = getDatabase();
    const allocationsRef = ref(db, 'allocations');
    
    try {
      const snapshot = await get(allocationsRef);
      console.log('Raw allocations data:', snapshot.val());

      if (snapshot.exists()) {
        const entries = Object.entries(snapshot.val())
          .map(([id, data]: [string, any]) => ({
            id,
            ...data
          }))
          .filter(entry => {
            console.log('Filtering entry:', {
              entry,
              productMatch: entry.product?.toLowerCase() === product.toLowerCase(),
              quantityMatch: entry.remainingQuantity >= parseFloat(quantity.toString()),
              destinationMatch: entry.destination?.toLowerCase() === 'ssd'
            });

            return (
              entry.product?.toLowerCase() === product.toLowerCase() &&
              entry.remainingQuantity >= parseFloat(quantity.toString()) &&
              entry.destination?.toLowerCase() === 'ssd'
            );
          })
          .sort((a, b) => a.timestamp - b.timestamp);

        console.log('Filtered entries:', entries);
        setAvailableEntries(entries);

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
      console.error('Error fetching allocations:', error);
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

    if (workDetail.permitAllocated) {
      toast({
        title: "Error",
        description: "This truck already has a permit allocated",
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

    // Add quantity validation
    const requiredQuantity = parseFloat(workDetail.quantity);
    if (permitEntry.remainingQuantity < requiredQuantity) {
      toast({
        title: "Error",
        description: `Permit entry has insufficient quantity. Required: ${requiredQuantity}, Available: ${permitEntry.remainingQuantity}`,
        variant: "destructive"
      });
      return;
    }

    setAllocatingPermit(true);
    const db = getDatabase();

    try {
      const result = await preAllocatePermitEntry(
        db,
        workDetail.truck_number,
        workDetail.product,
        workDetail.owner,
        selectedEntry,
        permitEntry.number
      );

      if (result) {
        toast({
          title: "Success",
          description: `Permit pre-allocated for truck ${workDetail.truck_number}`,
        });

        // Clear only this truck's selection after successful allocation
        setSelectedPermitEntries(prev => {
          const updated = { ...prev };
          delete updated[workDetail.id];
          return updated;
        });
        setSelectedTruck(null);
        // Update local states
        fetchPendingPermits();
        fetchAvailableEntries(workDetail.product, requiredQuantity);
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to allocate permit",
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
    if (!preAllocationSearch) return preAllocations;
    
    const searchLower = preAllocationSearch.toLowerCase();
    return preAllocations.filter(allocation => 
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
    
    // First, log current state
    const preAllocationsRef = ref(db, 'permitPreAllocations');
    const snapshot = await get(preAllocationsRef);
    console.log('Current pre-allocations:', snapshot.val());
    
    // Run cleanup
    const result = await cleanupDuplicateAllocations(db);
    console.log('Cleanup completed:', result);
    
    if (result.duplicatesRemoved > 0 || result.consolidated > 0) {
      toast({
        title: "Cleanup Complete",
        description: `Removed ${result.duplicatesRemoved} duplicates and consolidated ${result.consolidated} allocations`,
      });
    } else {
      toast({
        title: "No Issues Found",
        description: "No duplicate allocations were found",
      });
    }

    // Validate after cleanup
    const validationErrors = await validateAllocations(db);
    if (validationErrors.length > 0) {
      console.log('Validation errors:', validationErrors);
      toast({
        title: "Validation Warnings",
        description: validationErrors.join('\n'),
        variant: "destructive"
      });
    }

    // Refresh data
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
                              {entry.number} - {entry.remainingQuantity.toLocaleString()}L
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
            <CardTitle className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent flex items-center justify-between">
              <span>Pre-Allocated Permits</span>
              <span className="text-sm font-normal text-muted-foreground">
                {getFilteredPreAllocations().length} Active
              </span>
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
                  className="group relative rounded-lg border bg-card hover:bg-accent/50 transition-colors"
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
                          {allocation.product} • {(allocation.quantity / 1000).toFixed(0)}K
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
                        {allocation.owner} - {allocation.product} - {(allocation.quantity / 1000).toFixed(0)}K
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
