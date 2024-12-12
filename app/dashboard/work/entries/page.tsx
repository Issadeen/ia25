'use client'

import { useState, useEffect, useRef } from "react"
import { useSession, signOut } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { 
  ArrowLeft,
  Sun,
  Moon,
  FileText,
  PieChart,
  AlertTriangle, // Change this line
  RefreshCw,
  Loader2,
  ClipboardList,
  ChevronDown, 
  ChevronUp // Add this import
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

// Add this helper function for highlighting text
function highlightText(text: string, filter: string) {
  if (!filter) return text;
  const regex = new RegExp(`(${filter})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) => 
    regex.test(part) ? (
      <span key={i} className="bg-yellow-200 dark:bg-yellow-900 rounded px-1">
        {part}
      </span>
    ) : part
  );
}

// Add new interface for pending orders
interface PendingOrderSummary {
  product: string;
  destination: string;
  totalQuantity: number;
  orders: {
    truckNumber: string;
    quantity: number;
    orderno: string;
  }[];
}

export default function EntriesPage() {
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
  interface Summary {
    productDestination: string;
    remainingQuantity: number;
    estimatedTrucks: number;
    motherEntries: { number: string; remainingQuantity: number }[];
  }

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
  const [warningTimeout, setWarningTimeout] = useState<NodeJS.Timeout | null>(null)

  // 2. Other hooks
  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const inactivityTimeoutRef = useRef<NodeJS.Timeout | null>(null)

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
  const verifyWorkIdAgainstDb = async (inputWorkId: string) => {
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
  }

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
          
          destGroup.orders.push({
            truckNumber: order.truck_number,
            quantity: parseFloat(order.quantity),
            orderno: order.orderno
          })
          destGroup.totalQuantity += parseFloat(order.quantity)
        })
  
      // Convert to array and sort
      const sortedOrders = Object.entries(productGroups)
        .sort(([a], [b]) => b.localeCompare(a)) // AGO before PMS
        .flatMap(([_, groups]) => 
          groups.sort((a, b) => a.destination.localeCompare(b.destination))
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

  // 4. Effects
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
    const handleActivity = () => {
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
      }
      if (warningTimeout) {
        clearTimeout(warningTimeout)
      }

      // Set warning at 9 minutes
      const warning = setTimeout(() => {
        setWarningMessage("Your session will expire in 1 minute due to inactivity.")
        setShowWarningModal(true)
      }, 9 * 60 * 1000)
      
      setWarningTimeout(warning)

      // Logout at 10 minutes
      inactivityTimeoutRef.current = setTimeout(async () => {
        await signOut()
        router.push('/login')
      }, 10 * 60 * 1000)
    }

    window.addEventListener('mousemove', handleActivity)
    window.addEventListener('keydown', handleActivity)
    window.addEventListener('click', handleActivity)
    handleActivity()

    return () => {
      window.removeEventListener('mousemove', handleActivity)
      window.removeEventListener('keydown', handleActivity)
      window.removeEventListener('click', handleActivity)
      if (inactivityTimeoutRef.current) {
        clearTimeout(inactivityTimeoutRef.current)
      }
      if (warningTimeout) {
        clearTimeout(warningTimeout)
      }
    }
  }, [router])

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

  // 5. Loading check
  if (!mounted || status === "loading") return null

  // 6. Event handlers
  const getEntries = async () => {
    if (!truckNumber || !destination || !product || !at20Quantity) {
      toast({
        title: "Validation Error",
        description: "Please fill all fields",
        variant: "destructive"
      })
      return
    }
  
    // For SSD destination, check permit entry
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
      // First, validate if the permit entry exists and matches product
      if (destination.toLowerCase() === 'ssd') {
        const permitEntrySnapshot = await get(dbRef(db, `tr800/${entryUsedInPermit}`))
        if (!permitEntrySnapshot.exists()) {
          toast({
            title: "Invalid Permit Entry",
            description: "The selected permit entry does not exist",
            variant: "destructive"
          })
          setIsLoading(false)
          return
        }
  
        const permitEntryData = permitEntrySnapshot.val()
        if (permitEntryData.product.toLowerCase() !== product.toLowerCase()) {
          toast({
            title: "Product Mismatch",
            description: "The permit entry product does not match the selected product",
            variant: "destructive"
          })
          setIsLoading(false)
          return
        }
      }
  
      // Now proceed with allocation
      let required = parseFloat(at20Quantity)
      const allocations: Entry[] = []
      const updates: { [key: string]: any } = {}
      const tempOriginalData: { [key: string]: any } = {}
  
      // Get or create the permit entry
      const permitEntry = destination.toLowerCase() === 'ssd' ? {
        key: entryUsedInPermit,
        ...await (await get(dbRef(db, `tr800/${entryUsedInPermit}`))).val()
      } : null
  
      // Use permit entry for allocation
      if (permitEntry && permitEntry.remainingQuantity >= required) {
        const updatedEntry = {
          ...permitEntry,
          remainingQuantity: permitEntry.remainingQuantity - required
        }
        
        updates[`tr800/${permitEntry.key}`] = updatedEntry
        tempOriginalData[permitEntry.key] = { ...permitEntry }
        
        allocations.push({
          key: permitEntry.key,
          motherEntry: permitEntry.number,
          initialQuantity: permitEntry.initialQuantity,
          remainingQuantity: updatedEntry.remainingQuantity,
          truckNumber,
          destination,
          subtractedQuantity: required,
          number: permitEntry.number,
          product,
          product_destination: `${product}-${destination}`,
          timestamp: Date.now()
        })
  
        // Save truck entry
        const sanitizedTruckNumber = truckNumber.replace(/\//g, '-')
        const truckEntryRef = dbRef(db, `truckEntries/${sanitizedTruckNumber}`)
        const truckEntryData = {
          entryNumber: permitEntry.number,
          subtractedQuantity: required,
          timestamp: Date.now()
        }
        await push(truckEntryRef, truckEntryData)
      } else {
        toast({
          title: "Insufficient Quantity",
          description: "The permit entry does not have sufficient quantity",
          variant: "destructive"
        })
        setIsLoading(false)
        return
      }
  
      // Apply all updates in one transaction
      await update(dbRef(db), updates)
  
      setOriginalData(tempOriginalData)
      setEntriesData(allocations)
  
      toast({
        title: "Allocation Successful",
        description: `Allocated ${required.toFixed(2)} liters to truck ${truckNumber}`
      })
  
      // Clear form after successful allocation
      clearForm()
  
    } catch (error) {
      toast({
        title: "Allocation Failed",
        description: "Failed to process allocation. Please try again.",
        variant: "destructive"
      })
    } finally {
      setIsLoading(false)
    }
  }
  

  const getSummary = async () => {
    const db = getDatabase()
    const tr800Ref = dbRef(db, 'tr800')
    try {
      const snapshot = await get(tr800Ref)
      if (snapshot.exists()) {
        let summary: { [key: string]: any } = {}
        
        snapshot.forEach((childSnapshot) => {
          const data = childSnapshot.val()
          // Format key as "product - destination" (both lowercase)
          const key = `${data.product.toLowerCase()} - ${data.destination.toLowerCase()}`
          
          if (!summary[key]) {
            summary[key] = {
              remainingQuantity: 0,
              estimatedTrucks: 0,
              motherEntries: []
            }
          }
          
          if (data.remainingQuantity > 0) {
            summary[key].remainingQuantity += data.remainingQuantity
            summary[key].motherEntries.push({
              number: data.number,
              remainingQuantity: data.remainingQuantity
            })
          }
        })

        // Filter and format summary array
        const summaryArray = Object.entries(summary)
          .filter(([_, value]) => value.remainingQuantity > 0)
          .map(([key, value]) => ({
            productDestination: key,
            ...value,
            estimatedTrucks: value.remainingQuantity / (key.includes('ago') ? 36000 : 40000)
          }))
          // Sort first by product (ago before pms) then by destination
          .sort((a, b) => {
            const [aProduct] = a.productDestination.split(' - ')
            const [bProduct] = b.productDestination.split(' - ')
            if (aProduct !== bProduct) {
              return aProduct.localeCompare(bProduct)
            }
            return a.productDestination.localeCompare(b.productDestination)
          })

        setSummaryData(summaryArray)
        setShowSummary(true)
        setShowUsage(false)
        fetchPendingOrders()
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to fetch summary",
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
  
      // Get the truck number from the first entry
      const truckNumber = entriesData[0]?.truckNumber
      if (!truckNumber) {
        throw new Error("No truck number found")
      }
  
      // Restore original TR800 data, ensuring all required fields are present
      for (const key in originalData) {
        const data = originalData[key]
        // Only include fields that exist in the original data
        updates[`tr800/${key}`] = {
          number: data.number,
          initialQuantity: data.initialQuantity,
          remainingQuantity: data.remainingQuantity,
          product: data.product,
          destination: data.destination,
          product_destination: data.product_destination,
          timestamp: data.timestamp,
          // Only include status if it exists in original data
          ...(data.status && { status: data.status })
        }
      }
  
      // Remove truck entries
      const sanitizedTruckNumber = truckNumber.replace(/\//g, '-')
      const truckRef = dbRef(db, `truckEntries/${sanitizedTruckNumber}`)
      const truckSnapshot = await get(truckRef)
  
      if (truckSnapshot.exists()) {
        const motherEntries = entriesData.map(entry => entry.motherEntry)
        
        truckSnapshot.forEach(childSnapshot => {
          const entryData = childSnapshot.val()
          if (motherEntries.includes(entryData.entryNumber)) {
            updates[`truckEntries/${sanitizedTruckNumber}/${childSnapshot.key}`] = null
          }
        })
      }
  
      // Apply all updates in a single transaction
      await update(dbRef(db), updates)
  
      toast({
        title: "Success",
        description: "Successfully undid the last allocation"
      })
  
      // Reset states
      setOriginalData({})
      setEntriesData([])
      
      // Refresh usage data if showing
      if (showUsage) {
        await getUsage()
      }
  
    } catch (error) {
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

  // Add this function after your existing event handlers
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
            </div>
          </div>

          {/* Summary info note */}
          <div className="mb-4 text-sm text-muted-foreground">
            Note: Only showing entries with available quantities. Entries and destinations not shown have zero balance.
          </div>

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
                    {summaryData.map((item, index) => {
                      // Split and format product-destination
                      const [product, destination] = item.productDestination.split(' - ')
                      return (
                        <TableRow 
                          key={index}
                          className="border-b border-emerald-500/10 hover:bg-emerald-50/50 dark:hover:bg-emerald-900/20"
                        >
                          <TableCell className="font-medium">
                            {`${product.toUpperCase()} - ${destination.toUpperCase()}`}
                          </TableCell>
                          <TableCell>{item.remainingQuantity.toLocaleString(undefined, {minimumFractionDigits: 2, maximumFractionDigits: 2})}</TableCell>
                          <TableCell>{item.estimatedTrucks.toFixed(2)}</TableCell>
                          <TableCell>
                            {item.motherEntries.map(entry => 
                              `${entry.number} (${entry.remainingQuantity.toLocaleString()})`
                            ).join(', ')}
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
            </CardContent>
          </Card>
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

              {availableEntries.length > 0 && (
                <div className="mt-6">
                  <Label className="text-lg font-semibold mb-4">Available Entries:</Label>
                  <div className="space-y-2 mt-2">
                    {availableEntries.map((entry) => (
                      <div key={entry.key} className="flex items-center gap-4 p-3 border rounded hover:bg-accent">
                        <input
                          type="checkbox"
                          id={`entry-${entry.key}`}
                          checked={selectedEntries.includes(entry.key)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedEntries([...selectedEntries, entry.key])
                            } else {
                              setSelectedEntries(selectedEntries.filter(id => id !== entry.key))
                            }
                          }}
                          className="w-4 h-4"
                        />
                        <Label htmlFor={`entry-${entry.key}`} className="flex-1 cursor-pointer">
                          {entry.number} - Remaining: {entry.remainingQuantity}
                        </Label>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="mt-6 flex flex-col sm:flex-row gap-3">
                <Button 
                  type="button" // Add this to prevent form submission
                  onClick={async () => {
                    try {
                      if (!truckNumber || !destination || !product || !at20Quantity || selectedEntries.length === 0) {
                        toast({
                          title: "Validation Error",
                          description: "Please fill all fields and select at least one entry",
                          variant: "destructive"
                        })
                        return
                      }
  
                      setIsLoading(true)
                      const db = getDatabase()
                      const updates: { [key: string]: any } = {}
                      const tempOriginalData: { [key: string]: any } = {}
                      const allocations: Entry[] = []
                      let required = parseFloat(at20Quantity)
                      let remaining = required
  
                      // Process selected entries
                      for (const entryKey of selectedEntries) {
                        const entry = availableEntries.find(e => e.key === entryKey)
                        if (!entry) continue
  
                        const toAllocate = Math.min(entry.remainingQuantity, remaining)
                        
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
                        
                        remaining -= toAllocate
                        if (remaining <= 0) break
                      }
  
                      if (remaining > 0) {
                        const totalAvailable = selectedEntries
                          .map(key => availableEntries.find(e => e.key === key)?.remainingQuantity || 0)
                          .reduce((sum, qty) => sum + qty, 0)
                        
                        if (!confirm(`Only ${totalAvailable.toFixed(2)} liters available in selected entries. Continue with partial allocation?`)) {
                          setIsLoading(false)
                          return
                        }
                      }
  
                      // Save truck entries
                      const sanitizedTruckNumber = truckNumber.replace(/\//g, '-')
                      for (const allocation of allocations) {
                        const truckEntryRef = dbRef(db, `truckEntries/${sanitizedTruckNumber}`)
                        await push(truckEntryRef, {
                          entryNumber: allocation.number,
                          subtractedQuantity: allocation.subtractedQuantity,
                          timestamp: Date.now()
                        })
                      }
  
                      // Apply all updates
                      await update(dbRef(db), updates)
                      
                      setOriginalData(tempOriginalData)
                      setEntriesData(allocations)
                      
                      toast({
                        title: "Success",
                        description: `Allocated ${(required - remaining).toFixed(2)} liters to truck ${truckNumber}`
                      })
                      
                      // Clear form and close manual allocation
                      clearForm()
                      setSelectedEntries([])
                      setShowManualAllocation(false)
                      
                    } catch (error) {
                      toast({
                        title: "Error",
                        description: "Failed to process manual allocation",
                        variant: "destructive"
                      })
                    } finally {
                      setIsLoading(false)
                    }
                  }}
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
                    setSelectedEntries([])
                  }}
                  className="w-full sm:w-auto border-emerald-500/30 hover:border-emerald-500/50"
                >
                  Clear Form
                </Button>
                <Button
                  variant="secondary"
                  onClick={() => {
                    setShowManualAllocation(false)
                    clearForm()
                    setSelectedEntries([])
                  }}
                  className="w-full sm:w-auto"
                >
                  Cancel
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
        <Card className="border-0 shadow-lg">
          <CardHeader className="pb-0">
            <CardTitle className="text-2xl">Allocate Entries</CardTitle>
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
                onChange={(e) => setProduct(e.target.value.toLowerCase())}
              />
              <Input
                placeholder="Destination"
                value={destination}
                onChange={(e) => setDestination(e.target.value.toLowerCase())}
              />
              <Input
                placeholder="AT20 Quantity"
                value={at20Quantity}
                onChange={(e) => setAt20Quantity(e.target.value)}
              />
            </div>
            {destination.trim().toLowerCase() === 'ssd' && (
              <div className="mt-4">
                <Label htmlFor="entryUsedInPermit">Select Entry Used in Permit</Label>
                {availablePermitEntries.length > 0 ? (
                  <div className="space-y-2 mt-2 max-h-40 overflow-y-auto border rounded-md p-2">
                    {availablePermitEntries.map((entry) => (
                      <div 
                        key={entry.key} 
                        className={`flex items-center justify-between p-2 rounded hover:bg-accent cursor-pointer ${
                          entryUsedInPermit === entry.key ? 'bg-primary/10' : ''
                        }`}
                        onClick={() => setEntryUsedInPermit(entry.key)}
                      >
                        <div className="flex flex-col">
                          <span className="font-medium">{entry.number}</span>
                          <span className="text-sm text-muted-foreground">
                            Product: {entry.product.toUpperCase()} | 
                            Remaining: {entry.remainingQuantity.toLocaleString()} liters
                          </span>
                        </div>
                        <input 
                          type="radio"
                          checked={entryUsedInPermit === entry.key}
                          onChange={() => setEntryUsedInPermit(entry.key)}
                          className="h-4 w-4"
                        />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="mt-2 text-muted-foreground text-sm">
                    No available entries found for {product.toUpperCase()} to SSD
                  </div>
                )}
              </div>
            )}
            {volumeWarning && (
              <div className="mt-4 text-yellow-600 dark:text-yellow-400">
                {volumeWarning}
              </div>
            )}
            <div className="mt-6 flex gap-4">
              <Button 
                onClick={getEntries} 
                disabled={isLoading}
                className="flex items-center gap-2"
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
              >
                Clear Form
              </Button>
              {lastFormState.truckNumber && (
                <Button
                  variant="secondary"
                  onClick={restoreLastForm}
                  className="flex items-center gap-2"
                >
                  <ArrowLeft className="h-4 w-4" /> Restore Last Entry
                </Button>
              )}
            </div>
            {/* {renderEntriesSection()} */}
          </CardContent>
        </Card>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            <Card className="mt-6 border-red-500 bg-red-50 dark:bg-red-900/10">
              <CardContent className="p-6">
                <div className="flex items-center gap-2 text-red-600 dark:text-red-400">
                  <AlertTriangle className="h-5 w-5" /> {/* Change this line */}
                  <p>{error}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        {entriesData.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2, duration: 0.3 }}
          >
            <Card className={`mt-6 ${theme === 'dark' ? 'bg-gray-800/50' : 'bg-white'} backdrop-blur-md border-0 shadow-lg`}>
              <CardHeader className="pb-0">
                <div className="flex justify-between items-center">
                  <CardTitle className="text-2xl">Allocated Entries</CardTitle>
                  <Button 
                    variant="destructive" 
                    onClick={undoAllocation}
                    className="flex items-center gap-2"
                  >
                    <ArrowLeft className="h-4 w-4" /> Undo Allocation
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="p-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Mother Entry</TableHead>
                      <TableHead>Initial Quantity</TableHead>
                      <TableHead>Remaining Quantity</TableHead>
                      <TableHead>Truck Number</TableHead>
                      <TableHead>Destination</TableHead>
                      <TableHead>Subtracted Quantity</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {entriesData.map((entry, index) => (
                      <TableRow key={index}>
                        <TableCell>{entry.motherEntry}</TableCell>
                        <TableCell>{entry.initialQuantity}</TableCell>
                        <TableCell>{entry.remainingQuantity}</TableCell>
                        <TableCell>{entry.truckNumber}</TableCell>
                        <TableCell>{entry.destination}</TableCell>
                        <TableCell>{entry.subtractedQuantity}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </motion.div>
    )
  }

  // Update renderPendingOrders to show grouped data
  const renderPendingOrders = () => {
    if (isPendingLoading) {
      return (
        <Card className="mb-6">
          <CardContent className="p-6">
            <div className="flex items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin" />
            </div>
          </CardContent>
        </Card>
      )
    }
  
    if (pendingOrders.length === 0) {
      return null
    }
  
    // Group orders by product for better organization
    const productGroups = pendingOrders.reduce((groups: { [key: string]: PendingOrderSummary[] }, order) => {
      if (!groups[order.product]) {
        groups[order.product] = []
      }
      groups[order.product].push(order)
      return groups
    }, {})
  
    return (
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-xl">Pending Orders</CardTitle>
            <Button 
              variant="outline" 
              size="sm"
              onClick={fetchPendingOrders}
              className="flex items-center gap-2"
            >
              <RefreshCw className="h-4 w-4" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-6">
          <div className="space-y-6">
            {Object.entries(productGroups).map(([product, groups]) => (
              <div key={product} className="space-y-4">
                {groups.map((group, index) => (
                  <Card key={`${product}-${group.destination}-${index}`} className="border bg-muted/50">
                    <CardHeader className="pb-2">
                      <CardTitle className="text-lg">
                        {group.product} - {group.destination}
                      </CardTitle>
                      <p className="text-base font-medium">
                        Total: {group.totalQuantity.toLocaleString()} liters
                      </p>
                    </CardHeader>
                    <CardContent className="pt-0">
                      <div className="mt-2 space-y-2">
                        {group.orders.map((order, orderIndex) => (
                          <div 
                            key={orderIndex}
                            className="text-sm flex justify-between items-center py-1 border-t first:border-t-0"
                          >
                            <span className="font-medium">{order.truckNumber}</span>
                            <span className="text-muted-foreground">
                              {order.quantity.toLocaleString()}L
                            </span>
                          </div>
                        ))}
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    )
  }

  // Update avatar sourcing
  const avatarSrc = session?.user?.image || lastUploadedImage || ''

  // Add warning modal component
  const WarningModal = () => {
    if (!showWarningModal) return null

    return (
      <motion.div
        initial={{ opacity: 0, y: -50 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: -50 }}
        className="fixed top-20 right-4 z-50"
      >
        <div className="bg-yellow-500/90 dark:bg-yellow-600/90 backdrop-blur-sm text-white px-6 py-4 rounded-lg shadow-lg border border-yellow-400/50">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 mt-0.5 flex-shrink-0" />
            <div className="flex-1">
              <h3 className="font-semibold mb-1">Session Warning</h3>
              <p className="text-sm">{warningMessage}</p>
              <Button 
                size="sm"
                variant="outline"
                onClick={() => setShowWarningModal(false)}
                className="mt-2 text-white border-white/50 hover:bg-yellow-600/50"
              >
                Dismiss
              </Button>
            </div>
          </div>
        </div>
      </motion.div>
    )
  }

  return (
    <div className={`min-h-screen ${
      theme === 'dark' ? 'bg-gray-900/50 text-gray-100' : 'bg-gray-50/50 text-gray-900'
    } backdrop-blur-sm`}>
      <header className={`fixed top-0 left-0 right-0 z-50 w-full border-b ${
        theme === 'dark' 
          ? 'bg-gray-900/70 border-gray-800/50' 
          : 'bg-white/70 border-gray-200/50'
      } backdrop-blur-md shadow-sm`}>
        <div className="container mx-auto px-4 py-3">
          <div className="flex justify-between items-center gap-4">
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => router.push('/dashboard/work')}
                className="text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="h-4 w-4 sm:h-5 sm:w-5" />
              </Button>
              <h1 className="text-lg sm:text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
                Allocate Entries
              </h1>
            </div>
            <div className="flex items-center gap-2 sm:gap-4">
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
                className="text-muted-foreground hover:text-foreground"
              >
                {theme === 'dark' ? 
                  <Sun className="h-4 w-4 sm:h-5 sm:w-5" /> : 
                  <Moon className="h-4 w-4 sm:h-5 sm:w-5" />
                }
              </Button>
              {/* Mobile-friendly avatar dropdown */}
              <div className="relative group">
                <Avatar className="h-8 w-8 sm:h-10 sm:w-10 cursor-pointer hover:opacity-80 transition-opacity">
                  <AvatarImage 
                    src={avatarSrc} 
                    alt="Profile"
                  />
                  <AvatarFallback className="text-sm sm:text-base">
                    {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
                <div className="absolute right-0 mt-2 w-48 py-2 bg-white dark:bg-gray-800 rounded-md shadow-lg opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200">
                  <div className="px-4 py-2 text-xs sm:text-sm text-gray-700 dark:text-gray-200 truncate">
                    {session?.user?.email}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 pt-20 sm:pt-24 pb-8">
        {/* Add the warning modal */}
        <AnimatePresence>
          <WarningModal />
        </AnimatePresence>

        {/* Replace the existing buttons section with this */}
        <motion.div 
          className="mb-4 sm:mb-6"
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
            <span>Actions Menu</span>
            {showMobileMenu ? (
              <ChevronUp className="h-4 w-4" />
            ) : (
              <ChevronDown className="h-4 w-4" />
            )}
          </Button>

          {/* Action Buttons */}
          <div className={`
            flex flex-col sm:flex-row gap-2 sm:gap-4
            ${showMobileMenu ? 'block' : 'hidden'}
            sm:flex
          `}>
            <Button 
              onClick={() => {
                getSummary()
                setCurrentView('summary')
                setShowMobileMenu(false)
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
      </main>
      <Dialog open={workIdDialogOpen} onOpenChange={setWorkIdDialogOpen}>
        <DialogContent>
          <form onSubmit={verifyWorkId}>
            <DialogHeader>
              <DialogTitle>Enter Work ID</DialogTitle>
              <DialogDescription>
                Please enter your Work ID to confirm this change
              </DialogDescription>
            </DialogHeader>
            <div className="grid gap-4 py-4">
              <Input
                placeholder="Enter Work ID"
                type="password"
                value={workId}
                onChange={(e) => setWorkId(e.target.value)}
                disabled={isVerifying}
                autoFocus
              />
              <Button 
                type="submit" 
                disabled={isVerifying || !workId}
              >
                {isVerifying ? "Verifying..." : "Verify"}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}