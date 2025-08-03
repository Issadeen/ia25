'use client'

import React from 'react'
import { useState, useEffect } from 'react'
import { useSession } from "next-auth/react"
import { useRouter, useSearchParams } from 'next/navigation'
import { useTheme } from "next-themes"
import { getDatabase, ref, push, query, orderByChild, equalTo, get, set } from 'firebase/database'
import { 
  ArrowLeft,
  Sun,
  Moon,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { motion } from 'framer-motion'
import { auth, storage } from "@/lib/firebase"
import { getDownloadURL, ref as storageRef } from "firebase/storage"
import { useToast } from "@/components/ui/use-toast"
import { useProfileImage } from '@/hooks/useProfileImage'
import { Badge } from "@/components/ui/badge"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Switch } from "@/components/ui/switch"
import { Label } from "@/components/ui/label"
import { cn } from '@/lib/utils'
import { WorkPermitService } from '@/services/work-permit-service'

const AddEntriesPage: React.FC = () => {
  // 1. Declare hooks first
  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const { toast } = useToast()
  const profilePicUrl = useProfileImage()
  const searchParams = useSearchParams()

  // 2. Declare all state
  const [tr800Number, setTr800Number] = useState('')
  const [tr800Quantity, setTr800Quantity] = useState('')
  const [product, setProduct] = useState('')
  const [destination, setDestination] = useState('')
  const [truck, setTruck] = useState('')
  const [depot, setDepot] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [mounted, setMounted] = useState(false)
  const [profileImageLoaded, setProfileImageLoaded] = useState(false)
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
  const [isSaving, setIsSaving] = useState(false)
  const [showEntries, setShowEntries] = useState(false)
  const [editMode, setEditMode] = useState(false)
  const [entries, setEntries] = useState<any[]>([])
  const [editingEntry, setEditingEntry] = useState<any>(null)
  const [showEditDialog, setShowEditDialog] = useState(false)
  const [showAllEntries, setShowAllEntries] = useState(false)

  // 3. Define helper functions before useEffect
  const fetchEntries = async () => {
    const db = getDatabase()
    const entriesRef = ref(db, 'tr800')
    const snapshot = await get(entriesRef)
    if (snapshot.exists()) {
      const entriesData = Object.entries(snapshot.val())
        .map(([key, value]: [string, any]) => ({
          id: key,
          ...value
        }))
        .filter(entry => showAllEntries || entry.remainingQuantity > 0)
        .sort((a, b) => b.timestamp - a.timestamp) // Sort by newest first
      
      setEntries(entriesData)
    }
  }

  const handleEditSave = async () => {
    if (!editingEntry) return

    try {
      const db = getDatabase()
      const entryRef = ref(db, `tr800/${editingEntry.id}`)
      
      // Create audit log
      const auditRef = push(ref(db, 'entries_audit_log'))
      await set(auditRef, {
        entryId: editingEntry.id,
        oldData: entries.find(e => e.id === editingEntry.id),
        newData: editingEntry,
        changedBy: session?.user?.name || 'unknown',
        changedAt: new Date().toISOString()
      })

      // Update entry
      await set(entryRef, {
        ...editingEntry,
        lastModifiedBy: session?.user?.name,
        lastModifiedAt: new Date().toISOString()
      })

      toast({
        title: "Entry Updated",
        description: "Changes have been saved and logged",
      })

      setShowEditDialog(false)
      setEditingEntry(null)
      fetchEntries()
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update entry",
        variant: "destructive"
      })
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSaving(true)

    try {
      // Validation
      if (!tr800Number.trim() || !tr800Quantity || !product.trim() || !destination.trim()) {
        toast({
          title: "Validation Error",
          description: "All required fields must be filled",
          variant: "destructive"
        })
        setIsSaving(false)
        return
      }

      const db = getDatabase()
      
      // Check for duplicates using transaction
      const tr800Ref = ref(db, `tr800/${tr800Number.trim()}`)
      const snapshot = await get(tr800Ref)

      if (snapshot.exists()) {
        const existingEntry = snapshot.val()
        toast({
          title: "Duplicate Entry Found",
          description: (
            <div className="space-y-2">
              <p className="font-medium text-red-600 dark:text-red-400">
                TR830 number already exists with following details:
              </p>
              <ul className="text-sm space-y-1 list-disc list-inside">
                <li>Product: {existingEntry.product}</li>
                <li>Destination: {existingEntry.destination}</li>
                <li>Initial Quantity: {existingEntry.initialQuantity}</li>
                <li>Created by: {existingEntry.createdBy}</li>
                <li>Date: {new Date(existingEntry.timestamp).toLocaleString()}</li>
              </ul>
            </div>
          ),
          variant: "destructive",
          duration: 6000, // Show for 6 seconds due to more content
        })
        setIsSaving(false)
        return
      }

      // Prepare entry data
      const entryData = {
        number: tr800Number.trim(),
        initialQuantity: parseFloat(tr800Quantity),
        remainingQuantity: parseFloat(tr800Quantity),
        product: product.trim().toLowerCase(),
        destination: destination.trim().toLowerCase(),
        product_destination: `${product.trim().toLowerCase()}_${destination.trim().toLowerCase()}`,
        timestamp: Date.now(),
        createdBy: session?.user?.name || 'unknown',
        truck: truck.trim() || null,
        depot: depot.trim() || null
      }

      // Save to tr800
      await set(tr800Ref, entryData)

      // Save to allocations if destination is SSD
      if (destination.trim().toLowerCase() === 'ssd') {
        const allocationsRef = ref(db, `allocations/${tr800Number.trim()}`)
        await set(allocationsRef, entryData)
      }

      // Attempt to allocate permit immediately
      const permitService = new WorkPermitService(db)
      const result = await permitService.allocatePermitForWorkOrder(tr800Number.trim())
      
      if (!result.success) {
        console.warn('Permit allocation warning:', result.error)
        // Don't block order creation if permit allocation fails
      }

      toast({
        title: "Success",
        description: "Entry saved successfully",
      })

      // Reset form
      setTr800Number('')
      setTr800Quantity('')
      setProduct('')
      setDestination('')
      setTruck('')
      setDepot('')

    } catch (error: any) {
      console.error('Save error:', error)
      toast({
        title: "Error",
        description: error.message || "Failed to save entry",
        variant: "destructive"
      })
    } finally {
      setIsSaving(false)
    }
  }

  // 4. Define useEffect hooks
  useEffect(() => {
    setMounted(true)
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  // Add effect to track when profile image has loaded
  useEffect(() => {
    if (profilePicUrl) {
      setProfileImageLoaded(true)
    }
  }, [profilePicUrl])

  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.altKey && e.key === 'v') {
        e.preventDefault()
        if (!showEntries) {
          const password = prompt("Enter admin password to view entries:")
          if (password === process.env.NEXT_PUBLIC_PRICE_VIEW_PASSWORD) {
            setShowEntries(true)
            fetchEntries()
            toast({
              title: "Entries Visible",
              description: "Entries are now visible. Press Ctrl+Alt+V to hide.",
            })
          }
        } else {
          setShowEntries(false)
          setEditMode(false)
        }
      }

      if (e.ctrlKey && e.altKey && e.key === 'e' && showEntries) {
        e.preventDefault()
        const password = prompt("Enter admin password to edit entries:")
        if (password === process.env.NEXT_PUBLIC_PRICE_EDIT_PASSWORD) {
          setEditMode(true)
          toast({
            title: "Edit Mode",
            description: "You can now edit entries. Press Ctrl+Alt+E to disable.",
          })
        }
      }
    }

    window.addEventListener('keydown', handleKeyPress)
    return () => window.removeEventListener('keydown', handleKeyPress)
  }, [showEntries, toast])

  useEffect(() => {
    if (showEntries) {
      fetchEntries()
    }
  }, [showAllEntries, showEntries])

  // Parse query params on mount
  useEffect(() => {
    if (searchParams) {
      const truckParam = searchParams.get('truck')
      const depotParam = searchParams.get('depot')
      if (truckParam) setTruck(truckParam)
      if (depotParam) setDepot(depotParam)
    }
  }, [searchParams])

  // 5. Handle early return
  if (!mounted || status === "loading") return null

  const avatarSrc = session?.user?.image || profilePicUrl || ''

  // 6. Render component
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push('/dashboard/work')}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Add TR830 Entry
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
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
                src={avatarSrc} 
                alt={session?.user?.name || 'User Profile'}
                onLoad={() => console.log("Avatar image loaded:", avatarSrc)}
                onError={() => console.warn("Failed to load avatar image:", avatarSrc)}
              />
              <AvatarFallback className="bg-emerald-100 text-emerald-700">
                {session?.user?.name?.[0] || "U"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <div className="max-w-2xl mx-auto">
            <div className="p-6 rounded-xl bg-white/50 dark:bg-gray-900/50 backdrop-blur-sm border border-gray-200/50 dark:border-gray-800/50">
              <form onSubmit={handleSubmit} className="space-y-6">
                <div className="grid gap-6 md:grid-cols-2">
                  <div className="space-y-2">
                    <label className="text-sm font-medium">TR830 Number <span className="text-red-500">*</span></label>
                    <Input
                      required
                      value={tr800Number}
                      onChange={(e) => setTr800Number(e.target.value)}
                      placeholder="Enter TR830 number"
                      className="bg-white/50 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Quantity <span className="text-red-500">*</span></label>
                    <Input
                      required
                      type="number"
                      step="0.01"
                      value={tr800Quantity}
                      onChange={(e) => setTr800Quantity(e.target.value)}
                      placeholder="Enter quantity"
                      className="bg-white/50 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Product <span className="text-red-500">*</span></label>
                    <Input
                      required
                      value={product}
                      onChange={(e) => setProduct(e.target.value.toLowerCase())}
                      placeholder="Enter product name"
                      className="bg-white/50 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/50"
                    />
                  </div>
                  <div className="space-y-2">
                    <label className="text-sm font-medium">Destination <span className="text-red-500">*</span></label>
                    <Input
                      required
                      value={destination}
                      onChange={(e) => setDestination(e.target.value.toLowerCase())}
                      placeholder="Enter destination"
                      className="bg-white/50 dark:bg-gray-800/50 border-gray-200/50 dark:border-gray-700/50"
                    />
                  </div>

                </div>

                <Button 
                  type="submit" 
                  className="w-full bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-600 hover:from-emerald-500 hover:via-teal-400 hover:to-blue-500 text-white"
                  disabled={isSaving}
                >
                  {isSaving ? (
                    <span className="flex items-center gap-2">
                      <span className="animate-spin">⏳</span> Saving...
                    </span>
                  ) : 'Add Entry'}
                </Button>
              </form>
            </div>
          </div>
        </motion.div>

        {showEntries && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-8"
          >
            <Card>
              <CardHeader>
                <div className="flex justify-between items-center">
                  <CardTitle>TR830 Entries</CardTitle>
                  <div className="flex items-center gap-6">
                    <div className="flex items-center space-x-2">
                      <Switch
                        id="show-all"
                        checked={showAllEntries}
                        onCheckedChange={setShowAllEntries}
                      />
                      <Label htmlFor="show-all" className="text-sm">
                        Show All Entries
                      </Label>
                    </div>
                    {editMode && (
                      <Badge variant="outline">Edit Mode</Badge>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Number</TableHead>
                        <TableHead>Product</TableHead>
                        <TableHead>Destination</TableHead>
                        <TableHead>Initial Qty</TableHead>
                        <TableHead>Remaining Qty</TableHead>
                        <TableHead>Created By</TableHead>
                        <TableHead>Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {entries.map((entry) => (
                        <TableRow 
                          key={entry.id}
                          className={cn(
                            entry.remainingQuantity === 0 && "opacity-60"
                          )}
                        >
                          <TableCell>{entry.number}</TableCell>
                          <TableCell>{entry.product}</TableCell>
                          <TableCell>{entry.destination}</TableCell>
                          <TableCell>{entry.initialQuantity}</TableCell>
                          <TableCell>{entry.remainingQuantity}</TableCell>
                          <TableCell>{entry.createdBy}</TableCell>
                          <TableCell>
                            {editMode && (
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setEditingEntry(entry)
                                  setShowEditDialog(true)
                                }}
                              >
                                Edit
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}

        <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Edit Entry</DialogTitle>
            </DialogHeader>
            {editingEntry && (
              <div className="space-y-4">
                <div>
                  <label className="text-sm font-medium">TR830 Number</label>
                  <Input
                    value={editingEntry.number}
                    onChange={(e) => setEditingEntry({
                      ...editingEntry,
                      number: e.target.value
                    })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Product</label>
                  <Input
                    value={editingEntry.product}
                    onChange={(e) => setEditingEntry({
                      ...editingEntry,
                      product: e.target.value.toLowerCase()
                    })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Destination</label>
                  <Input
                    value={editingEntry.destination}
                    onChange={(e) => setEditingEntry({
                      ...editingEntry,
                      destination: e.target.value.toLowerCase()
                    })}
                  />
                </div>
                <div>
                  <label className="text-sm font-medium">Initial Quantity</label>
                  <Input
                    type="number"
                    value={editingEntry.initialQuantity}
                    onChange={(e) => setEditingEntry({
                      ...editingEntry,
                      initialQuantity: parseFloat(e.target.value)
                    })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <Button variant="outline" onClick={() => setShowEditDialog(false)}>
                    Cancel
                  </Button>
                  <Button onClick={handleEditSave}>
                    Save Changes
                  </Button>
                </div>
              </div>
            )}
          </DialogContent>
        </Dialog>
      </main>
    </div>
  )
}

export default AddEntriesPage