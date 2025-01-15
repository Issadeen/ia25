'use client'

import { useState, useEffect, useRef, useCallback } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { 
  ArrowLeft,
  ArrowUp, // Add this
  Sun,
  Moon,
  FileText,
  PieChart,
  AlertTriangle,
  RefreshCw,
  Loader2,
  ClipboardList,
  ChevronDown, 
  ChevronUp,
  Search // Add this
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getDatabase, ref as dbRef, get, query, orderByChild, equalTo, update, push, remove } from 'firebase/database'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from "@/components/ui/use-toast"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Input } from "@/components/ui/input"
import { storage } from "@/lib/firebase"
import { getDownloadURL, ref as storageRef } from "firebase/storage"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { validateAllocation } from '@/lib/validation'
import { smartAllocation } from '@/lib/smartAllocation'
import { confirmDialog } from "@/components/ui/confirm-dialog" // Add this line
import { reminderService } from '@/lib/reminders' // Add this line
import { StockItem } from '@/types/stock';
import { Entry } from "@/types/entries"

// Add new constants at the top of the file
const WARNING_TIMEOUT = 9 * 60 * 1000; // 9 minutes
const LOGOUT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

// Add new interface for pending orders
interface PendingOrderSummary {
  product: string;
  destination: string;
  totalQuantity: number;
  orders: {
    truckNumber: string;
    quantity: number;
    orderno: string;
    owner: string; // Add this line
  }[];
}

// Add this interface with your other interfaces
interface AllocationReport {
  truckNumber: string;
  volume: string;
  at20: string;
  owner: string;
  product: string;
  entryUsed: string;
  allocationDate: string;
  entryDestination: string;
}

// Add new interface for selected entry with volume
interface SelectedEntryWithVolume {
  entryKey: string;
  allocatedVolume: number;
}

// Add to your existing interfaces
interface Summary {
  productDestination: string;
  remainingQuantity: number;
  estimatedTrucks: number;
  motherEntries: { 
    number: string; 
    remainingQuantity: number;
    timestamp: number; // Add timestamp
    creationDate: string; // Add this
    ageInDays: number;    // Add this
    usageCount: number;   // Add this
  }[];
}

