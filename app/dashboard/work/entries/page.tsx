'use client'

import { useState, useEffect, useRef, useCallback } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import * as Popover from '@radix-ui/react-popover'
import { 
  ArrowLeft,
  ArrowUp,
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
  Search,
  Bell,
  Receipt,
  Edit
} from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { getDatabase, ref as dbRef, get, query, orderByChild, equalTo, update, push, remove } from 'firebase/database'
import { motion, AnimatePresence } from 'framer-motion'
import { useToast } from "@/components/ui/use-toast"
import { Notifications } from "@/components/Notifications"
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
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { validateAllocation } from '@/lib/validation'
import { confirmDialog } from "@/components/ui/confirm-dialog"
import { reminderService } from '@/lib/reminders'
import { StockItem } from '@/types/stock';
import { Entry as EntryType } from "@/types/entries"

interface Entry {
  usedBy: {
    truckNumber: string;
    quantity: number;
  }[];
  key: string;
  motherEntry?: string;
  truckNumber?: string;
  subtractedQuantity: number;
  permitNumber?: string | null;
  number: string;
  initialQuantity: number;
  remainingQuantity: number;
  destination: string;
  product: string;
  product_destination: string;
  timestamp: number;
  status?: string;
}

interface PermitInfo {
  permitNumber: string;
  permitEntryId: string;
  destination: string;
}

import { getPreAllocatedPermit, markPermitAsUsed } from '@/lib/permit-utils';
import { useProfileImage } from '@/hooks/useProfileImage'
import { Badge } from "@/components/ui/badge"

const WARNING_TIMEOUT = 9 * 60 * 1000; // 9 minutes
const LOGOUT_TIMEOUT = 10 * 60 * 1000; // 10 minutes

interface PendingOrderSummary {
  product: string;
  destination: string;
  totalQuantity: number;
  orders: {
    truckNumber: string;
    quantity: number;
    orderno: string;
    owner: string;
    status?: string;
  }[];
}

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

interface SelectedEntryWithVolume {
  entryKey: string;
  allocatedVolume: number;
}

interface Summary {
  productDestination: string;
  remainingQuantity: number;
  estimatedTrucks: number;
  motherEntries: { 
    number: string; 
    remainingQuantity: number;
    timestamp: number;
    creationDate: string;
    ageInDays: number;
    usageCount: number;
  }[];
}

interface ThresholdConfig {
  product: string;
  destination: string;
  warning: number;
  critical: number;
}

interface AlertHistory {
  id: string;
  timestamp: number;
  product: string;
  destination: string;
  quantity: number;
  threshold: number;
  level: 'warning' | 'critical';
  acknowledged: boolean;
}

interface Notification {
  id: string;
  title: string;
  message: string;
  type: 'success' | 'error' | 'warning' | 'info';
  timestamp: number;
  read: boolean;
}

interface TruckUsage {
  id?: string;
  truckNumber: string;
  quantity: number;
}

interface EditingUsage {
  entryKey: string;
  allocationId: string; 
  truckNumber: string;
  volume: number;
  originalTruck: string;
  originalVolume: number;
}

interface EntryData {
  key: string;
  motherEntry: string;
  initialQuantity: number;
  remainingQuantity: number;
  truckNumber?: string;
  destination: string;
  subtractedQuantity: number;
  status?: string;
  number: string;
  product: string;
  product_destination: string;
  timestamp: number;
  permitNumber?: string;
}

