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
import { Switch } from '@/components/ui/switch'
import { Label } from '@/components/ui/label'

interface Entry {
  id: string;
  number: string;
  product: string;
  destination: string; // Ensure this property is defined
  remainingQuantity: number;
  initialQuantity: number;
  allocated: boolean;
  timestamp: number;
}

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
  destination: string;
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
  const [destinationFilter, setDestinationFilter] = useState('ALL')
  const [showWithBalanceOnly, setShowWithBalanceOnly] = useState(false)
  const profilePicUrl = useProfileImage()
  const [isSyncing, setIsSyncing] = useState(false);
  const [lastSyncTime, setLastSyncTime] = useState<Date | null>(null);
  const [ssdEntriesToFix, setSsdEntriesToFix] = useState<number>(0);
  const [permitAllocations, setPermitAllocations] = useState<PermitAllocation[]>([]);
  const [truckChanges, setTruckChanges] = useState<{[permitId: string]: {oldTruck: string, newTruck: string}}>({}); 
  const [showTruckChanges, setShowTruckChanges] = useState(false);
  const [truckChangeCount, setTruckChangeCount] = useState(0);
  const [keyComboCount, setKeyComboCount] = useState(0);

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

  const syncAllEntriesData = async () => {
    try {
      setIsSyncing(true);
      const db = getDatabase();

      // First, let's get all existing allocations for all destinations
      const allocationsRef = ref(db, 'allocations');
      const allocationsSnapshot = await get(allocationsRef);
      const allocations = allocationsSnapshot.exists() ? allocationsSnapshot.val() : {};

      // Ensure we are synchronizing allocations for SSD entries
      // This is for backward compatibility
      const tr800Ref = ref(db, 'tr800');
      const tr800Snapshot = await get(tr800Ref);
      const tr800Entries = tr800Snapshot.exists() ? tr800Snapshot.val() : {};

      // Find mismatches and sync for all destinations
      const updates: { [key: string]: any } = {};
      let fixCount = 0;
      
      Object.entries(allocations).forEach(([key, alloc]: [string, any]) => {
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

      // Also check for entries in TR800 that are missing in allocations
      Object.entries(tr800Entries).forEach(([key, entry]: [string, any]) => {
        if (!allocations[key]) {
          // Found a TR800 entry that's missing in allocations, add it
          updates[`allocations/${key}`] = entry;
          fixCount++;
        }
      });

      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
        setSsdEntriesToFix(0);
        toast({
          title: "Sync Complete",
          description: `Fixed ${fixCount} entries`,
        });
      } else {
        toast({
          title: "Entries Verified",
          description: "All entries are in sync",
        });
      }
      
      setLastSyncTime(new Date());

    } catch (error) {
      console.error('Sync error:', error);
      toast({
        title: "Sync Error",
        description: "Failed to synchronize entries",
        variant: "destructive"
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleManualSync = () => {
    syncAllEntriesData();
  };

  useEffect(() => {
    syncAllEntriesData();
    
    const syncInterval = setInterval(syncAllEntriesData, 300000);
    
    const checkInterval = setInterval(async () => {
      try {
        const db = getDatabase();
        
        const tr800Ref = ref(db, 'tr800');
        const tr800Snapshot = await get(tr800Ref);
        const tr800Entries = tr800Snapshot.exists() ? tr800Snapshot.val() : {};

        const allocationsRef = ref(db, 'allocations');
        const allocationsSnapshot = await get(allocationsRef);
        const allocations = allocationsSnapshot.exists() ? allocationsSnapshot.val() : {};

        let count = 0;
        
        Object.entries(allocations).forEach(([key, alloc]: [string, any]) => {
          const tr800Entry = tr800Entries[key];
          if (!tr800Entry || tr800Entry.remainingQuantity !== alloc.remainingQuantity) {
            count++;
          }
        });
        
        setSsdEntriesToFix(count);
      } catch (error) {
        console.error('Check error:', error);
      }
    }, 60000);
    
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

  const handleSave = async (entry: Entry) => {
    if (!editingEntry) return;
    await handleVolumeUpdate(entry, editValue);
  };

  const getFilteredEntries = () => {
    return entries.filter(entry => {
      // Handle undefined destination gracefully
      const entryDestination = entry.destination || '';
      
      // Check if the entry should be filtered by destination
      const matchesDestination = destinationFilter === 'ALL' || 
        entryDestination.toLowerCase() === destinationFilter.toLowerCase();
      
      // Check if the entry matches the search term
      const matchesSearch = !searchTerm || 
        entry.number.toLowerCase().includes(searchTerm.toLowerCase()) || 
        entry.product.toLowerCase().includes(searchTerm.toLowerCase());
      
      // Filter by products if applicable
      const matchesProduct = productFilter === 'ALL' || 
        entry.product.toUpperCase() === productFilter.toUpperCase();
      
      // Filter by balance if applicable
      const matchesBalance = !showWithBalanceOnly || entry.remainingQuantity > 0;
      
      return matchesDestination && matchesSearch && matchesProduct && matchesBalance;
    });
  };

  useEffect(() => {
    const db = getDatabase();
    const allocationsRef = ref(db, 'permitPreAllocations');
    
    const unsubscribe = onValue(allocationsRef, (snapshot) => {
      if (snapshot.exists()) {
        const data = Object.entries(snapshot.val()).map(([id, alloc]: [string, any]) => ({
          id,
          ...alloc,
          destination: alloc.destination || 'ssd'
        }));
        
        const changes: {[permitId: string]: {oldTruck: string, newTruck: string}} = {};
        let changeCount = 0;
        
        data.forEach(alloc => {
          if (alloc.previousTruckNumber && alloc.actualTruckNumber && 
              alloc.previousTruckNumber !== alloc.actualTruckNumber) {
            changes[alloc.id] = {
              oldTruck: alloc.previousTruckNumber,
              newTruck: alloc.actualTruckNumber
            };
            changeCount++;
          }
        });
        
        setTruckChanges(changes);
        setTruckChangeCount(changeCount);
        setPermitAllocations(data);
      }
    });

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.altKey && e.key === 't') {
        setShowTruckChanges(prev => !prev);
        toast({
          title: showTruckChanges ? "Truck Changes Hidden" : "Truck Changes Visible",
          description: showTruckChanges ? 
            "Press Alt+T to show them again" : 
            `Showing ${truckChangeCount} truck number changes`,
        });
      }
      
      if (e.key === 'h') {
        setKeyComboCount(prev => {
          const newCount = prev + 1;
          if (newCount === 3) {
            setShowTruckChanges(prevShow => !prevShow);
            toast({
              title: showTruckChanges ? "Truck Changes Hidden" : "Truck Changes Visible",
              description: `Press H three times to toggle visibility (${truckChangeCount} changes)`,
            });
            return 0;
          }
          return newCount;
        });
        
        setTimeout(() => setKeyComboCount(0), 1000);
      }
    };

    window.addEventListener('keydown', handleKeyDown);

    return () => {
      unsubscribe();
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [showTruckChanges, truckChangeCount, toast]);

  const monitorTruckChanges = async () => {
    try {
      const db = getDatabase();
      const workDetailsRef = ref(db, 'work_details');
      const workSnapshot = await get(workDetailsRef);
      
      if (!workSnapshot.exists()) return;
      
      const updates: { [key: string]: any } = {};
      
      Object.entries(workSnapshot.val()).forEach(([id, detail]: [string, any]) => {
        if (detail.loaded && detail.previous_trucks && detail.previous_trucks.length > 0) {
          const previousTruck = detail.previous_trucks[detail.previous_trucks.length - 1];
          
          permitAllocations.forEach(alloc => {
            if (alloc.truckNumber === previousTruck && !alloc.previousTruckNumber) {
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

  const renderPermitAllocationsSection = () => {
    if (!showTruckChanges) return null;
    
    const changedAllocations = permitAllocations.filter(
      alloc => alloc.previousTruckNumber && alloc.actualTruckNumber
    );
    
    if (changedAllocations.length === 0) return null;
    
    return (
      <Card className="mb-6 border-emerald-500/20">
        <CardHeader>
          <div className="flex justify-between items-center">
            <CardTitle className="text-lg font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Truck Number Changes in Permits
            </CardTitle>
            <Button 
              variant="outline" 
              size="sm" 
              onClick={() => setShowTruckChanges(false)}
              className="text-xs"
            >
              Hide
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {changedAllocations.map(alloc => (
              <div 
                key={alloc.id} 
                className="p-3 border rounded-lg bg-muted/20 dark:bg-muted/10 hover:bg-muted/30 transition-colors"
              >
                <div className="font-medium">{alloc.product} Permit: {alloc.permitNumber}</div>
                <div className="flex items-center gap-2 text-sm mt-1">
                  <span className="text-rose-500 dark:text-rose-400 line-through">{alloc.previousTruckNumber}</span>
                  <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground">
                    <path d="M5 12h14"></path>
                    <path d="m12 5 7 7-7 7"></path>
                  </svg>
                  <span className="text-emerald-600 dark:text-emerald-400 font-medium">{alloc.actualTruckNumber}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center justify-between">
                  <span>
                    {alloc.used ? 'Used' : 'Not used'} • Allocated to: {alloc.owner}
                  </span>
                  <span className="text-muted-foreground text-xs">
                    {new Date(alloc.allocatedAt).toLocaleDateString()} {new Date(alloc.allocatedAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  };

  const renderPermitEntry = (entry: Entry) => {
    return (
      <div className="border rounded-md p-4 mb-4">
        <div className="flex justify-between mb-2">
          <span className="text-lg font-semibold">{entry.number}</span>
          <Badge variant="outline">{(entry.destination || 'UNKNOWN').toUpperCase()}</Badge>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <span className="text-sm text-gray-500">Product:</span>
            <div>{entry.product}</div>
          </div>
          <div>
            <span className="text-sm text-gray-500">Initial Quantity:</span>
            <div>{entry.initialQuantity?.toLocaleString() || 0} litres</div>
          </div>
          <div>
            <span className="text-sm text-gray-500">Remaining Quantity:</span>
            <div>{entry.remainingQuantity?.toLocaleString() || 0} litres</div>
          </div>
          <div>
            <span className="text-sm text-gray-500">Date:</span>
            <div>{new Date(entry.timestamp || 0).toLocaleDateString()}</div>
          </div>
        </div>
        <div className="flex justify-end space-x-2">
          {/* ... existing buttons ... */}
        </div>
      </div>
    );
  };

  const renderPermitAllocation = (allocation: PermitAllocation) => {
    return (
      <div className="border rounded-md p-4 mb-4">
        <div className="flex justify-between mb-2">
          <span className="text-lg font-semibold">{allocation.truckNumber}</span>
          <div className="flex items-center gap-2">
            <Badge>{allocation.product}</Badge>
            {allocation.destination && (
              <Badge 
                variant={
                  allocation.destination?.toLowerCase() === 'ssd' ? 'default' : 
                  allocation.destination?.toLowerCase() === 'drc' ? 'secondary' : 
                  'outline'
                }
              >
                {allocation.destination.toUpperCase()}
              </Badge>
            )}
          </div>
        </div>
        <div className="grid grid-cols-2 gap-2 mb-4">
          <div>
            <span className="text-sm text-gray-500">Owner:</span>
            <div>{allocation.owner}</div>
          </div>
          <div>
            <span className="text-sm text-gray-500">Quantity:</span>
            <div>{allocation.quantity.toLocaleString()} litres</div>
          </div>
          <div>
            <span className="text-sm text-gray-500">Date:</span>
            <div>{new Date(allocation.allocatedAt).toLocaleDateString()}</div>
          </div>
          <div>
            <span className="text-sm text-gray-500">Status:</span>
            <div>{allocation.used ? 'Used' : 'Not Used'}</div>
          </div>
        </div>
        <div className="flex justify-end space-x-2">
          {/* ... existing buttons ... */}
        </div>
      </div>
    );
  };

  return (
    <>
      <div className="min-h-screen">
        <header className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl">
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
                  {ssdEntriesToFix} {ssdEntriesToFix === 1 ? 'entry' : 'entries'} need sync
                </Badge>
              )}

              {truckChangeCount > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setShowTruckChanges(prev => !prev)}
                  className="flex items-center gap-1"
                >
                  <Badge variant="outline" className={showTruckChanges ? "bg-emerald-100 dark:bg-emerald-900" : ""}>
                    {truckChangeCount}
                  </Badge>
                  <span className="hidden sm:inline">truck changes</span>
                </Button>
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
                Sync Entries
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
                    className="h-8 w-8" />
                  <AvatarFallback className="text-xs">
                    {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
        </div>
      </header>
    <main className="max-w-7xl mx-auto px-2 sm:px-4 pt-28 sm:pt-24 pb-6 sm:pb-8">
        {renderPermitAllocationsSection()}

        <div className="mb-6 space-y-4">
          <div className="flex flex-col sm:flex-row gap-4">
            <Input
              placeholder="Search by number or creator..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1" />
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
            <Select
              value={destinationFilter}
              onValueChange={setDestinationFilter}
            >
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Filter Destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Destinations</SelectItem>
                <SelectItem value="ssd">SSD</SelectItem>
                <SelectItem value="local">LOCAL</SelectItem>
                <SelectItem value="drc">DRC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center space-x-2">
            <Switch 
              id="balance-filter" 
              checked={showWithBalanceOnly}
              onCheckedChange={setShowWithBalanceOnly}
            />
            <Label htmlFor="balance-filter" className="cursor-pointer">
              Show entries with balance only
            </Label>
            <Badge 
              variant="outline" 
              className={showWithBalanceOnly ? "bg-green-100 dark:bg-green-900/30" : ""}
            >
              {getFilteredEntries().length} entries
            </Badge>
          </div>
        </div>

        <div className="mb-6 flex flex-wrap gap-2">
          {!showTruckChanges && truckChangeCount > 0 && (
            <Button
              variant={showTruckChanges ? "default" : "outline"}
              onClick={() => setShowTruckChanges(true)}
              className="flex items-center gap-2"
            >
              <Badge variant="outline">
                {truckChangeCount}
              </Badge>
              Show Truck Changes
            </Button>
          )}

          <Button
            variant="outline"
            onClick={monitorTruckChanges}
          >
            <RefreshCw className="mr-2 h-4 w-4" />
            Check Truck Changes
          </Button>

          <div className="text-xs text-muted-foreground ml-auto self-center hidden sm:block">
            Tip: Press Alt+T to toggle truck changes visibility
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {getFilteredEntries().map((entry) => (
            <div key={entry.id || `entry-${entry.number}-${Date.now()}`}>
              {renderPermitEntry(entry)}
            </div>
          ))}
        </div>
    </main>
      </div>
    </>
  );
}