export default function EntriesPage() {
  // Add highlightText inside the component
  const highlightText = useCallback((text: string, filter: string) => {
    if (!filter) return text;
    const textStr = String(text);
    const regex = new RegExp(`(${filter})`, 'gi');
    const parts = textStr.split(regex);
    return parts.map((part, i) => 
      regex.test(part) ? (
        <span key={i} className="bg-yellow-200 dark:bg-yellow-900 rounded px-1">
          {part}
        </span>
      ) : part
    );
  }, []);

  // Add to existing state declarations
  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');

  // 1. State hooks
  const [mounted, setMounted] = useState(false)
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
  const [truckNumber, setTruckNumber] = useState('')
  const [destination, setDestination] = useState('')
  const [product, setProduct] = useState('')
  const [at20Quantity, setAt20Quantity] = useState('')
  const [lastFormState, setLastFormState] = useState({
    truckNumber: '',
    destination: '',
    product: '',
    at20Quantity: ''
  })
  const [entriesUsedInPermits, setEntriesUsedInPermits] = useState<Entry[]>([])
  interface Entry {
    key: string; // Add this line
    motherEntry: string;
    initialQuantity: number;
    remainingQuantity: number;
    truckNumber?: string;
    destination: string;
    subtractedQuantity: number;
    status?: string;  // Add this line
    number: string;
    product: string;
    product_destination: string;
    timestamp: number;
    permitNumber?: string; // Add this line
  }

  const [entriesData, setEntriesData] = useState<Entry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [originalData, setOriginalData] = useState<{[key: string]: Entry}>({})
  const [showSummary, setShowSummary] = useState(false)
  const [showUsage, setShowUsage] = useState(false)
  const [summaryData, setSummaryData] = useState<Summary[]>([])
  interface UsageEntry {
    key: string;  // Add this line
    number: string;
    initialQuantity: number;
    remainingQuantity: number;
    product: string;
    destination: string;
    usedBy: { truckNumber: string; quantity: number }[];
  }

  const [usageData, setUsageData] = useState<UsageEntry[]>([])
  const [usageFilters, setUsageFilters] = useState({
    entryNumber: '',
    product: '',
    destination: '',
    truck: ''
  })

  // Add error state at the top with other state declarations
  const [error, setError] = useState<string | null>(null)

  // Add new state for volume warning
  const [volumeWarning, setVolumeWarning] = useState<string | null>(null)

  // Add these new state declarations with the other states
  const [editMode, setEditMode] = useState<string | null>(null)
  const [workIdDialogOpen, setWorkIdDialogOpen] = useState(false)
  const [workId, setWorkId] = useState("")
  const [tempEditValue, setTempEditValue] = useState("")
  const [pendingEdit, setPendingEdit] = useState<{
    entryId: string;
    newValue: string;
  } | null>(null)

  // Add new state for verification loading
  const [isVerifying, setIsVerifying] = useState(false)

  // Add new state for pending orders
  const [pendingOrders, setPendingOrders] = useState<PendingOrderSummary[]>([])
  const [isPendingLoading, setIsPendingLoading] = useState(false)

  // Add new state for showing pending orders
  const [showPendingOrders, setShowPendingOrders] = useState(false)

  // Remove the permitNumber state
  // const [permitNumber, setPermitNumber] = useState('')

  // Add new state for entry used in permit
  const [entryUsedInPermit, setEntryUsedInPermit] = useState('')

  // Add state for manual allocation
  const [showManualAllocation, setShowManualAllocation] = useState(false)
  const [selectedEntries, setSelectedEntries] = useState<string[]>([])
  const [availableEntries, setAvailableEntries] = useState<Entry[]>([])

  // Add this with other state declarations
  const [currentView, setCurrentView] = useState<'default' | 'summary' | 'usage' | 'manual'>('default')

  // Add new state for available permit entries
  const [availablePermitEntries, setAvailablePermitEntries] = useState<Entry[]>([])

  // Add this state near other state declarations
  const [showMobileMenu, setShowMobileMenu] = useState(false)

  // Add this warning modal state
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [warningMessage, setWarningMessage] = useState("")

  // Add to existing state declarations
  const [stocks, setStocks] = useState<{ ago: StockItem; pms: StockItem } | null>(null);
  const [editingStock, setEditingStock] = useState<'ago' | 'pms' | null>(null);
  const [tempStockValue, setTempStockValue] = useState('');

  // Add new state for warnings
  const [quantityWarnings, setQuantityWarnings] = useState<{
    [key: string]: { 
      shortage: number;
      pendingQuantity: number;
      availableQuantity: number;
      shortageQuantity: number;
    }
  }>({});

  // Add new state for showing note
  const [showNote, setShowNote] = useState(true);

  // Add new state for auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // Add new state for scroll button
  const [showScrollTop, setShowScrollTop] = useState(false);

  // Add to existing state declarations
  const [selectedEntriesWithVolumes, setSelectedEntriesWithVolumes] = useState<SelectedEntryWithVolume[]>([]);
  const [remainingRequired, setRemainingRequired] = useState<number>(0);

  // Add near other state declarations
  const [summarySearch, setSummarySearch] = useState('');

  // 2. Other hooks
  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()

  // 3. Helper functions
  function generateProfileImageFilename(email: string): string {
    return email.toLowerCase().replace(/[@.]/g, '_') + '_com.jpg'
  }

  const filterUsageData = (data: UsageEntry[]) => {
    return data.filter(entry => {
      const matchesEntry = entry.number.toLowerCase().includes(usageFilters.entryNumber.toLowerCase());
      const matchesProduct = entry.product.toLowerCase().includes(usageFilters.product.toLowerCase());
      const matchesDestination = entry.destination.toLowerCase().includes(usageFilters.destination.toLowerCase());
      const matchesTruck = usageFilters.truck === '' || entry.usedBy.some((usage: any) => 
        usage.truckNumber.toLowerCase().includes(usageFilters.truck.toLowerCase())
      );
      
      return matchesEntry && matchesProduct && matchesDestination && matchesTruck;
    });
  }

  const clearForm = () => {
    setTruckNumber('')
    setDestination('')
    setProduct('')
    setAt20Quantity('')
    setVolumeWarning(null)
    setError(null)
    setSelectedEntriesWithVolumes([]);
    setRemainingRequired(0);
  }

  const restoreLastForm = () => {
    if (!lastFormState.truckNumber) {
      toast({
        title: "No Previous Entry",
        description: "There is no previous entry to restore",
        variant: "destructive"
      })
      return
    }
    setTruckNumber(lastFormState.truckNumber)
    setDestination(lastFormState.destination)
    setProduct(lastFormState.product)
    setAt20Quantity(lastFormState.at20Quantity)
    toast({
      title: "Form Restored",
      description: "Previous entry has been restored"
    })
  }

  // Add this function with other helper functions
  const verifyWorkIdAgainstDb = useCallback(async (inputWorkId: string): Promise<boolean> => {
    const db = getDatabase();
    const usersRef = dbRef(db, 'users');
    
    try {
      const snapshot = await get(usersRef);
      if (!snapshot.exists()) return false;
  
      let isValid = false;
      snapshot.forEach((childSnapshot) => {
        const userData = childSnapshot.val();
        if (userData.workId === inputWorkId) {
          isValid = true;
        }
      });
      
      return isValid;
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to verify work ID against database",
        variant: "destructive"
      })
      return false;
    }
  }, [toast]);

  // Update the verifyWorkId function
  const verifyWorkId = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsVerifying(true)
    
    try {
      if (!workId) {
        toast({
          title: "Error",
          description: "Please enter a Work ID",
          variant: "destructive"
        })
        return
      }
  
      // Add delay to show loading state
      await new Promise(resolve => setTimeout(resolve, 500))
  
      const isValidWorkId = await verifyWorkIdAgainstDb(workId);
      
      if (isValidWorkId) {
        if (pendingEdit && pendingEdit.entryId && pendingEdit.newValue) {
          const newValue = parseFloat(pendingEdit.newValue)
          if (isNaN(newValue) || newValue < 0) {
            toast({
              title: "Invalid Value",
              description: "Please enter a valid quantity",
              variant: "destructive"
            })
            return
          }
          
          await updateRemainingQuantity(pendingEdit.entryId, newValue)
          
          setWorkIdDialogOpen(false)
          setWorkId("")
          setPendingEdit(null)
          setEditMode(null)
          
          toast({
            title: "Success",
            description: "Quantity updated successfully"
          })
        }
      } else {
        toast({
          title: "Invalid Work ID",
          description: "Work ID not found. Please check and try again.",
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to verify work ID. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsVerifying(false)
    }
  }

  // Add this function with other helper functions
  const updateRemainingQuantity = async (entryId: string, newValue: number) => {
    const db = getDatabase()
    try {
      // First get the current entry data
      const entrySnapshot = await get(dbRef(db, `tr800/${entryId}`))
      if (!entrySnapshot.exists()) {
        throw new Error("Entry not found")
      }
  
      const entryData = entrySnapshot.val()
      
      // Update remaining quantity
      await update(dbRef(db, `tr800/${entryId}`), {
        ...entryData,
        remainingQuantity: newValue
      })
  
      // Update local state
      setUsageData(prevData => 
        prevData.map(entry => 
          entry.key === entryId 
            ? { ...entry, remainingQuantity: newValue }
            : entry
        )
      )
  
      toast({
        title: "Success",
        description: "Quantity updated successfully"
      })
      setEditMode(null)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update quantity",
        variant: "destructive"
      })
    }
  }

  // Update fetchPendingOrders function to better group the data
  const fetchPendingOrders = async () => {
    setIsPendingLoading(true)
    const db = getDatabase()
    try {
      const workDetailsRef = dbRef(db, 'work_details')
      const snapshot = await get(workDetailsRef)
      
      if (!snapshot.exists()) {
        return
      }
  
      // First group by product
      const productGroups: { [key: string]: PendingOrderSummary[] } = {}
  
      Object.values(snapshot.val() as any[])
        .filter((order: any) => 
          !order.loaded && 
          !order.destination.toLowerCase().includes('local')
        )
        .forEach((order: any) => {
          const product = order.product.toUpperCase()
          const destination = order.destination.toUpperCase()
          
          if (!productGroups[product]) {
            productGroups[product] = []
          }
          
          // Find existing destination group or create new one
          let destGroup = productGroups[product].find(g => g.destination === destination)
          if (!destGroup) {
            destGroup = {
              product,
              destination,
              totalQuantity: 0,
              orders: []
            }
            productGroups[product].push(destGroup)
          }
          
          // Convert quantity from m³ to m³ (since input is already in m³)
          const quantityInCubicMeters = parseFloat(order.quantity)
          
          destGroup.orders.push({
            truckNumber: order.truck_number,
            quantity: quantityInCubicMeters, // Store as m³
            orderno: order.orderno,
            owner: order.owner || 'Unknown' // Add owner info
          })
          destGroup.totalQuantity += quantityInCubicMeters // Sum in m³
        })
  
      // Filter out product groups with totalQuantity > 0
      const filteredProductGroups = Object.fromEntries(
        Object.entries(productGroups).filter(([_, groups]) => 
          groups.some(group => group.totalQuantity > 0)
        )
      )
  
      // Convert to array and sort
      const sortedOrders = Object.entries(filteredProductGroups)
        .sort(([a], [b]) => b.localeCompare(a)) // AGO before PMS
        .flatMap(([_, groups]) => 
          groups
            .filter(group => group.totalQuantity > 0) // Exclude groups with 0 balance
            .sort((a, b) => a.destination.localeCompare(b.destination))
        )
  
      setPendingOrders(sortedOrders)
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch pending orders",
        variant: "destructive"
      })
    } finally {
      setIsPendingLoading(false)
    }
  }

  const fetchEntriesUsedInPermits = async (product: string) => {
    const db = getDatabase()
    try {
      const snapshot = await get(dbRef(db, 'tr800'))
      if (snapshot.exists()) {
        const entries = Object.entries(snapshot.val())
          .map(([key, value]: [string, any]) => ({
            key,
            ...value
          }))
          .filter(entry => 
            entry.product.toLowerCase() === product.toLowerCase() &&
            entry.destination.toLowerCase() === 'ssd' && // Add destination check
            entry.remainingQuantity > 0 // Only show entries with remaining quantity
          )
          .sort((a, b) => b.timestamp - a.timestamp) // Sort by newest first

        setAvailablePermitEntries(entries)
        
        // Show toast with filtered results
        if (entries.length > 0) {
          toast({
            title: "Available Permit Entries",
            description: `Found ${entries.length} entries for ${product.toUpperCase()} to SSD`
          })
        } else {
          toast({
            title: "No Entries Available",
            description: `No entries found for ${product.toUpperCase()} to SSD`,
            variant: "destructive"
          })
        }
      } else {
        setAvailablePermitEntries([])
        toast({
          title: "No Entries Found",
          description: `No entries found for product ${product.toUpperCase()}`,
          variant: "destructive"
        })
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch entries for permits",
        variant: "destructive"
      })
    }
  }

  // Add this function to fetch stocks
  const fetchStocks = async () => {
    const db = getDatabase();
    try {
      const stocksRef = dbRef(db, 'stocks');
      const snapshot = await get(stocksRef);
      if (snapshot.exists()) {
        setStocks(snapshot.val());
      }
    } catch (error) {
      console.error('Error fetching stocks:', error);
      toast({
        title: "Error",
        description: "Failed to fetch stock information",
        variant: "destructive"
      });
    }
  };

  // Add this function to update stocks
  const updateStock = async (product: 'ago' | 'pms', quantity: number) => {
    const db = getDatabase();
    try {
      await update(dbRef(db, `stocks/${product}`), {
        product,
        quantity
      });
      
      toast({
        title: "Success",
        description: `Updated ${product.toUpperCase()} stock to ${quantity.toLocaleString()} liters`,
      });
      
      // Refresh stocks
      fetchStocks();
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update stock quantity",
        variant: "destructive"
      });
    }
  };

  // 4. Function to fetch available entries
  const fetchAvailableEntries = async (product: string, destination: string) => {
    const db = getDatabase()
    try {
      const snapshot = await get(dbRef(db, 'tr800'))
      if (snapshot.exists()) {
        const entries = Object.entries(snapshot.val())
          .map(([key, value]: [string, any]) => ({
            key,
            ...value
          }))
          .filter(entry => 
            entry.product.toLowerCase() === product.toLowerCase() &&
            entry.destination.toLowerCase() === destination.toLowerCase() &&
            entry.remainingQuantity > 0
          )
          .sort((a, b) => a.timestamp - b.timestamp) // Sort by timestamp
  
        setAvailableEntries(entries)
        
        // Show toast if entries are found
        if (entries.length > 0) {
          toast({
            title: "Entries Found",
            description: `Found ${entries.length} available entries for ${product.toUpperCase()} to ${destination.toUpperCase()}`

          })
        } else {
          toast({
            title: "No Entries Available",
            description: `No entries found for ${product.toUpperCase()} to ${destination.toUpperCase()}`,
            variant: "destructive"
          })
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch available entries",
        variant: "destructive"
      })
    }
  }

  // 5. Effects
  useEffect(() => {
    setMounted(true)
    
    // Get URL parameters and set form values
    if (mounted) {
      const truckNum = searchParams.get('truckNumber');
      const prod = searchParams.get('product');
      const dest = searchParams.get('destination');
      const qty = searchParams.get('at20Quantity');

      if (truckNum) setTruckNumber(truckNum);
      if (prod) setProduct(prod.toLowerCase());
      if (dest) setDestination(dest.toLowerCase());
      if (qty) setAt20Quantity(qty);
    }
  }, [mounted, searchParams])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    const fetchImageUrl = async () => {
      const userEmail = session?.user?.email
      if (!userEmail || session?.user?.image) return
  
      try {
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

  // Add this effect for real-time volume validation
  useEffect(() => {
    if (!at20Quantity || !product) {
      setVolumeWarning(null)
      return
    }

    const quantity = parseFloat(at20Quantity)
    
    if (product.toLowerCase() === 'pms' && quantity < 37000) {
      setVolumeWarning("PMS quantity should be at least 37,000 liters")
    } else if (product.toLowerCase() === 'ago' && quantity > 36000) {
      setVolumeWarning("AGO quantity should not exceed 36,000 liters")
    } else {
      setVolumeWarning(null)
    }
  }, [at20Quantity, product])

  // Update the inactivity timeout effect
  useEffect(() => {
    let warningTimer: NodeJS.Timeout;
    let logoutTimer: NodeJS.Timeout;

    const resetTimers = () => {
      // Clear existing timers
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      setShowWarningModal(false);

      // Set new warning timer
      warningTimer = setTimeout(() => {
        setWarningMessage("Your session will expire in 1 minute due to inactivity.");
        setShowWarningModal(true);
      }, WARNING_TIMEOUT);

      // Set new logout timer
      logoutTimer = setTimeout(async () => {
        await signOut();
        router.push('/login');
      }, LOGOUT_TIMEOUT);
    };

    // Debounce the reset timer function
    let debounceTimeout: NodeJS.Timeout;
    const debouncedResetTimers = () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(resetTimers, 1000); // 1 second debounce
    };

    // Add event listeners with debounced handler
    window.addEventListener('mousemove', debouncedResetTimers);
    window.addEventListener('keydown', debouncedResetTimers);
    window.addEventListener('click', debouncedResetTimers);

    // Initial setup
    resetTimers();

    // Cleanup
    return () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      clearTimeout(debounceTimeout);
      window.removeEventListener('mousemove', debouncedResetTimers);
      window.removeEventListener('keydown', debouncedResetTimers);
      window.removeEventListener('click', debouncedResetTimers);
    };
  }, [router]);

  // Add to useEffect for initial load
  useEffect(() => {
    if (mounted) {
      fetchPendingOrders()
    }
  }, [mounted])

  // Modify the useEffect to clear entryUsedInPermit when destination changes
  useEffect(() => {
    setEntryUsedInPermit('')
  }, [destination])

  // Add effect to fetch entries when product or destination changes
  useEffect(() => {
    if (product && destination) {
      fetchAvailableEntries(product, destination)
    } else {
      setAvailableEntries([])
      setSelectedEntries([])
    }
  }, [product, destination])

  useEffect(() => {
    if (product && destination.toLowerCase() === 'ssd') {
      fetchEntriesUsedInPermits(product)
    } else {
      setAvailablePermitEntries([])
      setEntryUsedInPermit('')
    }
  }, [product, destination])

  // Add this to your component to check reminders periodically
  useEffect(() => {
    const checkReminders = async () => {
      if (!session?.user?.email) return;

      const userId = session.user.email.replace(/[.@]/g, '_');
      const nextReminder = await reminderService.getNextReminder(userId);
      
      if (nextReminder) {
        toast({
          title: "Reminder",
          description: nextReminder.message,
          duration: 10000,
        });
        await reminderService.markReminderShown(nextReminder.id, userId);
      }
    };

    // Check reminders on mount and every 15 minutes
    checkReminders();
    const interval = setInterval(checkReminders, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [session?.user?.email, toast]);

  // Add to your useEffect for initial load
  useEffect(() => {
    if (mounted) {
      fetchStocks();
    }
  }, [mounted]);

  // Add effect to check quantities and set warnings
  useEffect(() => {
    if (summaryData.length > 0 && pendingOrders.length > 0) {
      const warnings: { [key: string]: any } = {};
      
      pendingOrders.forEach(order => {
        const key = `${order.product}-${order.destination}`;
        const matchingSummary = summaryData.find(
          s => s.productDestination.toLowerCase() === `${order.product.toLowerCase()} - ${order.destination.toLowerCase()}`
        );
        
        if (matchingSummary) {
          // Convert liters to m³ for comparison (1 m³ = 1000 liters)
          const availableQuantityInCubicMeters = matchingSummary.remainingQuantity / 1000; // Convert liters to m³
          const pendingQuantityInCubicMeters = order.totalQuantity; // Already in m³
          
          if (pendingQuantityInCubicMeters > availableQuantityInCubicMeters) {
            const shortageInCubicMeters = pendingQuantityInCubicMeters - availableQuantityInCubicMeters;
            // Calculate truck shortage based on product capacity
            const truckShortage = order.product.toLowerCase() === 'ago' 
              ? (shortageInCubicMeters / 36).toFixed(1) // 36m³ per AGO truck
              : (shortageInCubicMeters / 40).toFixed(1); // 40m³ per PMS truck
            
            warnings[key] = {
              shortage: parseFloat(truckShortage),
              pendingQuantity: pendingQuantityInCubicMeters,
              availableQuantity: availableQuantityInCubicMeters,
              shortageQuantity: shortageInCubicMeters
            };
          }
        } else {
          // If no matching summary found, all pending quantity is shortage
          const truckShortage = order.product.toLowerCase() === 'ago' 
            ? (order.totalQuantity / 36).toFixed(1) // 36m³ per AGO truck
            : (order.totalQuantity / 40).toFixed(1) // 40m³ per PMS truck
          
          warnings[key] = {
            shortage: parseFloat(truckShortage),
            pendingQuantity: order.totalQuantity,
            availableQuantity: 0,
            shortageQuantity: order.totalQuantity
          };
        }
      });
      
      setQuantityWarnings(warnings);
    }
  }, [summaryData, pendingOrders]);

  // Add effect for note timing
  useEffect(() => {
    if (showNote) {
      const timer = setTimeout(() => {
        setShowNote(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showNote]);

  // Add to your useEffect cleanup
  useEffect(() => {
    if (autoRefresh && showSummary) {
      // Refresh every 30 seconds
      autoRefreshIntervalRef.current = setInterval(() => {
        getSummary();
        fetchPendingOrders();
      }, 30000);
    }

    return () => {
      if (autoRefreshIntervalRef.current) {
        clearInterval(autoRefreshIntervalRef.current);
      }
    };
  }, [autoRefresh, showSummary]);

  // Add scroll handler effect
  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Add scroll to top function
  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  // 5. Loading check
  if (!mounted || status === "loading") return null

  // 6. Event handlers
  const getEntries = async () => {
    // Add validation
    const validationResult = validateAllocation.destinationRules(
      destination,
      parseFloat(at20Quantity),
      product
    )

    if (!validationResult.valid) {
      toast({
        title: "Validation Error",
        description: validationResult.message,
        variant: "destructive"
      })
      return
    }

    // Get smart suggestions
    const suggestions = smartAllocation.suggestEntries(
      availableEntries,
      parseFloat(at20Quantity)
    )

    // Check for potential issues
    const predictedIssues = smartAllocation.predictIssues(
      availableEntries,
      parseFloat(at20Quantity)
    )

    if (predictedIssues.length > 0) {
      const confirmed = await confirmDialog({
        title: "Potential Issues Detected",
        description: predictedIssues.map(i => i.message).join('\n'),
        confirmText: "Proceed Anyway",
        cancelText: "Review Issues"
      })

      if (!confirmed) return
    }

    if (!truckNumber || !destination || !product || !at20Quantity) {
      toast({
        title: "Validation Error",
        description: "Please fill all fields",
        variant: "destructive"
      })
      return
    }
  
    setLastFormState({
      truckNumber,
      destination,
      product,
      at20Quantity
    })
  
    if (destination.toLowerCase() === 'ssd' && !entryUsedInPermit) {
      toast({
        title: "Permit Entry Required",
        description: "Please select an entry used in the permit",
        variant: "destructive"
      })
      return
    }
  
    setIsLoading(true)
    const db = getDatabase()
  
    try {
      const requiredQuantity = parseFloat(at20Quantity)
      let remainingToAllocate = requiredQuantity
      const updates: { [key: string]: any } = {}
      const tempOriginalData: { [key: string]: Entry } = {}
      const allocations: Entry[] = []

      // If SSD allocation with permit entry
      if (destination.toLowerCase() === 'ssd' && entryUsedInPermit) {
        const permitEntrySnapshot = await get(dbRef(db, `tr800/${entryUsedInPermit}`));
        if (!permitEntrySnapshot.exists()) {
          throw new Error("Selected permit entry not found");
        }
  
        const permitEntry = { key: permitEntrySnapshot.key, ...permitEntrySnapshot.val() };
        
        // Get all available entries for FIFO check
        const tr800Snapshot = await get(dbRef(db, 'tr800'));
        if (!tr800Snapshot.exists()) {
          throw new Error("No entries found");
        }
  
        const availableEntries = Object.entries(tr800Snapshot.val())
          .map(([key, value]: [string, any]) => ({
            key,
            ...value
          }))
          .filter(entry => 
            entry.product.toLowerCase() === product.toLowerCase() &&
            entry.destination.toLowerCase() === 'ssd' &&
            entry.remainingQuantity > 0
          )
          .sort((a, b) => a.timestamp - b.timestamp); // FIFO ordering
  
        // Try special SSD allocation first
        const ssdAllocationSuccess = await handleSsdAllocation(
          permitEntry,
          requiredQuantity,
          availableEntries,
          updates,
          tempOriginalData,
          allocations,
          truckNumber, // Pass truckNumber
          product      // Pass product
        );
  
        // If special allocation failed, fall back to normal permit entry allocation
        if (!ssdAllocationSuccess) {
          // Original permit entry allocation logic
          const permitAllocation = Math.min(permitEntry.remainingQuantity, remainingToAllocate);
          // ...existing permit allocation code...
        }
      }
  
      // If we still need more quantity, get from other entries using FIFO
      if (remainingToAllocate > 0) {
        const tr800Snapshot = await get(dbRef(db, 'tr800'))
        if (!tr800Snapshot.exists()) {
          throw new Error("No entries found")
        }
  
        const availableEntries = Object.entries(tr800Snapshot.val())
          .map(([key, value]: [string, any]) => ({
            key,
            ...value
          }))
          .filter(entry => 
            entry.product.toLowerCase() === product.toLowerCase() &&
            entry.destination.toLowerCase() === destination.toLowerCase() &&
            entry.remainingQuantity > 0 &&
            (!entryUsedInPermit || entry.key !== entryUsedInPermit) // Exclude already used permit entry
          )
          .sort((a, b) => a.timestamp - b.timestamp) // FIFO ordering
  
        if (availableEntries.length === 0 && remainingToAllocate > 0) {
          throw new Error(`Insufficient quantity available. Still need ${remainingToAllocate.toFixed(2)} liters`)
        }
  
        // Allocate remaining quantity from available entries
        for (const entry of availableEntries) {
          if (remainingToAllocate <= 0) break
  
          const toAllocate = Math.min(entry.remainingQuantity, remainingToAllocate)
          
          tempOriginalData[entry.key] = { ...entry }
          
          const updatedEntry = {
            ...entry,
            remainingQuantity: entry.remainingQuantity - toAllocate
          }
          
          updates[`tr800/${entry.key}`] = updatedEntry
          
          allocations.push({
            key: entry.key,
            motherEntry: entry.number,
            initialQuantity: entry.initialQuantity,
            remainingQuantity: updatedEntry.remainingQuantity,
            truckNumber,
            destination,
            subtractedQuantity: toAllocate,
            number: entry.number,
            product,
            product_destination: `${product}-${destination}`,
            timestamp: Date.now()
          })
          
          remainingToAllocate -= toAllocate
        }
      }
  
      if (remainingToAllocate > 0) {
        throw new Error(`Insufficient quantity available. Still need ${remainingToAllocate.toFixed(2)} liters`)
      }
  
      // Create the truck entry key correctly - combine only truck number and product
      const truckEntryKey = `${truckNumber.replace(/\//g, '-')}-${destination}${product}`.toUpperCase()
  
      // Save truck entries with correct structure
      for (const allocation of allocations) {
        const truckEntryData = {
          entryNumber: allocation.motherEntry,
          subtractedQuantity: allocation.subtractedQuantity,
          timestamp: Date.now()
        }
        
        // Generate a unique key for each entry under the truck
        const newTruckEntryRef = push(dbRef(db, `truckEntries/${truckEntryKey}`))
        updates[`truckEntries/${truckEntryKey}/${newTruckEntryRef.key}`] = truckEntryData
      }
  
      // Get owner information using once() instead of get() with query
      let owner = 'Unknown'
      const workDetailsRef = dbRef(db, 'work_details')
      const workDetailsSnapshot = await get(workDetailsRef)
      
      if (workDetailsSnapshot.exists()) {
        // Find matching truck number manually
        Object.values(workDetailsSnapshot.val()).forEach((detail: any) => {
          if (detail.truck_number === truckNumber) {
            owner = detail.owner || 'Unknown'
          }
        })
      }
  
      // Create allocation report
      const currentDate = new Date().toISOString().split('T')[0]
      const reportRef = push(dbRef(db, 'allocation_reports'))
      updates[`allocation_reports/${reportRef.key}`] = {
        truckNumber,
        owner,
        entries: allocations.map(a => ({
          entryUsed: a.motherEntry,
          volume: a.subtractedQuantity.toString()
        })),
        totalVolume: at20Quantity,
        at20: at20Quantity,
        product,
        loadedDate: currentDate,
        allocationDate: new Date().toISOString(),
        entryDestination: destination
      }
  
      // Apply all updates in one transaction
      await update(dbRef(db), updates)
  
      // Update local state
      setOriginalData(tempOriginalData)
      setEntriesData(allocations)
  
      toast({
        title: "Success",
        description: `Allocated ${requiredQuantity.toLocaleString()} liters using ${allocations.length} entries`
      })
  
      clearForm()
  
    } catch (error) {
      console.error('Allocation error:', error)
      toast({
        title: "Allocation Failed",
        description: error instanceof Error ? error.message : "Failed to process allocation",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }
  

  // Add new helper function for date formatting
  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffTime = Math.abs(now.getTime() - date.getTime());
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    return {
      formatted: date.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      }),
      ageInDays: diffDays
    };
  };

  // Update the getSummary function:
const getSummary = async () => {
  const db = getDatabase()
  const tr800Ref = dbRef(db, 'tr800')
  try {
    // First get truck entries to calculate usage counts
    const truckEntriesSnapshot = await get(dbRef(db, 'truckEntries'))
    const usageCounts: { [key: string]: number } = {}

    // Calculate usage counts from truck entries
    if (truckEntriesSnapshot.exists()) {
      truckEntriesSnapshot.forEach(truck => {
        const entries = truck.val()
        Object.values(entries).forEach((entry: any) => {
          if (entry.entryNumber) {
            usageCounts[entry.entryNumber] = (usageCounts[entry.entryNumber] || 0) + 1
          }
        })
      })
    }

    // Get TR800 entries and build summary
    const snapshot = await get(tr800Ref)
    if (snapshot.exists()) {
      const summaryMap: { [key: string]: any } = {}
      
      snapshot.forEach((childSnapshot) => {
        const data = childSnapshot.val()
        if (!data) return
        
        const key = `${data.product.toLowerCase()} - ${data.destination.toLowerCase()}`
        
        if (!summaryMap[key]) {
          summaryMap[key] = {
            productDestination: key,
            remainingQuantity: 0,
            estimatedTrucks: 0,
            motherEntries: []
          }
        }
        
        if (data.remainingQuantity > 0) {
          summaryMap[key].remainingQuantity += data.remainingQuantity
          summaryMap[key].motherEntries.push({
            number: data.number,
            remainingQuantity: data.remainingQuantity,
            timestamp: data.timestamp,
            creationDate: formatDate(data.timestamp).formatted,
            ageInDays: formatDate(data.timestamp).ageInDays,
            usageCount: usageCounts[data.number] || 0
          })
        }
      })

      // Calculate estimated trucks for each summary
      Object.values(summaryMap).forEach(summary => {
        const product = summary.productDestination.split(' - ')[0]
        const capacity = product.toLowerCase() === 'ago' ? 36000 : 40000
        summary.estimatedTrucks = Math.floor(summary.remainingQuantity / capacity)
      })

      // Convert map to array and sort
      // Convert map to array and sort
      const summaryArray = Object.values(summaryMap)
        .sort((a, b) => b.remainingQuantity - a.remainingQuantity)

      // Filter out summaries with remainingQuantity > 0
      const filteredSummaryArray = summaryArray.filter(summary => summary.remainingQuantity > 0)

      setSummaryData(filteredSummaryArray)
      setShowSummary(true)
      setShowUsage(false)
      setShowManualAllocation(false)
    }
  } catch (error) {
    console.error('Summary error:', error)
    toast({
      title: "Error",
      description: "Failed to fetch summary data",
      variant: "destructive"
    })
  }
}

  const getUsage = async () => {
    const db = getDatabase()
    try {
      // First get TR800 entries
      const tr800Snapshot = await get(dbRef(db, 'tr800'))
      
      if (!tr800Snapshot.exists()) {
        toast({
          title: "No Data",
          description: "No TR800 entries found",
          variant: "destructive"
        })
        return
      }
  
      // Get all truck entries with error handling
      let truckEntriesSnapshot;
      try {
        truckEntriesSnapshot = await get(dbRef(db, 'truckEntries'))
      } catch (error) {
        truckEntriesSnapshot = null
      }
  
      const entries: UsageEntry[] = []
      const truckUsageMap: { [key: string]: { truckNumber: string; quantity: number }[] } = {}
  
      // Process truck entries if they exist
      if (truckEntriesSnapshot && truckEntriesSnapshot.exists()) {
        truckEntriesSnapshot.forEach((truckSnapshot) => {
          const truckNumber = truckSnapshot.key?.replace(/-/g, '/') || 'Unknown'
          const truckData = truckSnapshot.val()
          
          // Handle both array and object structures
          Object.values(truckData).forEach((entry: any) => {
            if (entry && entry.entryNumber) {
              if (!truckUsageMap[entry.entryNumber]) {
                truckUsageMap[entry.entryNumber] = []
              }
              truckUsageMap[entry.entryNumber].push({
                truckNumber,
                quantity: entry.subtractedQuantity
              })
            }
          })
        })
      }
  
      // Process TR800 entries
      tr800Snapshot.forEach((childSnapshot) => {
        const data = childSnapshot.val()
        if (data) {
          entries.push({
            key: childSnapshot.key || '',
            number: data.number || '',
            initialQuantity: data.initialQuantity || 0,
            remainingQuantity: data.remainingQuantity || 0,
            product: data.product || '',
            destination: data.destination || '',
            usedBy: truckUsageMap[data.number] || []
          })
        }
      })
  
      setUsageData(entries)
      setShowUsage(true)
      setShowSummary(false)
  
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch usage data. Please try again.",
        variant: "destructive"
      })
    }
  }

  // New function to reset views
  const resetViews = () => {
    setShowSummary(false)
    setShowUsage(false)
    setShowPendingOrders(false)
    setShowManualAllocation(false)
    setCurrentView('default')
    // Add these lines to clear selections
    setSelectedEntries([])
    clearForm()
  }

  // Add to the existing event handlers
  const undoAllocation = async () => {
    if (!Object.keys(originalData).length) {
      toast({
        title: "No Changes to Undo",
        description: "There are no recent allocations to undo.",
        variant: "destructive"
      })
      return
    }
  
    const db = getDatabase()
    try {
      const updates: { [key: string]: any } = {}
  
      // Get the truck number and destination from the first entry
      const truckNumber = entriesData[0]?.truckNumber
      const destination = entriesData[0]?.destination
      if (!truckNumber || !destination) {
        throw new Error("No truck number or destination found")
      }
  
      // Restore original TR800 data
      for (const key in originalData) {
        updates[`tr800/${key}`] = originalData[key]
      }
  
      // Build the truck entry key correctly
      const truckEntryKey = `${truckNumber.replace(/\//g, '-')}-${destination}${entriesData[0].product}`.toUpperCase()
  
      // Get all truck entries for this key
      const truckEntriesRef = dbRef(db, `truckEntries/${truckEntryKey}`)
      const truckEntriesSnapshot = await get(truckEntriesRef)
  
      if (truckEntriesSnapshot.exists()) {
        // Get all mother entry numbers that were used in this allocation
        const motherEntries = entriesData.map(entry => entry.motherEntry)
  
        // Find and remove matching truck entries
        truckEntriesSnapshot.forEach((childSnapshot) => {
          const entryData = childSnapshot.val()
          if (motherEntries.includes(entryData.entryNumber)) {
            updates[`truckEntries/${truckEntryKey}/${childSnapshot.key}`] = null
          }
        })
      }
  
      // Find and remove the corresponding allocation report
      const reportsRef = dbRef(db, 'allocation_reports')
      const reportsSnapshot = await get(reportsRef)
      
      if (reportsSnapshot.exists()) {
        const currentTimestamp = Date.now()
        const fiveMinutesAgo = currentTimestamp - (5 * 60 * 1000)
        
        reportsSnapshot.forEach((reportSnapshot) => {
          const report = reportSnapshot.val()
          const reportDate = new Date(report.allocationDate).getTime()
          
          if (
            report.truckNumber === truckNumber &&
            reportDate > fiveMinutesAgo &&
            reportDate <= currentTimestamp
          ) {
            updates[`allocation_reports/${reportSnapshot.key}`] = null
          }
        })
      }
  
      // Apply all updates in a single transaction
      await update(dbRef(db), updates)
  
      toast({
        title: "Success",
        description: "Successfully undid the allocation"
      })
  
      // Reset states
      setOriginalData({})
      setEntriesData([])
      
      // Refresh usage data immediately if showing
      if (showUsage) {
        await getUsage()
      }
  
    } catch (error) {
      console.error('Undo error:', error)
      toast({
        title: "Error",
        description: "Failed to undo allocation. Please try again.",
        variant: "destructive"
      })
    }
  }
  

  // Add Manual Allocation function
  const manualAllocate = async () => {
    // Implementation for manual allocation
    // This can include form submission logic
  }

  // Function already defined above - removed duplicate declaration

  // Add this function before renderMainContent
const renderStockInfo = () => {
  if (!stocks) return null;

  return (
    <Card className="mb-6 border-emerald-500/20">
      <CardHeader>
        <CardTitle className="text-xl">Current Stock Levels</CardTitle>
      </CardHeader>
      <CardContent className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* AGO Stock */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">AGO Stock</h3>
              {editingStock === 'ago' ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={tempStockValue}
                    onChange={(e) => setTempStockValue(e.target.value)}
                    className="w-32"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      updateStock('ago', parseInt(tempStockValue));
                      setEditingStock(null);
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingStock(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingStock('ago');
                    setTempStockValue(stocks.ago.quantity.toString());
                  }}
                >
                  Edit
                </Button>
              )}
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {stocks.ago.quantity.toLocaleString()} m³
            </div>
            <div className="text-sm text-muted-foreground">
              Estimated Trucks: {(stocks.ago.quantity / 36).toFixed(2)}
            </div>
          </div>

          {/* PMS Stock */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-medium">PMS Stock</h3>
              {editingStock === 'pms' ? (
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={tempStockValue}
                    onChange={(e) => setTempStockValue(e.target.value)}
                    className="w-32"
                  />
                  <Button
                    size="sm"
                    onClick={() => {
                      updateStock('pms', parseInt(tempStockValue));
                      setEditingStock(null);
                    }}
                  >
                    Save
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setEditingStock(null)}
                  >
                    Cancel
                  </Button>
                </div>
              ) : (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setEditingStock('pms');
                    setTempStockValue(stocks.pms.quantity.toString());
                  }}
                >
                  Edit
                </Button>
              )}
            </div>
            <div className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">
              {stocks.pms.quantity.toLocaleString()} m³
            </div>
            <div className="text-sm text-muted-foreground">
              Estimated Trucks: {(stocks.pms.quantity / 40).toFixed(2)}
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};

  // Update renderMainContent to include back button and better styling
  const renderMainContent = () => {
    if (showSummary) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Update header controls for mobile */}
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
            <h2 className="text-2xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Quantity Summary
            </h2>
            <div className="flex flex-col sm:flex-row gap-2">
              {/* Add search input */}
              <div className="relative w-full sm:w-64">
                <Input
                  placeholder="Search entries..."
                  value={summarySearch}
                  onChange={(e) => setSummarySearch(e.target.value)}
                  className="pl-8"
                />
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
              {/* Existing buttons */}
              <Button 
                variant="outline" 
                onClick={() => setShowPendingOrders(!showPendingOrders)}
                className="w-full sm:w-auto border-emerald-500/30 hover:border-emerald-500/50"
              >
                {showPendingOrders ? 'Hide' : 'Show'} Pending Orders
              </Button>
              <Button 
                variant="outline" 
                onClick={resetViews}
                className="w-full sm:w-auto border-emerald-500/30 hover:border-emerald-500/50"
              >
                <ArrowLeft className="h-4 w-4 mr-2" /> Back to Allocation
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setAutoRefresh(!autoRefresh)}
                className={`${
                  autoRefresh ? 'bg-emerald-100 dark:bg-emerald-900' : ''
                } text-muted-foreground hover:text-foreground`}
              >
                <RefreshCw className={`h-4 w-4 ${autoRefresh ? 'animate-spin' : ''}`} />
                {autoRefresh ? 'Stop Auto-refresh' : 'Auto-refresh'}
              </Button>
            </div>
          </div>

          {/* Summary info note */}
          <AnimatePresence>
            {showNote && (
              <motion.div 
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="mb-4 text-sm text-muted-foreground"
              >
                Note: Only showing entries with available quantities. Entries and destinations not shown have zero balance.
              </motion.div>
            )}
          </AnimatePresence>
          {Object.keys(quantityWarnings).length > 0 && !showNote && (
            <motion.div 
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              className="mb-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-md"
            >
              <div className="font-medium text-red-600 dark:text-red-400">
                ⚠️ Warning: Insufficient quantities for pending orders
              </div>
              <div className="text-sm text-red-500 dark:text-red-400 mt-1">
                Some destinations have more pending orders than available Entries. Highlighted rows need attention.
              </div>
            </motion.div>
          )}

          {summaryData.length > 0 ? (
            <Card className="border-0 shadow-lg bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <CardContent className="p-6">
                <Table>
                  <TableHeader>
                    <TableRow className="border-b border-emerald-500/20">
                      <TableHead className="text-emerald-700 dark:text-emerald-400">Product - Destination</TableHead>
                      <TableHead className="text-emerald-700 dark:text-emerald-400">Remaining Quantity</TableHead>
                      <TableHead className="text-emerald-700 dark:text-emerald-400">Estimated Trucks</TableHead>
                      <TableHead className="text-emerald-700 dark:text-emerald-400">Mother Entries</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {summaryData
                      .filter(item => {
                        if (!summarySearch) return true;
                        const searchTerm = summarySearch.toLowerCase();
                        return (
                          item.productDestination.toLowerCase().includes(searchTerm) ||
                          item.motherEntries.some(entry => 
                            entry.number.toLowerCase().includes(searchTerm)
                          )
                        );
                      })
                      .map((item, index) => {
                        // Split and format product-destination
                        const [product, destination] = item.productDestination.split(' - ')
                        const warningKey = `${product}-${destination}`.toUpperCase();
                        const warning = quantityWarnings[warningKey];
                        
                        return (
                          <TableRow 
                            key={index}
                            className={`
                              border-b border-emerald-500/10 
                              hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20
                              ${warning ? 'bg-red-50/50 dark:bg-red-900/20' : ''}
                              transition-colors duration-200
                            `}
                          >
                            <TableCell className="font-medium">
                              {highlightText(
                                `${product.toUpperCase()} - ${destination.toUpperCase()}`,
                                summarySearch
                              )}
                              {warning && (
                                <div className="mt-1 text-sm text-red-600 dark:text-red-400">
                                  ⚠️ Shortage of {warning.shortage.toFixed(2)} trucks
                                  ({((warning.pendingQuantity - warning.availableQuantity) / 1000).toFixed(2)}k liters)
                                </div>
                              )}
                            </TableCell>
                            <TableCell>{item.remainingQuantity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                            <TableCell>{item.estimatedTrucks.toFixed(2)}</TableCell>
                            <TableCell>
                              {item.motherEntries.map((entry, entryIndex) => (
                                <div key={entryIndex} className="relative flex items-center group mb-2">
                                  <span 
                                    className={`absolute -left-6 top-1/2 -translate-y-1/2 w-5 h-5 flex items-center 
                                               justify-center text-xs font-medium ${
                                      entry.ageInDays > 30 ? 'text-red-500' :
                                      entry.ageInDays > 15 ? 'text-yellow-500' :
                                      'text-emerald-500'
                                    }`}
                                  >
                                    #{entryIndex + 1}
                                  </span>
                                  <div className="flex flex-col w-full">
                                    <div className="flex justify-between items-center group-hover:bg-emerald-50 
                                                  dark:group-hover:bg-emerald-900/20 px-2 py-1 rounded transition-colors">
                                      <span className="font-medium">
                                        {highlightText(
                                          `${entry.number} (${entry.remainingQuantity.toLocaleString()})`,
                                          summarySearch
                                        )}
                                      </span>
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${
                                        entry.ageInDays > 30 ? 'bg-red-100 text-red-700 dark:bg-red-900/20 dark:text-red-400' :
                                        entry.ageInDays > 15 ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20 dark:text-yellow-400' :
                                        'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20 dark:text-emerald-400'
                                      }`}>
                                        {entry.ageInDays}d old
                                      </span>
                                    </div>
                                    <div className="text-xs text-muted-foreground px-2 space-y-1">
                                      <div>Created: {entry.creationDate}</div>
                                      <div>Usage Count: {entry.usageCount} allocations</div>
                                      {entry.ageInDays > 30 && (
                                        <div className="text-red-500 dark:text-red-400">
                                          ⚠️ Aging entry - needs attention
                                        </div>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </TableCell>
                          </TableRow>
                        )
                      })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          ) : (
            <Card className="border-0 shadow-lg bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
              <CardContent className="p-6 text-center text-muted-foreground">
                No entries with remaining quantities found.
              </CardContent>
            </Card>
          )}

          {/* Add spacing between cards */}
          {showPendingOrders && (
            <div className="mt-8">
              {renderStockInfo()}
              {renderPendingOrders()}
            </div>
          )}
        </motion.div>
      )
    }

    if (showUsage) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
            <h2 className="text-2xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Entry Usage
            </h2>
            <Button 
              variant="outline" 
              onClick={resetViews}
              className="w-full sm:w-auto border-emerald-500/30 hover:border-emerald-500/50"
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Allocation
            </Button>
          </div>

          {/* Add filters */}
          <Card className="mb-6 border-emerald-500/20">
            <CardContent className="p-4">
              <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div>
                  <label className="text-sm mb-2 block text-muted-foreground">Entry Number</label>
                  <Input
                    placeholder="Filter by entry number..."
                    value={usageFilters.entryNumber}
                    onChange={(e) => setUsageFilters(prev => ({ ...prev, entryNumber: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm mb-2 block text-muted-foreground">Product</label>
                  <Input
                    placeholder="Filter by product..."
                    value={usageFilters.product}
                    onChange={(e) => setUsageFilters(prev => ({ ...prev, product: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm mb-2 block text-muted-foreground">Destination</label>
                  <Input
                    placeholder="Filter by destination..."
                    value={usageFilters.destination}
                    onChange={(e) => setUsageFilters(prev => ({ ...prev, destination: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-sm mb-2 block text-muted-foreground">Truck Number</label>
                  <Input
                    placeholder="Filter by truck number..."
                    value={usageFilters.truck}
                    onChange={(e) => setUsageFilters(prev => ({ ...prev, truck: e.target.value }))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-0 shadow-lg bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
            <CardContent className="p-6">
              <div className="overflow-auto -mx-2 sm:mx-0">
                <div className="min-w-[700px] p-2">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-b border-emerald-500/20">
                        <TableHead className="text-emerald-700 dark:text-emerald-400">Entry Number</TableHead>
                        <TableHead className="text-emerald-700 dark:text-emerald-400">Initial Quantity</TableHead>
                        <TableHead className="text-emerald-700 dark:text-emerald-400">Remaining</TableHead>
                        <TableHead className="text-emerald-700 dark:text-emerald-400">Product</TableHead>
                        <TableHead className="text-emerald-700 dark:text-emerald-400">Destination</TableHead>
                        <TableHead className="text-emerald-700 dark:text-emerald-400">Used By (Truck - Quantity)</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filterUsageData(usageData).map((entry, index) => (
                        <TableRow key={index}>
                          <TableCell>{highlightText(entry.number, usageFilters.entryNumber)}</TableCell>
                          <TableCell>{entry.initialQuantity}</TableCell>
                          <TableCell>
                            {editMode === entry.key ? (
                              <div className="flex items-center gap-2">
                                <Input
                                  type="number"
                                  value={tempEditValue}
                                  onChange={(e) => setTempEditValue(e.target.value)}
                                  className="w-24"
                                />
                                <Button
                                  size="sm"
                                  onClick={() => {
                                    setPendingEdit({
                                      entryId: entry.key,
                                      newValue: tempEditValue
                                    });
                                    setWorkIdDialogOpen(true);
                                  }}
                                >
                                  Save
                                </Button>
                                <Button
                                  size="sm"
                                  variant="outline"
                                  onClick={() => setEditMode(null)}
                                >
                                  Cancel
                                </Button>
                              </div>
                            ) : (
                              <div className="flex items-center gap-2">
                                {entry.remainingQuantity}
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  onClick={() => {
                                    setEditMode(entry.key);
                                    setTempEditValue(entry.remainingQuantity.toString());
                                  }}
                                >
                                  Edit
                                </Button>
                              </div>
                            )}
                          </TableCell>
                          <TableCell>{highlightText(entry.product, usageFilters.product)}</TableCell>
                          <TableCell>{highlightText(entry.destination, usageFilters.destination)}</TableCell>
                          <TableCell>
                            {entry.usedBy.map((usage: { truckNumber: string; quantity: number }, idx: number) => (
                              <div key={idx} className="mb-1">
                                {`${idx + 1}. `}
                                {highlightText(usage.truckNumber, usageFilters.truck)}
                                {`: ${usage.quantity}`}
                              </div>
                            ))}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Add scroll to top button */}
          <AnimatePresence>
            {showScrollTop && (
              <motion.button
                initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={scrollToTop}
                className="fixed bottom-4 right-4 p-2 rounded-full bg-emerald-500/90 text-white shadow-lg hover:bg-emerald-600/90 transition-colors z-50"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <ArrowUp className="h-6 w-6" />
                <span className="sr-only">Scroll to top</span>
              </motion.button>
            )}
          </AnimatePresence>
        </motion.div>
      )
    }

    if (showManualAllocation) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <Card className="border-0 shadow-lg bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
                Manual Allocation
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  placeholder="Truck Number"
                  value={truckNumber}
                  onChange={(e) => setTruckNumber(e.target.value)}
                />
                <Input
                  placeholder="Product"
                  value={product}
                  onChange={(e) => {
                    const value = e.target.value.toLowerCase()
                    setProduct(value)
                    if (value && destination) {
                      fetchAvailableEntries(value, destination)
                    }
                  }}
                />
                <Input
                  placeholder="Destination"
                  value={destination}
                  onChange={(e) => {
                    const value = e.target.value.toLowerCase()
                    setDestination(value)
                    if (product && value) {
                      fetchAvailableEntries(product, value)
                    }
                  }}
                />
                <Input
                  placeholder="AT20 Quantity"
                  value={at20Quantity}
                  onChange={(e) => setAt20Quantity(e.target.value)}
                />
              </div>

              {volumeWarning && (
                <div className="mt-4 text-yellow-600 dark:text-yellow-400">
                  {volumeWarning}
                </div>
              )}

              {at20Quantity && availableEntries.length > 0 && renderManualAllocationContent()}

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Button 
                  type="button" // Add this to prevent form submission
                  onClick={handleManualAllocation}
                  disabled={isLoading}
                  className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-600 hover:from-emerald-500 hover:via-teal-400 hover:to-blue-500 text-white"
                >
                  {isLoading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RefreshCw className="h-4 w-4" />
                  )}
                  Allocate Manually
                </Button>
                <Button
                  variant="outline"
                  onClick={() => {
                    clearForm()
                    setSelectedEntriesWithVolumes([])
                  }}
                  className="w-full sm:w-auto border-emerald-500/30 hover:border-emerald-500/50"
                >
                  Clear Form
                </Button>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      )
    }

    return (
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.3 }}
      >
        <Card className="border-0 shadow-lg bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
          <CardHeader>
            <CardTitle className="text-2xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Allocation Form
            </CardTitle>
          </CardHeader>
          <CardContent className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                placeholder="Truck Number"
                value={truckNumber}
                onChange={(e) => setTruckNumber(e.target.value)}
              />
              <Input
                placeholder="Product"
                value={product}
                onChange={(e) => {
                  const value = e.target.value.toLowerCase()
                  setProduct(value)
                  if (value && destination) {
                    fetchAvailableEntries(value, destination)
                  }
                }}
              />
              <Input
                placeholder="Destination"
                value={destination}
                onChange={(e) => {
                  const value = e.target.value.toLowerCase()
                  setDestination(value)
                  if (product && value) {
                    fetchAvailableEntries(product, value)
                  }
                }}
              />
              <Input
                placeholder="AT20 Quantity"
                value={at20Quantity}
                onChange={(e) => setAt20Quantity(e.target.value)}
              />
            </div>

            {/* Add Permit Entry Selection */}
            {destination.toLowerCase() === 'ssd' && (
              <div className="mt-4">
                <Label htmlFor="permitEntry" className="block text-sm font-medium mb-2">
                  Select Permit Entry (Required for SSD)
                </Label>
                <Select
                  value={entryUsedInPermit}
                  onValueChange={(value) => setEntryUsedInPermit(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select permit entry..." />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePermitEntries.map((entry) => (
                      <SelectItem key={entry.key} value={entry.key}>
                        {entry.number} - Remaining: {entry.remainingQuantity.toLocaleString()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!entryUsedInPermit && (
                  <p className="mt-2 text-sm text-red-500">
                    Please select a permit entry for SSD allocation
                  </p>
                )}
              </div>
            )}

            {volumeWarning && (
              <div className="mt-4 text-yellow-600 dark:text-yellow-400">
                {volumeWarning}
              </div>
            )}

            <div className="mt-6 flex flex-col sm:flex-row gap-3">
              <Button 
                onClick={getEntries}
                disabled={isLoading}
                className="w-full sm:w-auto bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-600 hover:from-emerald-500 hover:via-teal-400 hover:to-blue-500 text-white"
              >
                {isLoading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <RefreshCw className="h-4 w-4" />
                )}
                Allocate
              </Button>
              <Button
                variant="outline"
                onClick={clearForm}
                className="w-full sm:w-auto border-emerald-500/30 hover:border-emerald-500/50"
              >
                Clear Form
              </Button>
              <Button
                variant="outline"
                onClick={restoreLastForm}
                className="w-full sm:w-auto border-emerald-500/30 hover:border-emerald-500/50"
              >
                Restore Last Entry
              </Button>
            </div>
          </CardContent>
        </Card>

        {entriesData.length > 0 && (
          <Card className="mt-6 border-0 shadow-lg bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
            <CardHeader>
              <CardTitle className="text-2xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
                Allocation Results
              </CardTitle>
            </CardHeader>
            <CardContent className="p-6">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-emerald-500/20">
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Entry Number</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Initial Quantity</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Remaining</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Subtracted Quantity</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Destination</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entriesData.map((entry, index) => (
                    <TableRow key={index}>
                      <TableCell>{entry.number}</TableCell>
                      <TableCell>{entry.initialQuantity}</TableCell>
                      <TableCell>{entry.remainingQuantity}</TableCell>
                      <TableCell>{entry.subtractedQuantity}</TableCell>
                      <TableCell>{entry.destination}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Button 
                  variant="outline" 
                  onClick={undoAllocation}
                  className="w-full sm:w-auto border-emerald-500/30 hover:border-emerald-500/50"
                >
                  Undo Allocation
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </motion.div>
    )
  }

  const renderPendingOrders = () => {
    if (isPendingLoading) {
      return (
        <Card className="border-0 shadow-lg bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
          <CardContent className="p-6 text-center">
            <Loader2 className="h-6 w-6 animate-spin mx-auto" />
            <p className="mt-2">Loading pending orders...</p>
          </CardContent>
        </Card>
      )
    }

    if (pendingOrders.length === 0) {
      return (
        <Card className="border-0 shadow-lg bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
          <CardContent className="p-6 text-center text-muted-foreground">
            No pending orders found.
          </CardContent>
        </Card>
      )
    }

    return (
      <Card className="border-0 shadow-lg bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm">
        <CardHeader>
          <CardTitle className="text-2xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
            Pending Orders
          </CardTitle>
        </CardHeader>
        <CardContent className="p-2 sm:p-6">
          <div className="overflow-auto -mx-2 sm:mx-0">
            <div className="min-w-[900px] p-2">
              <Table>
                <TableHeader>
                  <TableRow className="border-b border-emerald-500/20">
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Product</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Destination</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Total Quantity</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Available Quantity</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Status</TableHead>
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Orders</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendingOrders.map((order, index) => {
                    const warningKey = `${order.product}-${order.destination}`;
                    
                    // Find matching summary entry
                    const matchingSummary = summaryData.find(
                      s => s.productDestination.toLowerCase() === `${order.product.toLowerCase()} - ${order.destination.toLowerCase()}`
                    );
                    
                    // Calculate available quantity
                    const availableQuantity = matchingSummary ? matchingSummary.remainingQuantity / 1000 : 0; // Convert liters to m³
                    
                    // Calculate shortage if any
                    const pendingQuantity = order.totalQuantity; // Already in m³
                    const shortage = pendingQuantity > availableQuantity ? 
                      pendingQuantity - availableQuantity : 
                      0;
                    
                    const warning = shortage > 0 ? {
                      shortage: order.product.toLowerCase() === 'ago' ? 
                        (shortage / 36).toFixed(1) : // 36m³ per AGO truck
                        (shortage / 40).toFixed(1), // 40m³ per PMS truck
                      shortageQuantity: shortage,
                      pendingQuantity,
                      availableQuantity
                    } : null;
                    
                    return (
                      <TableRow 
                        key={index}
                        className={warning ? 'bg-red-50/50 dark:bg-red-900/20' : ''}
                      >
                        <TableCell>{order.product}</TableCell>
                        <TableCell>{order.destination}</TableCell>
                        <TableCell>
                          {order.totalQuantity.toLocaleString()} m³
                          <div className="text-sm text-muted-foreground">
                            ({(order.totalQuantity * 1000).toLocaleString()} liters)
                          </div>
                        </TableCell>
                        <TableCell>
                          {availableQuantity.toLocaleString()} m³
                          <div className="text-sm text-muted-foreground">
                            ({(availableQuantity * 1000).toLocaleString()} liters)
                          </div>
                        </TableCell>
                        <TableCell>
                          {warning ? (
                            <div className="text-red-600 dark:text-red-400 font-medium">
                              ⚠️ Shortage: {warning.shortageQuantity.toLocaleString()} m³
                              <div className="text-sm">
                                ({(warning.shortageQuantity * 1000).toLocaleString()} liters)
                                <br />
                                ({warning.shortage} trucks will lack entries)
                              </div>
                            </div>
                          ) : (
                            <div className="text-green-600 dark:text-green-400">
                              ✓ Sufficient entries available
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {order.orders.map((o, idx) => (
                            <div key={idx} className="mb-1">
                              {`${idx + 1}. Truck: ${o.truckNumber}`}
                              <br />
                              <span className="text-sm text-muted-foreground">
                                {`Quantity: ${o.quantity} m³, Order: ${o.orderno}, Owner: ${o.owner}`}
                              </span>
                            </div>
                          ))}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>
    );
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
        <div className="space-y-4 mt-2">
          {availableEntries.map((entry) => (
            <div key={entry.key} className="p-4 border rounded-lg bg-card">
              <div className="flex items-center justify-between mb-2">
                <div className="font-medium">{entry.number}</div>
                <div className="text-sm text-muted-foreground">
                  Available: {entry.remainingQuantity.toLocaleString()} liters
                </div>
              </div>
              <div className="flex items-center gap-4">
                <Input
                  type="number"
                  placeholder="Volume to allocate"
                  className="max-w-[200px]"
                  max={entry.remainingQuantity}
                  onChange={(e) => {
                    const value = parseFloat(e.target.value || '0');
                    if (value > entry.remainingQuantity) {
                      toast({
                        title: "Invalid Volume",
                        description: `Cannot exceed available quantity of ${entry.remainingQuantity.toLocaleString()} liters`,
                        variant: "destructive"
                      });
                      return;
                    }
                    
                    setSelectedEntriesWithVolumes(prev => {
                      const newSelections = prev.filter(item => item.entryKey !== entry.key);
                      if (value > 0) {
                        newSelections.push({ entryKey: entry.key, allocatedVolume: value });
                      }
                      return newSelections;
                    });
                  }}
                  value={selectedEntriesWithVolumes.find(item => item.entryKey === entry.key)?.allocatedVolume || ''}
                />
                <div className="text-sm text-muted-foreground">
                  Remaining after allocation: {(entry.remainingQuantity - (selectedEntriesWithVolumes.find(item => item.entryKey === entry.key)?.allocatedVolume || 0)).toLocaleString()} liters
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  };

  const handleManualAllocation = async () => {
    try {
      if (!truckNumber || !destination || !product || !at20Quantity || selectedEntriesWithVolumes.length === 0) {
        toast({
          title: "Validation Error",
          description: "Please fill all fields and allocate volumes",
          variant: "destructive"
        });
        return;
      }
  
      const totalAllocated = selectedEntriesWithVolumes.reduce((sum, item) => sum + item.allocatedVolume, 0);
      const required = parseFloat(at20Quantity);
  
      if (totalAllocated !== required) {
        toast({
          title: "Volume Mismatch",
          description: `Total allocated volume (${totalAllocated.toLocaleString()}) must equal required volume (${required.toLocaleString()})`,
          variant: "destructive"
        });
        return;
      }
  
      setIsLoading(true);
      const db = getDatabase();
      const updates: { [key: string]: any } = {};
      const tempOriginalData: { [key: string]: any } = {};
      const allocations: Entry[] = [];
  
      // Process selected entries with their volumes
      for (const selection of selectedEntriesWithVolumes) {
        const entry = availableEntries.find(e => e.key === selection.entryKey);
        if (!entry) continue;
  
        tempOriginalData[entry.key] = { ...entry };
        
        const updatedEntry = {
          ...entry,
          remainingQuantity: entry.remainingQuantity - selection.allocatedVolume
        };
        
        updates[`tr800/${entry.key}`] = updatedEntry;
        
        allocations.push({
          key: entry.key,
          motherEntry: entry.number,
          initialQuantity: entry.initialQuantity,
          remainingQuantity: updatedEntry.remainingQuantity,
          truckNumber,
          destination,
          subtractedQuantity: selection.allocatedVolume,
          number: entry.number,
          product,
          product_destination: `${product}-${destination}`,
          timestamp: Date.now()
        });
      }
  
      // Save truck entries
      const sanitizedTruckNumber = truckNumber.replace(/\//g, '-');
      for (const allocation of allocations) {
        const truckEntryRef = dbRef(db, `truckEntries/${sanitizedTruckNumber}`);
        await push(truckEntryRef, {
          entryNumber: allocation.motherEntry,
          subtractedQuantity: allocation.subtractedQuantity,
          timestamp: Date.now()
        });
      }
  
      // Get owner information
      let owner = 'Unknown';
      const workDetailsRef = dbRef(db, 'work_details');
      const workDetailsSnapshot = await get(workDetailsRef);
      
      if (workDetailsSnapshot.exists()) {
        Object.values(workDetailsSnapshot.val()).forEach((detail: any) => {
          if (detail.truck_number === truckNumber) {
            owner = detail.owner || 'Unknown';
          }
        });
      }
  
      // Create allocation report
      const reportRef = push(dbRef(db, 'allocation_reports'));
      updates[`allocation_reports/${reportRef.key}`] = {
        truckNumber,
        owner,
        entries: allocations.map(a => ({
          entryUsed: a.motherEntry,
          volume: a.subtractedQuantity.toString()
        })),
        totalVolume: at20Quantity,
        at20: at20Quantity,
        product,
        loadedDate: new Date().toISOString().split('T')[0],
        allocationDate: new Date().toISOString(),
        entryDestination: destination
      };
  
      // Apply all updates
      await update(dbRef(db), updates);
      
      setOriginalData(tempOriginalData);
      setEntriesData(allocations);
      
      toast({
        title: "Success",
        description: `Allocated ${at20Quantity} liters using ${allocations.length} entries`
      });
      
      // Clear form and close manual allocation
      clearForm();
      setSelectedEntriesWithVolumes([]);
      setShowManualAllocation(false);
      
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to process manual allocation",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className={`min-h-screen relative ${
      theme === 'dark' ? 'bg-gray-900/50 text-gray-100' : 'bg-gray-50/50 text-gray-900'
    } backdrop-blur-sm`}>
      <header className={`sticky top-0 z-50 w-full border-b ${
        theme === 'dark' 
          ? 'bg-gray-900/70 border-gray-800/50' 
          : 'bg-white/70 border-gray-200/50'
      } backdrop-blur-md shadow-sm`}>
        <div className="container mx-auto px-2 sm:px-4 py-2 sm:py-3">
          <div className="flex justify-between items-center">
            <div className="flex items-center gap-1 sm:gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/dashboard/work')}
                className="text-muted-foreground hover:text-foreground p-1 sm:p-2"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <h1 className="text-sm sm:text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent truncate">
                Allocate Entries
              </h1>
            </div>
            <div className="flex items-center gap-1 sm:gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="text-muted-foreground hover:text-foreground p-1 sm:p-2"
              >
                {theme === 'dark' ? 
                  <Sun className="h-4 w-4 sm:h-5 sm:w-5" /> : 
                  <Moon className="h-4 w-4 sm:h-5 sm:w-5" />
                }
              </Button>
              <div className="relative group">
                <Avatar 
                  className="h-7 w-7 sm:h-10 sm:w-10 ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-background transition-shadow hover:ring-emerald-500/75 cursor-pointer"
                  onClick={() => router.push('/dashboard')}
                >
                  <AvatarImage 
                    src={session?.user?.image || lastUploadedImage || ''} 
                    alt={session?.user?.name || 'User Profile'}
                  />
                  <AvatarFallback className="bg-emerald-100 text-emerald-700">
                    {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
        {/* Add the warning modal */}
        <AnimatePresence>
          {showWarningModal && (
            <Dialog open={showWarningModal} onOpenChange={setShowWarningModal}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Session Expiring Soon</DialogTitle>
                  <DialogDescription>
                    {warningMessage}
                  </DialogDescription>
                </DialogHeader>
                <div className="mt-6 flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowWarningModal(false)}>
                    Dismiss
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          )}
        </AnimatePresence>

        {/* Navigation Buttons - remove sticky positioning */}
        <motion.div 
          className="mb-4 sm:mb-6 bg-background/80 backdrop-blur-sm py-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          {/* Mobile Menu Button */}
          <Button
            variant="outline"
            className="w-full flex items-center justify-between sm:hidden mb-2"
            onClick={() => setShowMobileMenu(!showMobileMenu)}
          >
            <span className="text-sm">Actions Menu</span>
            {showMobileMenu ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {/* Action Buttons */}
          <div className={`
            grid grid-cols-1 sm:flex sm:flex-row gap-2 sm:gap-4
            ${showMobileMenu ? 'block' : 'hidden'}
            sm:flex
          `}>
            <Button 
              onClick={async () => {  // Make the handler async
                try {
                  setIsLoading(true);
                  await getSummary();  // Wait for getSummary to complete
                  setShowSummary(true);
                  setShowUsage(false);
                  setShowManualAllocation(false);
                  setCurrentView('summary');
                  setShowMobileMenu(false);
                } catch (error) {
                  console.error('Error loading summary:', error);
                  toast({
                    title: "Error",
                    description: "Failed to load summary data",
                    variant: "destructive"
                  });
                } finally {
                  setIsLoading(false);
                }
              }} 
              variant="outline" 
              className={`flex items-center justify-center gap-2 w-full sm:w-auto ${currentView === 'summary' ? 'bg-primary text-primary-foreground' : ''}`}
              size="sm"
            >
              <PieChart className="h-4 w-4" /> 
              <span>View Summary</span>
            </Button>
            <Button 
              onClick={() => {
                getUsage()
                setCurrentView('usage')
                setShowMobileMenu(false)
              }} 
              variant="outline" 
              className={`flex items-center justify-center gap-2 w-full sm:w-auto ${currentView === 'usage' ? 'bg-primary text-primary-foreground' : ''}`}
              size="sm"
            >
              <FileText className="h-4 w-4" /> 
              <span>View Entry Usage</span>
            </Button>
            <Button 
              onClick={() => {
                setShowManualAllocation(true)
                setShowSummary(false)
                setShowUsage(false)
                setCurrentView('manual')
                setShowMobileMenu(false)
              }} 
              variant="outline" 
              className={`flex items-center justify-center gap-2 w-full sm:w-auto ${currentView === 'manual' ? 'bg-primary text-primary-foreground' : ''}`}
              size="sm"
            >
              <ClipboardList className="h-4 w-4" /> 
              <span>Manual Allocation</span>
            </Button>
          </div>
        </motion.div>

        {renderMainContent()}

        {/* Add scroll to top button */}
        <AnimatePresence>
          {showScrollTop && (
            <motion.button
              initial={{ opacity: 0, scale: 0.8 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.8 }}
                onClick={scrollToTop}
                className="fixed bottom-4 right-4 p-2 rounded-full bg-emerald-500/90 text-white shadow-lg hover:bg-emerald-600/90 transition-colors z-50"
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
              >
                <ArrowUp className="h-6 w-6" />
                <span className="sr-only">Scroll to top</span>
              </motion.button>
            )}
          </AnimatePresence>
        </main>

        <Dialog open={workIdDialogOpen} onOpenChange={setWorkIdDialogOpen}>
          <DialogContent className="sm:max-w-[425px] mx-2 sm:mx-auto">
            <DialogHeader>
              <DialogTitle>Verify Work ID</DialogTitle>
              <DialogDescription>
                Please enter your Work ID to confirm the changes.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={verifyWorkId}>
              <div className="mt-4">
                <Label htmlFor="workId">Work ID</Label>
                <Input
                  id="workId"
                  value={workId}
                  onChange={(e) => setWorkId(e.target.value)}
                  required
                />
              </div>
              <div className="mt-6 flex justify-end gap-2">
                <Button variant="outline" onClick={() => setWorkIdDialogOpen(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={isVerifying}>
                  {isVerifying ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify"}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>

        <Dialog open={showWarningModal} onOpenChange={setShowWarningModal}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Session Expiring Soon</DialogTitle>
              <DialogDescription>
                {warningMessage}
              </DialogDescription>
            </DialogHeader>
            <div className="mt-6 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowWarningModal(false)}>
                Dismiss
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    )
}

// Add this helper function before getEntries
const handleSsdAllocation = async (
  permitEntry: Entry,
  requiredQuantity: number,
  availableEntries: Entry[],
  updates: { [key: string]: any },
  tempOriginalData: { [key: string]: Entry },
  allocations: Entry[],
  truckNumber: string, // Add truckNumber
  product: string      // Add product
) => {
  // If permit entry is not the first in FIFO order
  const fifoEntry = availableEntries[0];
  if (fifoEntry && fifoEntry.key !== permitEntry.key) {
    // Allocate 1000 from permit entry first
    const permitAllocation = Math.min(1000, permitEntry.remainingQuantity, requiredQuantity);
    
    if (permitAllocation > 0) {
      tempOriginalData[permitEntry.key] = { ...permitEntry };
      
      const updatedPermitEntry = {
        ...permitEntry,
        remainingQuantity: permitEntry.remainingQuantity - permitAllocation
      };
      
      updates[`tr800/${permitEntry.key}`] = updatedPermitEntry;
      
      allocations.push({
        key: permitEntry.key,
        motherEntry: permitEntry.number,
        initialQuantity: permitEntry.initialQuantity,
        remainingQuantity: updatedPermitEntry.remainingQuantity,
        truckNumber,
        destination: 'ssd',
        subtractedQuantity: permitAllocation,
        number: permitEntry.number,
        product,
        product_destination: `${product}-ssd`,
        timestamp: Date.now()
      });
      
      // Allocate remaining from FIFO entry
      const remainingRequired = requiredQuantity - permitAllocation;
      if (remainingRequired > 0 && fifoEntry.remainingQuantity >= remainingRequired) {
        tempOriginalData[fifoEntry.key] = { ...fifoEntry };
        
        const updatedFifoEntry = {
          ...fifoEntry,
          remainingQuantity: fifoEntry.remainingQuantity - remainingRequired
        };
        
        updates[`tr800/${fifoEntry.key}`] = updatedFifoEntry;
        
        allocations.push({
          key: fifoEntry.key,
          motherEntry: fifoEntry.number,
          initialQuantity: fifoEntry.initialQuantity,
          remainingQuantity: updatedFifoEntry.remainingQuantity,
          truckNumber,
          destination: 'ssd',
          subtractedQuantity: remainingRequired,
          number: fifoEntry.number,
          product,
          product_destination: `${product}-ssd`,
          timestamp: Date.now()
        });
        
        return true; // Allocation successful
      }
    }
  }
  return false; // Could not allocate using this method
};

