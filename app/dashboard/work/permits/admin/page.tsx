'use client'

import { useState, useEffect } from 'react'
import { getDatabase, ref, onValue, update, get } from 'firebase/database'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, Save, RefreshCw } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { ThemeToggle } from '@/components/theme-toggle'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { getStorage, ref as storageRef, getDownloadURL } from 'firebase/storage'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import { useProfileImage } from '@/hooks/useProfileImage'
import { Badge } from '@/components/ui/badge'

interface Entry {
  id: string;
  number: string;
  product: string;
  remainingQuantity: number;
  initialQuantity: number;
  destination: string;
  createdBy: string;
  timestamp: number;
}

// Add new interface for permit allocations
interface PermitAllocation {
  id: string;
  truckNumber: string;
  product: string;
  owner: string;
  permitEntryId: string;
  permitNumber: string;
  quantity: number;
  allocatedAt: string;
  used: boolean;
  usedAt?: string;
  actualTruckNumber?: string;
  previousTruckNumber?: string;
}

export default function AdminPage() {
  const router = useRouter();
  const { toast } = useToast();
  const [entries, setEntries] = useState<Entry[]>([]);
  const [editingEntry, setEditingEntry] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<number>(0);
  const { data: session, status } = useSession()
  const [searchTerm, setSearchTerm] = useState('')
  const [productFilter, setProductFilter] = useState('ALL')
  const profilePicUrl = useProfileImage()
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [ssdEntriesToFix, setSsdEntriesToFix] = useState<number>(0);
  // Add new state for permit allocations
  const [permitAllocations, setPermitAllocations] = useState<PermitAllocation[]>([]);
  const [truckChanges, setTruckChanges] = useState<{[permitId: string]: {oldTruck: string, newTruck: string}}>({}); 

  useEffect(() => {
    const db = getDatabase();
    const entriesRef = ref(db, 'allocations');
    
    const unsubscribe = onValue(entriesRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = Object.entries(snapshot.val()).map(([id, entry]: [string, any]) => ({
          id,
          ...entry
        }));
        setEntries(data);
      }
    });

    return () => unsubscribe();
  }, []);

  // Enhanced synchronization function specifically for SSD entries
  const syncSsdEntries = async () => {
    try {
      setIsSyncing(true);
      const db = getDatabase();
      
      // Get TR800 entries
      const tr800Ref = ref(db, 'tr800');
      const tr800Snapshot = await get(tr800Ref);
      const tr800Entries = tr800Snapshot.exists() ? tr800Snapshot.val() : {};

      // Get allocations
      const allocationsRef = ref(db, 'allocations');
      const allocationsSnapshot = await get(allocationsRef);
      const allocations = allocationsSnapshot.exists() ? allocationsSnapshot.val() : {};

      // Find mismatches and sync specifically for SSD entries
      const updates: { [key: string]: any } = {};
      let fixCount = 0;
      
      Object.entries(allocations).forEach(([key, alloc]: [string, any]) => {
        // Only process SSD entries
        if (alloc.destination?.toLowerCase() !== 'ssd') return;
        
        const tr800Entry = tr800Entries[key];
        if (!tr800Entry) {
          // Allocation exists but no TR800 entry - remove it or set to 0
          updates[`allocations/${key}`] = null;
          fixCount++;
        } else if (tr800Entry.remainingQuantity !== alloc.remainingQuantity) {
          // Quantities don't match - sync from TR800
          updates[`allocations/${key}/remainingQuantity`] = tr800Entry.remainingQuantity;
          fixCount++;
        }
      });

      // Also check for SSD entries in TR800 that are missing in allocations
      Object.entries(tr800Entries).forEach(([key, entry]: [string, any]) => {
        if (entry.destination?.toLowerCase() === 'ssd' && !allocations[key]) {
          // Found a TR800 SSD entry that's missing in allocations, add it
          updates[`allocations/${key}`] = entry;
          fixCount++;
        }
      });

      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
        setSsdEntriesToFix(0);
        toast({
          title: "SSD Sync Complete",
          description: `Fixed ${fixCount} SSD entries`,
        });
      } else {
        toast({
          title: "SSD Entries Verified",
          description: "All SSD entries are in sync",
        });
      }
      
      setLastSyncTime(new Date());

    } catch (error) {
      console.error('SSD Sync error:', error);
      toast({
        title: "Sync Error",
        description: "Failed to synchronize SSD entries",
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  // Add manual sync button
  const handleManualSync = () => {
    syncSsdEntries();
  };

  // Setup periodic checks
  useEffect(() => {
    // Initial check
    syncSsdEntries();
    
    // Check every 5 minutes (300000 ms)
    const syncInterval = setInterval(syncSsdEntries, 300000);
    
    // Periodic check for SSD entries that need fixing
    const checkInterval = setInterval(async () => {
      try {
        const db = getDatabase();
        
        // Get TR800 entries
        const tr800Ref = ref(db, 'tr800');
        const tr800Snapshot = await get(tr800Ref);
        const tr800Entries = tr800Snapshot.exists() ? tr800Snapshot.val() : {};

        // Get allocations
        const allocationsRef = ref(db, 'allocations');
        const allocationsSnapshot = await get(allocationsRef);
        const allocations = allocationsSnapshot.exists() ? allocationsSnapshot.val() : {};

        // Count mismatches
        let count = 0;
        
        Object.entries(allocations).forEach(([key, alloc]: [string, any]) => {
          if (alloc.destination?.toLowerCase() !== 'ssd') return;
          
          const tr800Entry = tr800Entries[key];
          if (!tr800Entry || tr800Entry.remainingQuantity !== alloc.remainingQuantity) {
            count++;
          }
        });
        
        setSsdEntriesToFix(count);
        
      } catch (error) {
        console.error('SSD check error:', error);
      }
    }, 60000); // Check every minute
    
    return () => {
      clearInterval(syncInterval);
      clearInterval(checkInterval);
    };
  }, []);

  const handleVolumeUpdate = async (entry: Entry, newVolume: number) => {
    if (newVolume < 0) {
      toast({
        title: "Error",
        description: "Volume cannot be negative",
        variant: "destructive"
      });
      return;
    }

    try {
      const db = getDatabase();
      const entryRef = ref(db, `allocations/${entry.id}`);
      
      await update(entryRef, {
        remainingQuantity: newVolume
      });

      toast({
        title: "Success",
        description: `Volume updated to ${newVolume.toLocaleString()}L`
      });
      setEditingEntry(null);
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update volume",
        variant: "destructive"
      });
    }
  };

  // Update the handleSave function to use the new volume update
  const handleSave = async (entry: Entry) => {
    if (!editingEntry) return;
    await handleVolumeUpdate(entry, editValue);
  };

  // Add filter function
  const getFilteredEntries = () => {
    return entries.filter(entry => {
      const matchesSearch = searchTerm === '' || 
        entry.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.createdBy.toLowerCase().includes(searchTerm.toLowerCase());
      
      const matchesProduct = productFilter === 'ALL' || 
        entry.product.toUpperCase() === productFilter;

      return matchesSearch && matchesProduct;
    });
  };

  // Add useEffect to fetch permit allocations
  useEffect(() => {
    const db = getDatabase();
    const allocationsRef = ref(db, 'permitPreAllocations');
    
    const unsubscribe = onValue(allocationsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = Object.entries(snapshot.val()).map(([id, alloc]: [string, any]) => ({
          id,
          ...alloc
        }));
        
        // Track truck changes
        const changes: {[permitId: string]: {oldTruck: string, newTruck: string}} = {};
        data.forEach(alloc => {
          if (alloc.previousTruckNumber && alloc.actualTruckNumber && 
              alloc.previousTruckNumber !== alloc.actualTruckNumber) {
            changes[alloc.id] = {
              oldTruck: alloc.previousTruckNumber,
              newTruck: alloc.actualTruckNumber
            };
          }
        });
        
        setTruckChanges(changes);
        setPermitAllocations(data);
      }
    });

    return () => unsubscribe();
  }, []);

  // Add function to track truck number changes in permits
  const monitorTruckChanges = async () => {
    try {
      const db = getDatabase();
      const workDetailsRef = ref(db, 'work_details');
      const workSnapshot = await get(workDetailsRef);
      
      if (!workSnapshot.exists()) return;
      
      const updates: { [key: string]: any } = {};
      
      // Check each loaded truck with previous trucks
      Object.entries(workSnapshot.val()).forEach(([id, detail]: [string, any]) => {
        if (detail.loaded && detail.previous_trucks && detail.previous_trucks.length > 0) {
          // This truck was renamed, check if it has a permit allocation
          const previousTruck = detail.previous_trucks[detail.previous_trucks.length - 1];
          
          // Find permit allocations for the previous truck number
          permitAllocations.forEach(alloc => {
            if (alloc.truckNumber === previousTruck && !alloc.previousTruckNumber) {
              // Update the permit allocation
              updates[`permitPreAllocations/${alloc.id}/actualTruckNumber`] = detail.truck_number;
              updates[`permitPreAllocations/${alloc.id}/previousTruckNumber`] = previousTruck;
            }
          });
        }
      });
      
      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
        toast({
          title: "Truck Changes Updated",
          description: `Updated ${Object.keys(updates).length} permit allocations with truck changes`,
        });
      }
    } catch (error) {
      console.error('Error monitoring truck changes:', error);
      toast({
        title: "Error",
        description: "Failed to update truck changes",
        variant: "destructive"
      });
    }
  };

  // Add this to your render
  const renderPermitAllocationsSection = () => {
    if (permitAllocations.length === 0) return null;
    
    // Get only allocations with truck changes
    const changedAllocations = permitAllocations.filter(
      alloc => alloc.previousTruckNumber && alloc.actualTruckNumber
    );
    
    if (changedAllocations.length === 0) return null;
    
    return (
      <Card className="mb-6">
        <CardHeader>
          <CardTitle>Truck Number Changes in Permits</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {changedAllocations.map(alloc => (
              <div key={alloc.id} className="p-3 border rounded-lg bg-amber-50">
                <div className="font-medium">{alloc.product} Permit: {alloc.permitNumber}</div>
                <div className="flex items-center gap-2 text-sm">
                  <span className="text-red-500 line-through">{alloc.previousTruckNumber}</span>
                  <span>→</span>
                  <span className="text-green-600 font-medium">{alloc.actualTruckNumber}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {alloc.used ? 'Used' : 'Not used'} • Allocated to: {alloc.owner}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  return (
    <div className="min-h-screen">
      {/* Header with sync info */}
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-2 py-2">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => router.back()}
                  className="h-8 w-8"
                >
                  <ArrowLeft className="h-4 w-4" />
                </Button>
                <h1 className="text-sm font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent truncate max-w-[150px] sm:max-w-none sm:text-base">
                  Entry Management
                </h1>
              </div>

              <div className="flex items-center gap-2">
                {ssdEntriesToFix > 0 && (
                  <Badge variant="destructive" className="animate-pulse">
                    {ssdEntriesToFix} SSD {ssdEntriesToFix === 1 ? 'entry' : 'entries'} need sync
                  </Badge>
                )}
                
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={handleManualSync}
                  disabled={isSyncing}
                  className="flex items-center gap-2"
                >
                  {isSyncing ? (
                    <RefreshCw className="h-3 w-3 animate-spin" />
                  ) : (
                    <RefreshCw className="h-3 w-3" />
                  )}
                  Sync SSD Entries
                </Button>
                
                {lastSyncTime && (
                  <div className="text-xs text-muted-foreground hidden sm:block">
                    Last sync: {lastSyncTime.toLocaleTimeString()}
                  </div>
                )}
                
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
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-28 sm:pt-24 pb-6 sm:pb-8">
        {/* Render permit allocations section */}
        {renderPermitAllocationsSection()}

        {/* Search and Filter Controls */}
        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              placeholder="Search by number or creator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1"
            />
            <Select
              value={productFilter}
              onValueChange={setProductFilter}
            >
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Filter Product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Products</SelectItem>
                <SelectItem value="AGO">AGO</SelectItem>
                <SelectItem value="PMS">PMS</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Add a button to monitor truck changes */}
        <div className="mb-6">
          <Button 
            variant="outline" 
            onClick={monitorTruckChanges}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Check Truck Changes
          </Button>
        </div>

        {/* Entries Grid */}
        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {getFilteredEntries().map(entry => (
            <Card key={entry.id} className="hover:shadow-md transition-shadow">
              <CardHeader>
                <CardTitle className="flex justify-between items-center">
                  <span>{entry.number}</span>
                  <span className={`text-sm font-normal px-2 py-1 rounded-full ${
                    entry.product === 'AGO' 
                      ? 'bg-blue-100 text-blue-800' 
                      : 'bg-green-100 text-green-800'
                  }`}>
                    {entry.product}
                  </span>
                </CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  <div className="flex justify-between">
                    <span>Initial:</span>
                    <span>{entry.initialQuantity.toLocaleString()}L</span>
                  </div>
                  <div className="flex justify-between items-center">
                    <span>Remaining:</span>
                    {editingEntry === entry.id ? (
                      <div className="flex items-center gap-2">
                        <Input
                          type="number"
                          value={editValue}
                          onChange={(e) => setEditValue(Number(e.target.value))}
                          className="w-32"
                        />
                        <Button
                          size="sm"
                          onClick={() => handleSave(entry)}
                        >
                          <Save className="h-4 w-4" />
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setEditingEntry(entry.id);
                          setEditValue(entry.remainingQuantity);
                        }}
                      >
                        {entry.remainingQuantity.toLocaleString()}L
                      </Button>
                    )}
                  </div>
                  <div className="text-sm text-muted-foreground">
                    Created by: {entry.createdBy}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </main>
    </div>
  );
}