export default function EntriesPage() {
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

  const getTruckCapacityText = (quantity: number, product: string) => {
    const capacity = product.toLowerCase() === 'ago' ? 36000 : 40000;
    const fullTrucks = Math.floor(quantity / capacity);
    const remainder = quantity % capacity;
    
    if (remainder === 0) return `(${fullTrucks} trucks)`;
    const partialTruck = Math.round((remainder / capacity) * 100);
    return `(${fullTrucks} trucks + ${partialTruck}% truck)`;
  };

  const searchParams = new URLSearchParams(typeof window !== 'undefined' ? window.location.search : '');

  const [mounted, setMounted] = useState(false)
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
  const [permitAllocation, setPermitAllocation] = useState<PermitInfo | null>(null);

  const [entriesData, setEntriesData] = useState<Entry[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [originalData, setOriginalData] = useState<{[key: string]: Entry}>({})
  const [showSummary, setShowSummary] = useState(false)
  const [showUsage, setShowUsage] = useState(false)
  const [summaryData, setSummaryData] = useState<Summary[]>([])

  const [usageData, setUsageData] = useState<Entry[]>([])
  const [usageFilters, setUsageFilters] = useState({
    entryNumber: '',
    product: '',
    destination: '',
    truck: ''
  })

  const [error, setError] = useState<string | null>(null)
  const [volumeWarning, setVolumeWarning] = useState<string | null>(null)
  const [editMode, setEditMode] = useState<string | null>(null)
  const [workIdDialogOpen, setWorkIdDialogOpen] = useState(false)
  const [workId, setWorkId] = useState("")
  const [tempEditValue, setTempEditValue] = useState("")
  const [pendingEdit, setPendingEdit] = useState<{
    entryId: string;
    newValue: string;
  } | null>(null)
  const [isVerifying, setIsVerifying] = useState(false)
  const [pendingOrders, setPendingOrders] = useState<PendingOrderSummary[]>([])
  const [isPendingLoading, setIsPendingLoading] = useState(false)
  const [showPendingOrders, setShowPendingOrders] = useState(false)
  const [entryUsedInPermit, setEntryUsedInPermit] = useState('')
  const [showManualAllocation, setShowManualAllocation] = useState(false)
  const [selectedEntries, setSelectedEntries] = useState<string[]>([])
  const [availableEntries, setAvailableEntries] = useState<Entry[]>([])
  const [currentView, setCurrentView] = useState<'default' | 'summary' | 'usage' | 'manual'>('default')
  const [availablePermitEntries, setAvailablePermitEntries] = useState<Entry[]>([])
  const [showMobileMenu, setShowMobileMenu] = useState(false)
  const [showWarningModal, setShowWarningModal] = useState(false)
  const [warningMessage, setWarningMessage] = useState("")
  const [stocks, setStocks] = useState<{ ago: StockItem; pms: StockItem } | null>(null);
  const [editingStock, setEditingStock] = useState<'ago' | 'pms' | null>(null);
  const [tempStockValue, setTempStockValue] = useState('');
  const [quantityWarnings, setQuantityWarnings] = useState<{
    [key: string]: { 
      shortage: number;
      pendingQuantity: number;
      availableQuantity: number;
      shortageQuantity: number;
    }
  }>({});
  const [showNote, setShowNote] = useState(true);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const autoRefreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [showScrollTop, setShowScrollTop] = useState(false);
  const [selectedEntriesWithVolumes, setSelectedEntriesWithVolumes] = useState<SelectedEntryWithVolume[]>([]);
  const [remainingRequired, setRemainingRequired] = useState<number>(0);
  const [summarySearch, setSummarySearch] = useState('');
  const [advancedFilters, setAdvancedFilters] = useState({
    dateRange: {
      from: '',
      to: ''
    },
    minQuantity: '',
    maxQuantity: '',
    sortBy: 'date'
  })
  const [thresholds, setThresholds] = useState<ThresholdConfig[]>([
    { product: 'ago', destination: 'ssd', warning: 100000, critical: 50000 },
    { product: 'ago', destination: 'local', warning: 50000, critical: 25000 },
    { product: 'pms', destination: 'ssd', warning: 120000, critical: 70000 },
    { product: 'pms', destination: 'local', warning: 70000, critical: 35000 },
  ]);
  const [alertHistory, setAlertHistory] = useState<AlertHistory[]>([]);
  const [showLowQuantityAlert, setShowLowQuantityAlert] = useState(false);
  const [currentAlert, setCurrentAlert] = useState<AlertHistory | null>(null);
  const [notifications, setNotifications] = useState<Notification[]>([]);
  const [showNotifications, setShowNotifications] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const [animateBell, setAnimateBell] = useState(false)
  const h2Ref = useRef<{ lastClick: number; clickCount: number }>({ lastClick: 0, clickCount: 0 })
  const [editingAllocation, setEditingAllocation] = useState<EditingUsage | null>(null);
  const [editConfirmOpen, setEditConfirmOpen] = useState(false);
  const [editingUsage, setEditingUsage] = useState<{
    entryKey: string;
    usageId: string;
    truckNumber: string;
    quantity: number;
  } | null>(null);
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [hiddenDuplicates, setHiddenDuplicates] = useState<Set<string>>(new Set());
  const [showDuplicates, setShowDuplicates] = useState(false);

  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const profilePicUrl = useProfileImage()

  function generateProfileImageFilename(email: string): string {
    return email.toLowerCase().replace(/[@.]/g, '_') + '_com.jpg'
  }

  const filterUsageData = (data: Entry[]) => {
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
      addNotification(
        "No Previous Entry",
        "There is no previous entry to restore",
        "error"
      )
      return
    }
    setTruckNumber(lastFormState.truckNumber)
    setDestination(lastFormState.destination)
    setProduct(lastFormState.product)
    setAt20Quantity(lastFormState.at20Quantity)
    addNotification(
      "Form Restored",
      "Previous entry has been restored",
      "success"
    )
  }

  const verifyWorkIdAgainstDb = useCallback(async (inputWorkId: string): Promise<boolean> => {
    try {
      // Use dedicated API endpoint for verification instead of direct DB access
      const response = await fetch('/api/auth/verify-approver', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ workId: inputWorkId }),
      });
      
      const result = await response.json();
      return result.success === true;
    } catch (error) {
      addNotification(
        "Error",
        "Failed to verify work ID against database",
        "error"
      )
      return false;
    }
  }, []);

  const verifyWorkId = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsVerifying(true)
    
    try {
      if (!workId) {
        addNotification(
          "Error",
          "Please enter a Work ID",
          "error"
        )
        return
      }
  
      await new Promise(resolve => setTimeout(resolve, 500))
  
      const isValidWorkId = await verifyWorkIdAgainstDb(workId);
      
      if (isValidWorkId) {
        if (pendingEdit && pendingEdit.entryId && pendingEdit.newValue) {
          const newValue = parseFloat(pendingEdit.newValue)
          if (isNaN(newValue) || newValue < 0) {
            addNotification(
              "Invalid Value",
              "Please enter a valid quantity",
              "error"
            )
            return
          }
          
          await updateRemainingQuantity(pendingEdit.entryId, newValue)
          
          setWorkIdDialogOpen(false)
          setWorkId("")
          setPendingEdit(null)
          setEditMode(null)
          
          addNotification(
            "Success",
            "Quantity updated successfully",
            "success"
          )
        }
      } else {
        addNotification(
          "Invalid Work ID",
          "Work ID not found. Please check and try again.",
          "error"
        )
      }
    } catch (error) {
      addNotification(
        "Error",
        "Failed to verify work ID. Please try again.",
        "error"
      )
    } finally {
      setIsVerifying(false)
    }
  }

  const updateRemainingQuantity = async (entryId: string, newValue: number) => {
    const db = getDatabase()
    try {
      const entrySnapshot = await get(dbRef(db, `tr800/${entryId}`))
      if (!entrySnapshot.exists()) {
        throw new Error("Entry not found")
      }
  
      const entryData = entrySnapshot.val()
      
      await update(dbRef(db, `tr800/${entryId}`), {
        ...entryData,
        remainingQuantity: newValue
      })
  
      setUsageData(prevData => 
        prevData.map(entry => 
          entry.key === entryId 
            ? { ...entry, remainingQuantity: newValue }
            : entry
        )
      )
  
      addNotification(
        "Success",
        "Quantity updated successfully",
        "success"
      )
      setEditMode(null)
    } catch (error) {
      addNotification(
        "Error",
        "Failed to update quantity",
        "error"
      )
    }
  }

  const addNotification = (
    title: string,
    message: string,
    type: 'success' | 'error' | 'warning' | 'info' = 'info'
  ) => {
    // Create notification for the bell icon
    const newNotification: Notification = {
      id: Date.now().toString(),
      title,
      message,
      type,
      timestamp: Date.now(),
      read: false
    };
    
    // Add to bell notifications
    setNotifications(prev => [newNotification, ...prev].slice(0, 50));
    setUnreadCount(prev => prev + 1);
    
    // Animate bell
    setAnimateBell(true)
    setTimeout(() => setAnimateBell(false), 1000)

    // Show toast notification for all notification types
    switch (type) {
      case 'success':
        Notifications.success(title, message);
        break;
      case 'error':
        Notifications.error(title, message);
        // Also show in UI toast for error type (keeping existing behavior)
        toast({
          title,
          description: message,
          variant: "destructive"
        });
        break;
      case 'warning':
        Notifications.warning(title, message);
        break;
      case 'info':
      default:
        Notifications.info(title, message);
        break;
    }
  };

  const clearNotifications = () => {
    setNotifications([])
    setUnreadCount(0)
  }

  const fetchPendingOrders = async () => {
    setIsPendingLoading(true)
    const db = getDatabase()
    try {
      const workDetailsRef = dbRef(db, 'work_details')
      const snapshot = await get(workDetailsRef)
      
      if (!snapshot.exists()) {
        return
      }
  
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
          
          const quantityInCubicMeters = parseFloat(order.quantity)
          
          destGroup.orders.push({
            truckNumber: order.truck_number,
            quantity: quantityInCubicMeters,
            orderno: order.orderno,
            owner: order.owner || 'Unknown',
            status: order.status || 'Not Queued'
          })
          destGroup.totalQuantity += quantityInCubicMeters
        })
  
      const filteredProductGroups = Object.fromEntries(
        Object.entries(productGroups).filter(([_, groups]) => 
          groups.some(group => group.totalQuantity > 0)
        )
      )
  
      const sortedOrders = Object.entries(filteredProductGroups)
        .sort(([a], [b]) => b.localeCompare(a))
        .flatMap(([_, groups]) => 
          groups
            .filter(group => group.totalQuantity > 0)
            .sort((a, b) => a.destination.localeCompare(b.destination))
        )
  
      setPendingOrders(sortedOrders)
    } catch (error) {
      addNotification(
        "Error",
        "Failed to fetch pending orders",
        "error"
      )
    } finally {
      setIsPendingLoading(false)
    }
  }

  const fetchEntriesUsedInPermits = async (product: string, destination: string = 'ssd') => {
    const db = getDatabase()
    console.log(`Fetching permit entries for ${product} to ${destination}`)
    
    try {
      const snapshot = await get(dbRef(db, 'tr800'))
      if (snapshot.exists()) {
        console.log(`Found tr800 entries, filtering for ${product}/${destination}`)
        
        // Get all entries first to see what's available
        const allEntries = Object.entries(snapshot.val()).map(([key, value]: [string, any]) => ({
          key,
          ...value
        }))
        
        console.log(`Total entries: ${allEntries.length}`)
        
        // Debug what's available for product
        const productEntries = allEntries.filter(entry => 
          entry.product && entry.product.toLowerCase() === product.toLowerCase()
        )
        console.log(`Entries matching product ${product}: ${productEntries.length}`)
        
        // Debug what's available for destination
        const destinationEntries = allEntries.filter(entry => 
          entry.destination && entry.destination.toLowerCase() === destination.toLowerCase()
        )
        console.log(`Entries matching destination ${destination}: ${destinationEntries.length}`)

        // First try to find entries that match the exact product and destination
        let entries = allEntries.filter(entry => 
          entry.product && 
          entry.destination && 
          entry.product.toLowerCase() === product.toLowerCase() &&
          entry.destination.toLowerCase() === destination.toLowerCase() &&
          entry.remainingQuantity > 0
        )
        .sort((a, b) => b.timestamp - a.timestamp)
        
        console.log(`Filtered entries with remaining quantity: ${entries.length}`)
        
        // If no entries found with exact match, try to find permit entries with any destination
        if (entries.length === 0) {
          entries = allEntries.filter(entry => 
            entry.product && 
            entry.product.toLowerCase() === product.toLowerCase() &&
            entry.permitNumber && // Make sure it's a permit entry
            entry.remainingQuantity > 0
          )
          .sort((a, b) => b.timestamp - a.timestamp)
          
          console.log(`Fallback: found ${entries.length} permit entries for ${product} with any destination`)
        }
        
        setAvailablePermitEntries(entries)
        
        if (entries.length > 0) {
          addNotification(
            "Available Permit Entries",
            `Found ${entries.length} entries for ${product.toUpperCase()}${entries[0].destination ? ' to ' + entries[0].destination.toUpperCase() : ''}`,
            "info"
          )
        } else {
          addNotification(
            "No Entries Available",
            `No permit entries found for ${product.toUpperCase()}. Please contact an administrator to add permit entries.`,
            "warning"
          )
        }
      } else {
        setAvailablePermitEntries([])
        addNotification(
          "No Entries Found",
          `No entries found for product ${product.toUpperCase()}. Please contact an administrator.`,
          "error"
        )
      }
    } catch (error) {
      console.error("Error fetching permit entries:", error);
      addNotification(
        "Error",
        "Failed to fetch entries for permits. Please try again.",
        "error"
      )
    }
  }

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
      addNotification(
        "Error",
        "Failed to fetch stock information",
        "error"
      );
    }
  };

  const updateStock = async (product: 'ago' | 'pms', quantity: number) => {
    const db = getDatabase();
    try {
      await update(dbRef(db, `stocks/${product}`), {
        product,
        quantity
      });
      
      addNotification(
        "Success",
        `Updated ${product.toUpperCase()} stock to ${quantity.toLocaleString()} liters`,
        "success"
      );
      
      fetchStocks();
    } catch (error) {
      addNotification(
        "Error",
        "Failed to update stock quantity",
        "error"
      );
    }
  };

  const fetchAvailableEntries = async (product: string, destination: string) => {
    const db = getDatabase();
    try {
      if (!product || !destination) {
        console.warn('Missing product or destination:', { product, destination });
        setAvailableEntries([]);
        addNotification(
          "Invalid Parameters",
          "Product and destination are required",
          "error"
        );
        return;
      }

      console.log('Fetching entries for:', { product, destination });
      
      const snapshot = await get(dbRef(db, 'tr800'));
      if (!snapshot.exists()) {
        setAvailableEntries([]);
        addNotification(
          "No Data",
          "No entries found in database",
          "warning"
        );
        return;
      }

      const entries: Entry[] = [];
      
      snapshot.forEach((childSnapshot) => {
        const data = childSnapshot.val();
        const key = childSnapshot.key;
        
        // Skip invalid entries
        if (!data || !key || !data.product || !data.destination) {
          console.warn('Invalid entry found:', { key, data });
          return;
        }

        // Safely access properties with null checks
        const entryProduct = String(data.product).toLowerCase();
        const entryDestination = String(data.destination).toLowerCase();
        const remainingQuantity = Number(data.remainingQuantity) || 0;

        if (
          entryProduct === product.toLowerCase() &&
          entryDestination === destination.toLowerCase() &&
          remainingQuantity > 0
        ) {
          entries.push({
            key,
            ...data,
            // Ensure all required properties have default values
            number: data.number || '',
            initialQuantity: Number(data.initialQuantity) || 0,
            remainingQuantity,
            destination: data.destination,
            product: data.product,
            product_destination: `${data.product}-${data.destination}`,
            timestamp: Number(data.timestamp) || Date.now(),
            permitNumber: data.permitNumber || null
          });
        }
      });

      // Sort entries by timestamp
      entries.sort((a, b) => a.timestamp - b.timestamp);

      setAvailableEntries(entries);
      
      if (entries.length > 0) {
        addNotification(
          "Entries Found",
          `Found ${entries.length} entries for ${product.toUpperCase()} to ${destination.toUpperCase()}`,
          "info"
        );
      } else {
        addNotification(
          "No Entries",
          `No available entries found for ${product.toUpperCase()} to ${destination.toUpperCase()}`,
          "warning"
        );
      }

    } catch (error) {
      console.error('Error fetching entries:', error);
      setAvailableEntries([]);
      addNotification(
        "Error",
        "Failed to fetch available entries. Please try again.",
        "error"
      );
    }
  };

  interface PermitAllocation {
    permitNumber: string;
    permitEntryId: string;
  }
  
  const checkPermitAllocation = useCallback(async () => {
      if (!truckNumber || !destination || !product) return;
  
      const db = getDatabase();
      try {
        const permit = await getPreAllocatedPermit(db, truckNumber, destination, product) as PermitAllocation | null;
        if (permit && permit.permitNumber) {
        setPermitAllocation({
          permitNumber: permit.permitNumber,
          permitEntryId: permit.permitEntryId,
          destination: destination
        });
        
        addNotification(
          "Permit Found",
          `Found pre-allocated permit ${permit.permitNumber} for ${destination.toUpperCase()}`,
          "info"
        );
        setEntryUsedInPermit(permit.permitEntryId);
      } else {
        setPermitAllocation(null);
        setEntryUsedInPermit('');
      }
    } catch (error) {
      console.error('Error checking permit:', error);
      setPermitAllocation(null);
    }
  }, [truckNumber, destination, product]);

  useEffect(() => {
    if (product && destination) {
      console.log('Triggering entry fetch:', { product, destination });
      fetchAvailableEntries(product, destination).catch(error => {
        console.error('Effect error:', error);
        setAvailableEntries([]); // Reset entries on error
        addNotification(
          "Error",
          "Failed to fetch entries. Will retry shortly.",
          "error"
        );
        
        // Retry after delay
        const retryTimer = setTimeout(() => {
          fetchAvailableEntries(product, destination);
        }, 2000);

        return () => clearTimeout(retryTimer);
      });
    } else {
      setAvailableEntries([]);
      setSelectedEntries([]);
    }
  }, [product, destination]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      setMounted(true)
      
      const params = new URLSearchParams(window.location.search)
      const truckNum = params.get('truckNumber')
      const prod = params.get('product')
      const dest = params.get('destination')
      const qty = params.get('at20Quantity')

      if (truckNum && !truckNumber) {
        setTruckNumber(decodeURIComponent(truckNum))
      }
      if (prod && !product) {
        setProduct(decodeURIComponent(prod.toLowerCase()))
      }
      if (dest && !destination) {
        setDestination(decodeURIComponent(dest.toLowerCase()))
      }
      if (qty && !at20Quantity) {
        const parsedQty = parseFloat(decodeURIComponent(qty))
        if (!isNaN(parsedQty)) {
          setAt20Quantity(parsedQty.toString())
        }
      }

      if (prod && dest) {
        fetchAvailableEntries(prod.toLowerCase(), dest.toLowerCase())
      }
    }
  }, [mounted])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

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

  useEffect(() => {
    let warningTimer: NodeJS.Timeout;
    let logoutTimer: NodeJS.Timeout;

    const resetTimers = () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      setShowWarningModal(false);

      warningTimer = setTimeout(() => {
        setWarningMessage("Your session will expire in 1 minute due to inactivity.");
        setShowWarningModal(true);
      }, WARNING_TIMEOUT);

      logoutTimer = setTimeout(async () => {
        await signOut();
        router.push('/login');
      }, LOGOUT_TIMEOUT);
    };

    let debounceTimeout: NodeJS.Timeout;
    const debouncedResetTimers = () => {
      clearTimeout(debounceTimeout);
      debounceTimeout = setTimeout(resetTimers, 1000);
    };

    window.addEventListener('mousemove', debouncedResetTimers);
    window.addEventListener('keydown', debouncedResetTimers);
    window.addEventListener('click', debouncedResetTimers);

    resetTimers();

    return () => {
      clearTimeout(warningTimer);
      clearTimeout(logoutTimer);
      clearTimeout(debounceTimeout);
      window.removeEventListener('mousemove', debouncedResetTimers);
      window.removeEventListener('keydown', debouncedResetTimers);
      window.removeEventListener('click', debouncedResetTimers);
    };
  }, [router]);

  useEffect(() => {
    if (mounted) {
      fetchPendingOrders()
    }
  }, [mounted])

  useEffect(() => {
    setEntryUsedInPermit('')
  }, [destination])

  useEffect(() => {
    if (destination.toLowerCase() === 'ssd' || destination.toLowerCase() === 'drc') {
      checkPermitAllocation();
    } else {
      setPermitAllocation(null);
      setEntryUsedInPermit('');
    }
  }, [truckNumber, destination, product, checkPermitAllocation]);

  useEffect(() => {
    if ((destination.toLowerCase() === 'ssd' || destination.toLowerCase() === 'drc') && product) {
      // Fetch permit entries for SSD/DRC destinations when product changes
      fetchEntriesUsedInPermits(product, destination.toLowerCase());
    }
  }, [destination, product]);

  useEffect(() => {
    const checkReminders = async () => {
      // Access email safely using type assertion
      const user = session?.user;
      const userEmail = typeof user === 'object' && user !== null
        ? (user.email as string | undefined) || (user as any)?.email
        : undefined;
      
      if (!userEmail) return;

      const userId = userEmail.replace(/[.@]/g, '_');
      const nextReminder = await reminderService.getNextReminder(userId);
      
      if (nextReminder) {
        addNotification(
          "Reminder",
          nextReminder.message,
          "info"
        );
        await reminderService.markReminderShown(nextReminder.id, userId);
      }
    };

    checkReminders();
    const interval = setInterval(checkReminders, 15 * 60 * 1000);

    return () => clearInterval(interval);
  }, [session?.user]);

  useEffect(() => {
    if (mounted) {
      fetchStocks();
    }
  }, [mounted]);

  useEffect(() => {
    if (summaryData.length > 0 && pendingOrders.length > 0) {
      const warnings: { [key: string]: any } = {};
      
      pendingOrders.forEach(order => {
        const key = `${order.product}-${order.destination}`;
        const matchingSummary = summaryData.find(
          s => s.productDestination.toLowerCase() === `${order.product.toLowerCase()} - ${order.destination.toLowerCase()}`
        );
        
        if (matchingSummary) {
          const availableQuantityInCubicMeters = matchingSummary.remainingQuantity / 1000;
          const pendingQuantityInCubicMeters = order.totalQuantity;
          
          if (pendingQuantityInCubicMeters > availableQuantityInCubicMeters) {
            const shortageInCubicMeters = pendingQuantityInCubicMeters - availableQuantityInCubicMeters;
            const truckShortage = order.product.toLowerCase() === 'ago' 
              ? (shortageInCubicMeters / 36).toFixed(1)
              : (shortageInCubicMeters / 40).toFixed(1);
            
            warnings[key] = {
              shortage: parseFloat(truckShortage),
              pendingQuantity: pendingQuantityInCubicMeters,
              availableQuantity: availableQuantityInCubicMeters,
              shortageQuantity: shortageInCubicMeters
            };
          }
        } else {
          const truckShortage = order.product.toLowerCase() === 'ago' 
            ? (order.totalQuantity / 36).toFixed(1)
            : (order.totalQuantity / 40).toFixed(1)
          
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

  useEffect(() => {
    if (showNote) {
      const timer = setTimeout(() => {
        setShowNote(false);
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [showNote]);

  useEffect(() => {
    if (autoRefresh && showSummary) {
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

  useEffect(() => {
    const handleScroll = () => {
      setShowScrollTop(window.scrollY > 400);
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth'
    });
  };

  if (!mounted || status === "loading") {
    return (
      <div className="min-h-screen bg-white dark:bg-gray-900 flex items-center justify-center">
        <Loader2 className="h-12 w-12 animate-spin text-emerald-500" />
      </div>
    )
  }

  const fetchPreAllocatedEntries = async (truckNumber: string, destination: string, product: string) => {
    const db = getDatabase();
    try {
      const permitPreAllocationsRef = dbRef(db, 'permitPreAllocations');
      const permitSnapshot = await get(permitPreAllocationsRef);
      
      if (permitSnapshot.exists()) {
        let matchingAllocation: any = null;
        
        permitSnapshot.forEach((childSnapshot) => {
          const allocation = childSnapshot.val();
          
          if (allocation.truckNumber === truckNumber && 
              allocation.product.toLowerCase() === product.toLowerCase() &&
              allocation.destination.toLowerCase() === destination.toLowerCase() &&
              !allocation.used) {
            matchingAllocation = {
              id: childSnapshot.key,
              ...allocation
            };
            return true;
          }
        });
        
        if (matchingAllocation) {
          await update(dbRef(db, `permitPreAllocations/${matchingAllocation.id}`), {
            used: true,
            usedAt: new Date().toISOString()
          });
          
          setEntryUsedInPermit(matchingAllocation.permitEntryId || entryUsedInPermit);
          
          addNotification(
            "Pre-allocation Found",
            `Using pre-allocated permit entry for ${destination.toUpperCase()}`,
            "info"
          );
          
          return matchingAllocation;
        }
      }
      return null;
    } catch (error) {
      console.error('Error checking pre-allocations:', error);
      return null;
    }
  };

  const getEntries = async () => {
    if (!truckNumber || !destination || !product || !at20Quantity) {
      addNotification(
        "Validation Error",
        "Please fill all fields",
        "error"
      );
      return;
    }
  
    const needsPermitEntry = destination.toLowerCase() === 'ssd' || 
                             destination.toLowerCase() === 'drc';
    
    if (needsPermitEntry && !entryUsedInPermit) {
      const useManualInstead = await confirmDialog({
        title: "Permit Entry Required",
        description: `No permit entry selected for ${destination.toUpperCase()} allocation. Would you like to switch to manual allocation instead?`,
        confirmText: "Use Manual Allocation",
        cancelText: "Cancel"
      });
      
      if (useManualInstead) {
        setShowManualAllocation(true);
        return;
      } else {
        addNotification(
          "Permit Entry Required",
          `Please select a permit entry for ${destination.toUpperCase()} allocation`,
          "error"
        );
        return;
      }
    }
  
    setIsLoading(true);
    const db = getDatabase();
  
    try {
      const preAllocated = await fetchPreAllocatedEntries(truckNumber, destination, product);
      
      const requiredQuantity = parseFloat(at20Quantity);
      const updates: { [key: string]: any } = {};
      const tempOriginalData: { [key: string]: Entry } = {};
      const allocations: Entry[] = [];
  
      if (needsPermitEntry) {
        const permitEntrySnapshot = await get(dbRef(db, `tr800/${entryUsedInPermit}`));
        if (!permitEntrySnapshot.exists()) {
          throw new Error("Selected permit entry not found");
        }
      
        const permitEntry = { 
          key: permitEntrySnapshot.key, 
          ...permitEntrySnapshot.val() 
        } as Entry;
        let remainingToAllocate = requiredQuantity;
      
        tempOriginalData[permitEntry.key] = { ...permitEntry };
        const permitAllocation = Math.min(permitEntry.remainingQuantity, remainingToAllocate);
        
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
          destination,
          subtractedQuantity: permitAllocation,
          number: permitEntry.number,
          product,
          product_destination: `${product}-${destination}`,
          timestamp: Date.now(),
          usedBy: []
        });
      
        remainingToAllocate -= permitAllocation;
      
        if (remainingToAllocate > 0) {
          const fifoEntries = availableEntries.filter(entry => entry.key !== permitEntry.key);
          
          for (const entry of fifoEntries) {
            if (remainingToAllocate <= 0) break;
      
            const toAllocate = Math.min(entry.remainingQuantity, remainingToAllocate);
            
            tempOriginalData[entry.key] = { ...entry };
            
            const updatedEntry = {
              ...entry,
              remainingQuantity: entry.remainingQuantity - toAllocate
            };
            
            updates[`tr800/${entry.key}`] = updatedEntry;
            
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
              timestamp: Date.now(),
              usedBy: []
            });
            
            remainingToAllocate -= toAllocate;
          }
      
          if (remainingToAllocate > 0) {
            throw new Error(`Insufficient quantity available. Used permit entry (${permitAllocation.toLocaleString()} liters) and FIFO entries but still need ${remainingToAllocate.toFixed(2)} liters`);
          }
        }
      } else {
        let remainingToAllocate = requiredQuantity;
        for (const entry of availableEntries) {
          if (remainingToAllocate <= 0) break;
          
          const toAllocate = Math.min(entry.remainingQuantity, remainingToAllocate);
          
          tempOriginalData[entry.key] = { ...entry };
          
          const updatedEntry = {
            ...entry,
            remainingQuantity: entry.remainingQuantity - toAllocate
          };
          
          updates[`tr800/${entry.key}`] = updatedEntry;
          
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
            timestamp: Date.now(),
            usedBy: []
          });
          
          remainingToAllocate -= toAllocate;
        }
        
        if (requiredQuantity > 0) {
          throw new Error(`Insufficient quantity available. Need ${requiredQuantity.toFixed(2)} more liters`);
        }
      }
  
      const truckEntryKey = `${truckNumber.replace(/\//g, '-')}-${destination}${product}`.toUpperCase();
  
      for (const allocation of allocations) {
        const truckEntryData = {
          entryNumber: allocation.motherEntry,
          subtractedQuantity: allocation.subtractedQuantity,
          timestamp: Date.now()
        };
        
        const newTruckEntryRef = push(dbRef(db, `truckEntries/${truckEntryKey}`));
        updates[`truckEntries/${truckEntryKey}/${newTruckEntryRef.key}`] = truckEntryData;
      }
  
      let owner = 'Unknown'
      const workDetailsRef = dbRef(db, 'work_details')
      const workDetailsSnapshot = await get(workDetailsRef)
      
      if (workDetailsSnapshot.exists()) {
        Object.values(workDetailsSnapshot.val()).forEach((detail: any) => {
          if (detail.truck_number === truckNumber) {
            owner = detail.owner || 'Unknown'
          }
        })
      }
  
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
  
      if (needsPermitEntry && entryUsedInPermit) {
        const permitEntryRef = dbRef(db, `tr800/${entryUsedInPermit}`);
        const permitEntrySnapshot = await get(permitEntryRef);
        
        if (permitEntrySnapshot.exists()) {
          const permitEntry = permitEntrySnapshot.val();
          updates[`truckEntries/${truckEntryKey}/permitEntry`] = {
            id: entryUsedInPermit,
            number: permitEntry.number,
            destination: destination,
            usedAt: new Date().toISOString()
          };
        }
      }

      await update(dbRef(db), updates)

      if (preAllocated) {
        await markPermitAsUsed(db, preAllocated.id);
        addNotification(
          "Permit Used",
          `Pre-allocated permit ${preAllocated.permitNumber} for ${destination.toUpperCase()} has been marked as used`,
          "success"
        );
      }
  
      setOriginalData(tempOriginalData)
      setEntriesData(allocations)
  
      addNotification(
        "Success",
        `Allocated ${requiredQuantity.toLocaleString()} liters for ${destination.toUpperCase()} using ${allocations.length} entries`,
        "success"
      )
  
      clearForm()
  
    } catch (error) {
      console.error('Allocation error:', error)
      addNotification(
        "Allocation Failed",
        error instanceof Error ? error.message : "Failed to process allocation",
        "error"
      )
    } finally {
      setIsLoading(false)
    }
  }

  const getSummary = async () => {
    const db = getDatabase()
    const tr800Ref = dbRef(db, 'tr800')
    try {
      const truckEntriesSnapshot = await get(dbRef(db, 'truckEntries'))
      const usageCounts: { [key: string]: number } = {}

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

        Object.values(summaryMap).forEach(summary => {
          const product = summary.productDestination.split(' - ')[0]
          const capacity = product.toLowerCase() === 'ago' ? 36000 : 40000
          summary.estimatedTrucks = Math.floor(summary.remainingQuantity / capacity)
        })

        const summaryArray = Object.values(summaryMap)
          .sort((a, b) => b.remainingQuantity - a.remainingQuantity)

        const filteredSummaryArray = summaryArray.filter(summary => summary.remainingQuantity > 0)

        setSummaryData(filteredSummaryArray)
        setShowSummary(true)
        setShowUsage(false)
        setShowManualAllocation(false)
      }
    } catch (error) {
      console.error('Summary error:', error)
      addNotification(
        "Error",
        "Failed to fetch summary data",
        "error"
      )
    }
  }

  const getUsage = async () => {
    const db = getDatabase()
    try {
      const tr800Snapshot = await get(dbRef(db, 'tr800'))
      
      if (!tr800Snapshot.exists()) {
        addNotification(
          "No Data",
          "No TR800 entries found",
          "error"
        )
        return
      }

      let truckEntriesData = null;
      try {
        const truckEntriesSnapshot = await get(dbRef(db, 'truckEntries'))
        truckEntriesData = truckEntriesSnapshot.exists() ? truckEntriesSnapshot : null;
      } catch (error) {
        console.error('Error fetching truck entries:', error);
      }

      let entries: Entry[] = []
      const truckUsageMap: { [key: string]: { truckNumber: string; quantity: number }[] } = {}

      if (truckEntriesData && truckEntriesData.exists()) {
        truckEntriesData.forEach((truckSnapshot) => {
          const truckNumber = truckSnapshot.key?.replace(/-/g, '/') || 'Unknown'
          const truckData = truckSnapshot.val()
          
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
            usedBy: truckUsageMap[data.number] || [],
            timestamp: data.timestamp || Date.now(),
            permitNumber: data.permitNumber || null,
            subtractedQuantity: 0,
            product_destination: ""
          })
        }
      })

      // Filter and sort entries based on advanced filters
      const filteredEntries = entries.filter(entry => {
        if (advancedFilters.minQuantity && entry.remainingQuantity < parseFloat(advancedFilters.minQuantity)) return false;
        if (advancedFilters.maxQuantity && entry.remainingQuantity > parseFloat(advancedFilters.maxQuantity)) return false;
        if (advancedFilters.dateRange.from || advancedFilters.dateRange.to) {
          const entryDate = new Date(entry.timestamp);
          if (advancedFilters.dateRange.from && entryDate < new Date(advancedFilters.dateRange.from)) return false;
          if (advancedFilters.dateRange.to && entryDate > new Date(advancedFilters.dateRange.to)) return false;
        }
        return true;
      });
      entries = filteredEntries;
    
      entries.sort((a, b) => {
        switch(advancedFilters.sortBy) {
          case 'date':
            return b.timestamp - a.timestamp;
          case 'quantity':
            return b.remainingQuantity - a.remainingQuantity;
          case 'usage':
            return b.usedBy.length - a.usedBy.length;
          default:
            return 0;
        }
      });

      setUsageData(entries)
      setShowUsage(true)
      setShowSummary(false)

    } catch (error) {
      addNotification(
        "Error",
        "Failed to fetch usage data. Please try again.",
        "error"
      )
    }
  }

  const resetViews = () => {
    setShowSummary(false)
    setShowUsage(false)
    setShowPendingOrders(false)
    setShowManualAllocation(false)
    setCurrentView('default')
    setSelectedEntries([])
    clearForm()
  }

  const undoAllocation = async () => {
    if (!Object.keys(originalData).length) {
      addNotification(
        "No Changes to Undo",
        "There are no recent allocations to undo.",
        "error"
      )
      return
    }
  
    const db = getDatabase()
    try {
      const updates: { [key: string]: any } = {}
  
      const truckNumber = entriesData[0]?.truckNumber
      const destination = entriesData[0]?.destination
      if (!truckNumber || !destination) {
        throw new Error("No truck number or destination found")
      }
  
      for (const key in originalData) {
        updates[`tr800/${key}`] = originalData[key]
      }
  
      const truckEntryKey = `${truckNumber.replace(/\//g, '-')}-${destination}${product}`.toUpperCase()
  
      const truckEntriesRef = dbRef(db, `truckEntries/${truckEntryKey}`)
      const truckEntriesSnapshot = await get(truckEntriesRef)
  
      if (truckEntriesSnapshot.exists()) {
        const motherEntries = entriesData.map(entry => entry.motherEntry)
  
        truckEntriesSnapshot.forEach((childSnapshot) => {
          const entryData = childSnapshot.val()
          if (motherEntries.includes(entryData.entryNumber)) {
            updates[`truckEntries/${truckEntryKey}/${childSnapshot.key}`] = null
          }
        })
      }
  
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
  
      await update(dbRef(db), updates)
  
      addNotification(
        "Success",
        "Successfully undid the allocation",
        "success"
      )
  
      setOriginalData({})
      setEntriesData([])
      
      if (showUsage) {
        await getUsage()
      }
  
    } catch (error) {
      console.error('Undo error:', error)
      addNotification(
        "Error",
        "Failed to undo allocation. Please try again.",
        "error"
      )
    }
  }

  const manualAllocate = async () => {
  }

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

  const getEstimatedTrucksText = (remaining: number, product: string) => {
    const capacity = product.toLowerCase() === 'ago' ? 36000 : 40000;
    const fullTrucks = Math.floor(remaining / capacity);
    const remainder = remaining % capacity;
    
    let text = `${fullTrucks} truck${fullTrucks !== 1 ? 's' : ''}`;
    if (remainder > 0) {
      const partialTruck = Math.round((remainder / capacity) * 100);
      text += ` + ${partialTruck}% of a truck`;
    }
    return text;
  };

  const renderStockInfo = () => {
    if (!stocks) return null;

    return (
      <Card className="mb-6 border-emerald-500/20">
        <CardHeader>
          <CardTitle className="text-xl">Current Stock Levels</CardTitle>
        </CardHeader>
        <CardContent className="p-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

  const renderMainContent = () => {
    if (showSummary) {
      return (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
          <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3 mb-6">
            <h2 className="text-2xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Quantity Summary
            </h2>
            <div className="flex flex-col sm:flex-row gap-2">
              <div className="relative w-full sm:w-64">
                <Input
                  placeholder="Search entries..."
                  value={summarySearch}
                  onChange={(e) => setSummarySearch(e.target.value)}
                  className="pl-8"
                />
                <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              </div>
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
                      <TableHead className="text-emerald-700 dark:text-emerald-400">Truck Capacity</TableHead>
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
                            <TableCell>
                              {getEstimatedTrucksText(item.remainingQuantity, item.productDestination.split(' - ')[0])}
                              <div className="text-xs text-muted-foreground">
                                ({item.productDestination.split(' - ')[0].toUpperCase()}: {item.productDestination.split(' - ')[0].toLowerCase() === 'ago' ? '36K' : '40K'} per truck)
                              </div>
                            </TableCell>
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
                                          `${entry.number} (${entry.remainingQuantity.toLocaleString()}) ${
                                            getTruckCapacityText(entry.remainingQuantity, item.productDestination.split(' - ')[0])
                                          }`,
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
                                      <div>
                                        Usage Count: {entry.usageCount} allocations 
                                        <span className="mx-1">•</span>
                                        <span className="text-muted-foreground/75">
                                          {getTruckCapacityText(entry.remainingQuantity, item.productDestination.split(' - ')[0])}
                                        </span>
                                      </div>
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
            <h2 
              className="text-2xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent cursor-pointer select-none"
              onClick={(e) => {
                const now = Date.now();
                if (!h2Ref.current.lastClick || now - h2Ref.current.lastClick > 500) {
                  h2Ref.current.clickCount = 1;
                } else {
                  h2Ref.current.clickCount++;
                }
                h2Ref.current.lastClick = now;

                if (h2Ref.current.clickCount === 3) {
                  toggleAdminMode();
                  h2Ref.current.clickCount = 0;
                }
              }}
            >
              Entry Usage {isAdminMode && <span className="text-xs text-emerald-500">(Admin Mode)</span>}
            </h2>
            <Button 
              variant="outline" 
              onClick={resetViews}
              className="w-full sm:w-auto border-emerald-500/30 hover:border-emerald-500/50"
            >
              <ArrowLeft className="h-4 w-4 mr-2" /> Back to Allocation
            </Button>
          </div>

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
                          <TableCell>
                            <div className="flex items-center gap-2">
                              {highlightText(entry.number, usageFilters.entryNumber)}
                              {entry.permitNumber && (
                                <Badge variant="outline" className="bg-blue-100/50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                                  <Receipt className="h-3 w-3 mr-1" />
                                  Permit
                                </Badge>
                              )}
                            </div>
                          </TableCell>
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
                            {entry.usedBy.some((usage: any, idx: number) => {
                              const isDuplicate = entry.usedBy.findIndex(
                                (u: any) => u.truckNumber === usage.truckNumber && u.quantity === usage.quantity
                              ) !== idx;
                              return isDuplicate;
                            }) && (
                              <Button
                                size="sm"
                                variant="outline"
                                className="mb-2 text-xs"
                                onClick={() => setShowDuplicates(!showDuplicates)}
                              >
                                {showDuplicates ? "Hide Duplicates" : "Show Duplicates"}
                              </Button>
                            )}
                            
                            {entry.usedBy
                              .filter((usage: any, idx: number) => {
                                const isDuplicate = entry.usedBy.findIndex(
                                  (u: any) => u.truckNumber === usage.truckNumber && u.quantity === usage.quantity
                                ) !== idx;
                                return showDuplicates ? true : !isDuplicate;
                              })
                              .map((usage: any, idx: number) => {
                                const isEditing = editingUsage?.entryKey === entry.key && 
                                editingUsage?.usageId === `${idx}`;
                                const isDuplicate = entry.usedBy.filter(
                                  (u: any) => u.truckNumber === usage.truckNumber && 
                                             u.quantity === usage.quantity
                                ).length > 1;
                    
                                return (
                                  <div key={idx} className="mb-1 flex items-center gap-2">
                                    {isEditing && isAdminMode ? (
                                      <div className="flex items-center gap-2">
                                        <Input
                                          className="w-32"
                                          value={editingUsage.truckNumber}
                                          onChange={(e) => setEditingUsage({
                                            ...editingUsage,
                                            truckNumber: e.target.value
                                          })}
                                        />
                                        <Input
                                          type="number"
                                          className="w-24"
                                          value={editingUsage.quantity}
                                          onChange={(e) => setEditingUsage({
                                            ...editingUsage,
                                            quantity: parseFloat(e.target.value)
                                          })}
                                        />
                                        <Button
                                          size="sm"
                                          onClick={() => {
                                            updateTruckUsage(
                                              entry.key,
                                              usage.truckNumber,
                                              editingUsage.truckNumber,
                                              editingUsage.quantity
                                            );
                                            setEditingUsage(null);
                                          }}
                                        >
                                          Save
                                        </Button>
                                        <Button
                                          size="sm"
                                          variant="outline"
                                          onClick={() => setEditingUsage(null)}
                                        >
                                          Cancel
                                        </Button>
                                      </div>
                                    ) : (
                                      <div className="flex items-center gap-2">
                                        <span>
                                          {`${idx + 1}. ${usage.truckNumber}: ${usage.quantity}`}
                                        </span>
                                        {isAdminMode && (
                                          <>
                                            <Button
                                              size="sm"
                                              variant="ghost"
                                              onClick={() => setEditingUsage({
                                                entryKey: entry.key,
                                                usageId: `${idx}`,
                                                truckNumber: usage.truckNumber,
                                                quantity: usage.quantity
                                              })}
                                            >
                                              Edit
                                            </Button>
                                            {isDuplicate && (
                                              <Button
                                                size="sm"
                                                variant="ghost"
                                                className="text-yellow-600 hover:text-yellow-700"
                                                onClick={() => hideDuplicate(entry.number, usage)}
                                              >
                                                Hide Duplicate
                                              </Button>
                                            )}
                                          </>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                );
                              })}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            </CardContent>
          </Card>

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
                  type="button"
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

            {renderPermitInfo()}

            {(destination.toLowerCase() === 'ssd' || destination.toLowerCase() === 'drc') && !permitAllocation && (
              <div className="mt-4">
                <Label htmlFor="permitEntry" className="block text-sm font-medium mb-2">
                  Select Permit Entry (Required for {destination.toUpperCase()})
                </Label>
                <Select
                  value={entryUsedInPermit}
                  onValueChange={(value) => setEntryUsedInPermit(value)}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder={`Select ${destination.toUpperCase()} permit entry...`} />
                  </SelectTrigger>
                  <SelectContent>
                    {availablePermitEntries.length > 0 ? (
                      availablePermitEntries.map((entry) => (
                        <SelectItem key={entry.key} value={entry.key}>
                          {entry.number} - Remaining: {entry.remainingQuantity.toLocaleString()}
                        </SelectItem>
                      ))
                    ) : (
                      <SelectItem value="no-entries" disabled>
                        No permit entries available. Contact administrator.
                      </SelectItem>
                    )}
                  </SelectContent>
                </Select>
                
                {availablePermitEntries.length === 0 && (
                  <div className="mt-2 flex items-center justify-between">
                    <span className="text-sm text-amber-600 dark:text-amber-400">
                      No permit entries available for {destination.toUpperCase()}
                    </span>
                    <Button 
                      variant="outline" 
                      size="sm"
                      onClick={() => setShowManualAllocation(true)}
                      className="text-xs"
                    >
                      Switch to Manual Allocation
                    </Button>
                  </div>
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
                    <TableHead className="text-emerald-700 dark:text-emerald-400">Truck Number</TableHead>
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
                      <TableCell>{entry.truckNumber}</TableCell>
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
                    
                    const matchingSummary = summaryData.find(
                      s => s.productDestination.toLowerCase() === `${order.product.toLowerCase()} - ${order.destination.toLowerCase()}`
                    );
                    
                    const availableQuantity = matchingSummary ? matchingSummary.remainingQuantity / 1000 : 0;
                    
                    const pendingQuantity = order.totalQuantity;
                    const shortage = pendingQuantity > availableQuantity ? 
                      pendingQuantity - availableQuantity : 
                      0;
                    
                    const warning = shortage > 0 ? {
                      shortage: order.product.toLowerCase() === 'ago' ? 
                        (shortage / 36).toFixed(1) :
                        (shortage / 40).toFixed(1),
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
                              <div className="flex items-center gap-2">
                                <span>{`${idx + 1}. Truck: ${o.truckNumber}`}</span>
                                <span className={`px-2 py-0.5 rounded-full text-xs ${
                                  o.status === 'queued' 
                                    ? 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/20' 
                                    : 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/20'
                                }`}>
                                  {o.status || 'Not Queued'}
                                </span>
                              </div>
                              <span className="text-sm text-muted-foreground block ml-4">
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
                <div className="font-medium flex items-center gap-2">
                  {entry.number}
                  {entry.permitNumber && (
                    <Badge variant="outline" className="bg-blue-100/50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
                      <Receipt className="h-3 w-3 mr-1" />
                      Permit Entry
                    </Badge>
                  )}
                </div>
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
                      addNotification(
                        "Invalid Volume",
                        `Cannot exceed available quantity of ${entry.remainingQuantity.toLocaleString()} liters`,
                        "error"
                      );
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
        addNotification(
          "Validation Error",
          "Please fill all fields and allocate volumes",
          "error"
        );
        return;
      }
  
      const totalAllocated = selectedEntriesWithVolumes.reduce((sum, item) => sum + item.allocatedVolume, 0);
      const required = parseFloat(at20Quantity);
  
      if (totalAllocated !== required) {
        addNotification(
          "Volume Mismatch",
          `Total allocated volume (${totalAllocated.toLocaleString()}) must equal required volume (${required.toLocaleString()})`,
          "error"
        );
        return;
      }
  
      setIsLoading(true);
      const db = getDatabase();
      const updates: { [key: string]: any } = {};
      const tempOriginalData: { [key: string]: any } = {};
      const allocations: Entry[] = [];
  
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
          timestamp: Date.now(),
          usedBy: [],
          permitNumber: entry.permitNumber || null
        });
      }
  
      const sanitizedTruckNumber = truckNumber.replace(/\//g, '-');
      for (const allocation of allocations) {
        const truckEntryRef = dbRef(db, `truckEntries/${sanitizedTruckNumber}`);
        await push(truckEntryRef, {
          entryNumber: allocation.motherEntry,
          subtractedQuantity: allocation.subtractedQuantity,
          timestamp: Date.now()
        });
      }
  
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
  
      await update(dbRef(db), updates);
      
      setOriginalData(tempOriginalData);
      setEntriesData(allocations);
      
      addNotification(
        "Success",
        `Allocated ${at20Quantity} liters using ${allocations.length} entries`,
        "success"
      );
      
      clearForm();
      setSelectedEntriesWithVolumes([]);
      setShowManualAllocation(false);
      
    } catch (error) {
      addNotification(
        "Error",
        "Failed to process manual allocation",
        "error"
      );
    } finally {
      setIsLoading(false);
    }
  };

  const findDuplicateUsages = (usages: TruckUsage[]) => {
    const seen = new Set<string>();
    const duplicates = new Set<string>();

    usages.forEach(usage => {
      const key = `${usage.truckNumber}-${usage.quantity}`;
      if (seen.has(key)) {
        duplicates.add(key);
      }
      seen.add(key);
    });

    return duplicates;
  };

  const hideDuplicate = (entryNumber: string, usage: TruckUsage) => {
    setHiddenDuplicates(prev => {
      const key = `${entryNumber}-${usage.truckNumber}-${usage.quantity}`;
      const newSet = new Set(prev);
      newSet.add(key);
      return newSet;
    });
    
    addNotification(
      "Success",
      "Duplicate usage entry hidden",
      "success"
    );
  };

  const updateTruckUsage = async (
    entryKey: string, 
    oldTruckNumber: string, 
    newTruckNumber: string, 
    newQuantity: number
  ) => {
    const db = getDatabase();
    try {
      const oldTruckRef = dbRef(db, `truckEntries/${oldTruckNumber.replace(/\//g, '-')}`);
      const snapshot = await get(oldTruckRef);

      if (snapshot.exists()) {
        const updates: { [key: string]: any } = {};
        
        snapshot.forEach((child) => {
          const entry = child.val();
          if (entry.entryNumber === entryKey) {
            updates[`truckEntries/${oldTruckNumber.replace(/\//g, '-')}/${child.key}`] = null;
            
            const newTruckKey = newTruckNumber.replace(/\//g, '-');
            const newRef = push(dbRef(db, `truckEntries/${newTruckKey}`));
            updates[`truckEntries/${newTruckKey}/${newRef.key}`] = {
              entryNumber: entryKey,
              subtractedQuantity: newQuantity,
              timestamp: Date.now()
            };
          }
        });

        if (Object.keys(updates).length > 0) {
          await update(dbRef(db), updates);
          await getUsage();
          addNotification(
            "Success",
            "Usage entry updated successfully",
            "success"
          );
        }
      }
    } catch (error) {
      addNotification(
        "Error",
        "Failed to update usage entry",
        "error"
      );
    }
  };

  const toggleAdminMode = () => {
    setIsAdminMode(prev => !prev);
    if (!isAdminMode) {
      addNotification(
        "Admin Mode Activated",
        "Edit and remove functionality is now available",
        "info"
      );
    }
  };

  const handleEditAllocation = async (confirmed: boolean) => {
    if (!editingAllocation || !confirmed) {
      setEditConfirmOpen(false);
      return;
    }

    try {
      const db = getDatabase();

      // Fetch user info first
      const userInfoRes = await fetch('/api/user-info');
      if (!userInfoRes.ok) {
        throw new Error('Failed to fetch user info for edit history');
      }
      const userInfo = await userInfoRes.json();
      const userEmail = userInfo.email; // Get email from API response

      if (!userEmail) {
        throw new Error('User email not found in fetched info');
      }

      const volumeDiff = editingAllocation.volume - editingAllocation.originalVolume;

      const updates: { [key: string]: any } = {};

      const tr800Ref = dbRef(db, `tr800/${editingAllocation.entryKey}`);
      const tr800Snapshot = await get(tr800Ref);

      if (!tr800Snapshot.exists()) {
        throw new Error("Entry not found");
      }

      const entry = tr800Snapshot.val();
      updates[`tr800/${editingAllocation.entryKey}/remainingQuantity`] =
        entry.remainingQuantity - volumeDiff;

      const oldTruckRef = dbRef(db, `truckEntries/${editingAllocation.originalTruck.replace(/\//g, '-')}`);
      const newTruckRef = dbRef(db, `truckEntries/${editingAllocation.truckNumber.replace(/\//g, '-')}`);

      updates[`truckEntries/${editingAllocation.originalTruck.replace(/\//g, '-')}/${editingAllocation.allocationId}`] = null;

      const newAllocation = {
        entryNumber: entry.number,
        subtractedQuantity: editingAllocation.volume,
        timestamp: Date.now()
      };

      const newAllocationRef = push(newTruckRef);
      updates[`truckEntries/${editingAllocation.truckNumber.replace(/\//g, '-')}/${newAllocationRef.key}`] = newAllocation;

      const historyRef = push(dbRef(db, 'allocationEdits'));
      updates[`allocationEdits/${historyRef.key}`] = {
        entryNumber: entry.number,
        originalTruck: editingAllocation.originalTruck,
        newTruck: editingAllocation.truckNumber,
        originalVolume: editingAllocation.originalVolume,
        newVolume: editingAllocation.volume,
        // Line 3019 Fix: Use fetched email
        editedBy: userEmail,
        editedAt: new Date().toISOString()
      };

      await update(dbRef(db), updates);

      addNotification(
        "Success",
        "Allocation updated successfully",
        "success"
      );

      await getUsage();

    } catch (error) {
      addNotification(
        "Error", 
        error instanceof Error ? error.message : "Failed to update allocation",
        "error"
      );
    }

    setEditingAllocation(null);
    setEditConfirmOpen(false);
  };

  const renderPermitInfo = () => {
    if (!permitAllocation) return null;
    
    return (
      <div className="mt-4 p-4 bg-blue-50/50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
        <div className="flex items-center justify-between">
          <div className="text-sm">
            <span className="font-medium">Pre-allocated Permit: </span>
            <Badge variant="outline" className="ml-2 bg-blue-100/50 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300">
              {permitAllocation.permitNumber}
            </Badge>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => {
              setEntryUsedInPermit('');
              setPermitAllocation(null);
              addNotification(
                "Permit Cleared",
                "You can now select a different permit entry",
                "info"
              );
            }}
          >
            Change Entry
          </Button>
        </div>
        <p className="text-sm text-muted-foreground mt-2">
          This truck has a pre-allocated permit that will be used automatically
        </p>
      </div>
    );
  };

  return (
    <div className={`min-h-screen relative ${
      !mounted ? 'bg-white dark:bg-gray-900' : 
      theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-white text-gray-900'
    }`}>
      <header className={`sticky top-0 z-50 w-full border-b ${
        theme === 'dark' 
          ? 'bg-gray-900 border-gray-800' 
          : 'bg-white border-gray-200'
      } shadow-sm`}>
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
              
              <div className="relative">
                <Popover.Root open={showNotifications} onOpenChange={setShowNotifications}>
                  <Popover.Trigger asChild>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground hover:text-foreground p-1 sm:p-2"
                    >
                      <Bell className={`h-4 w-4 sm:h-5 sm:w-5 cursor-pointer ${animateBell ? 'animate-bounce' : ''}`} />
                      {unreadCount > 0 && (
                        <span className="absolute -top-1 -right-1 h-4 w-4 text-xs bg-red-500 text-white rounded-full flex items-center justify-center">
                          {unreadCount}
                        </span>
                      )}
                    </Button>
                  </Popover.Trigger>
                  
                  <Popover.Portal>
                    <Popover.Content
                      className="absolute right-0 mt-2 w-80 bg-background border rounded-lg shadow-lg py-2 z-50"
                      align="end"
                      sideOffset={5}
                    >
                      <div className="px-4 py-2 border-b flex justify-between items-center">
                        <h3 className="font-semibold">Notifications</h3>
                        <div className="flex gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setNotifications(prev => prev.map(n => ({ ...n, read: true })));
                              setUnreadCount(0);
                            }}
                          >
                            Mark all read
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              clearNotifications();
                            }}
                            className="text-red-500 hover:text-red-600"
                          >
                            Clear all
                          </Button>
                        </div>
                      </div>
                      <div className="max-h-96 overflow-y-auto">
                        {notifications.length === 0 ? (
                          <div className="px-4 py-3 text-sm text-muted-foreground">
                            No notifications
                          </div>
                        ) : (
                          notifications.map(notification => (
                            <div
                              key={notification.id}
                              className={`px-4 py-3 border-b last:border-0 ${
                                !notification.read ? 'bg-muted/50' : ''
                              }`}
                              onClick={() => {
                                if (!notification.read) {
                                  setNotifications(prev =>
                                    prev.map(n =>
                                      n.id === notification.id ? { ...n, read: true } : n
                                    )
                                  );
                                  setUnreadCount(prev => Math.max(0, prev - 1));
                                }
                              }}
                            >
                              <div className="flex items-start gap-3">
                                <div className={`w-2 h-2 mt-2 rounded-full ${
                                  notification.type === 'error' ? 'bg-red-500' :
                                  notification.type === 'warning' ? 'bg-yellow-500' :
                                  notification.type === 'success' ? 'bg-green-500' :
                                  'bg-blue-500'
                                }`} />
                                <div>
                                  <div className="font-medium text-sm">{notification.title}</div>
                                  <div className="text-sm text-muted-foreground">
                                    {notification.message}
                                  </div>
                                  <div className="text-xs text-muted-foreground mt-1">
                                    {new Date(notification.timestamp).toLocaleTimeString()}
                                  </div>
                                </div>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                      <Popover.Arrow className="fill-white dark:fill-gray-900" />
                    </Popover.Content>
                  </Popover.Portal>
                </Popover.Root>
              </div>
              
              <div className="relative group">
                <Avatar 
                  className="h-7 w-7 sm:h-10 sm:w-10 ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-background transition-shadow hover:ring-emerald-500/75 cursor-pointer"
                  onClick={() => router.push('/dashboard')}
                >
                  <AvatarImage 
                    src={session?.user?.image || profilePicUrl || ''} 
                    alt={session?.user?.name || 'User Profile'}
                  />
                  <AvatarFallback className="bg-emerald-100 text-emerald-700">
                    {session?.user?.name?.[0] || 'U'}
                  </AvatarFallback>
                </Avatar>
              </div>
            </div>
          </div>
        </div>
      </header>

      {mounted && (
        <style jsx global>{`
          body {
            backdrop-filter: blur(8px);
          }
        `}</style>
      )}

      <main className="container mx-auto px-2 sm:px-4 py-4 sm:py-8">
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

        <motion.div 
          className="mb-4 sm:mb-6 bg-background/80 backdrop-blur-sm py-2"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.3 }}
        >
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

          <div className={`
            grid grid-cols-1 sm:flex sm:flex-row gap-2 sm:gap-4
            ${showMobileMenu ? 'block' : 'hidden'}
            sm:flex
          `}>
            <Button 
              onClick={async () => {  
                try {
                  setIsLoading(true);
                  await getSummary();
                  setShowSummary(true);
                  setShowUsage(false);
                  setShowManualAllocation(false);
                  setCurrentView('summary');
                  setShowMobileMenu(false);
                } catch (error) {
                  console.error('Error loading summary:', error);
                  addNotification(
                    "Error",
                    "Failed to load summary data",
                    "error"
                  );
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
            <Button 
              onClick={() => router.push('/dashboard/work/permits')}
              variant="outline" 
              className="flex items-center justify-center gap-2 w-full sm:w-auto"
              size="sm"
            >
              <Receipt className="h-4 w-4" /> 
              <span>View Permits</span>
            </Button>
          </div>
        </motion.div>

        {renderMainContent()}

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

        <Dialog open={editConfirmOpen} onOpenChange={setEditConfirmOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Allocation</DialogTitle>
              <DialogDescription>
                Update the truck number and/or volume for this allocation.
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="truck" className="text-right">
                  Truck
                </Label>
                <Input
                  id="truck"
                  className="col-span-3"
                  value={editingAllocation?.truckNumber || ''}
                  onChange={(e) => setEditingAllocation(prev => 
                    prev ? {...prev, truckNumber: e.target.value} : null
                  )}
                />
              </div>
              <div className="grid grid-cols-4 items-center gap-4">
                <Label htmlFor="volume" className="text-right">
                  Volume
                </Label>
                <Input
                  id="volume"
                  type="number"
                  className="col-span-3"
                  value={editingAllocation?.volume || ''}
                  onChange={(e) => setEditingAllocation(prev => 
                    prev ? {...prev, volume: Number(e.target.value)} : null
                  )}
                />
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => handleEditAllocation(false)}>
                Cancel
              </Button>
              <Button onClick={() => handleEditAllocation(true)}>
                Save Changes
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    )
}
