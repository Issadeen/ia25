'use client'

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Download, Search, Plus, Loader2, ChevronLeft, ChevronRight, Edit, Check, X, AlertCircle } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getDatabase, ref, onValue, push, update, get } from "firebase/database"
import { format } from "date-fns"
import * as XLSX from 'xlsx'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { storage } from "@/lib/firebase"
import { getDownloadURL, ref as storageRef } from "firebase/storage"
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { ThemeToggle } from "@/components/ui/molecules/theme-toggle"
import { Switch } from "@/components/ui/switch"
import { ToastAction } from "@/components/ui/toast"
import { useProfileImage } from '@/hooks/useProfileImage'

// Update the interface to handle multiple entries
interface AllocationReport {
  id?: string;  // Add this line
  truckNumber: string;
  entries: {
    id?: string; // Add this line
    volume: string;
    entryUsed: string;
  }[];
  allocationDate: string;
  loadedDate: string;  // Add this line
  at20: string;
  owner: string;
  product: string;
  entryDestination: string;
  depot: string;  // Add this line
  totalVolume?: string; // Added to store combined volume
}

// Update the form data interface
interface ReportFormData {
  truckNumber: string;
  owner: string;
  product: string;
  entryDestination: string;
  depot: string;  // Add this line
  at20: string;
  loadedDate: string;  // Add this line
  entries: {
    volume: string;
    entryUsed: string;
  }[];
}

// Update the initial state for formData
const initialFormData: ReportFormData = {
  truckNumber: '',
  owner: '',
  product: '',
  entryDestination: '',
  depot: '',  // Add this line
  at20: '',
  loadedDate: new Date().toISOString().split('T')[0], // Initialize with current date
  entries: [{ volume: '', entryUsed: '' }]
}

export default function ReportsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [reports, setReports] = useState<AllocationReport[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [mounted, setMounted] = useState(false)
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [formData, setFormData] = useState<ReportFormData>(initialFormData)
  const [currentDate, setCurrentDate] = useState(new Date())

  const { toast } = useToast()

  // Add these to existing state declarations
  const [monthClickCount, setMonthClickCount] = useState(0)
  const [showEditControls, setShowEditControls] = useState(false)
  const [editingReport, setEditingReport] = useState<string | null>(null)
  const [editFormData, setEditFormData] = useState<Partial<AllocationReport>>({})
  const [newReportId, setNewReportId] = useState<string | null>(null);
  const [isMigrating, setIsMigrating] = useState(false)
  const [showDuplicates, setShowDuplicates] = useState(false);
  const [showBulkUpdate, setShowBulkUpdate] = useState(false)
  const [bulkDepot, setBulkDepot] = useState("")
  const [selectedReports, setSelectedReports] = useState<string[]>([])
  const profilePicUrl = useProfileImage()

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  useEffect(() => {
    const db = getDatabase()
    const reportsRef = ref(db, 'allocation_reports')
    
    const unsubscribe = onValue(reportsRef, (snapshot) => {
      if (snapshot.exists()) {
        const reportsData = Object.entries(snapshot.val()).map(([key, value]) => ({
          id: key,
          ...(value as any)
        }));
        
        // Ensure entries array exists for each report
        const processedReports = reportsData.map(report => ({
          ...report,
          entries: Array.isArray(report.entries) ? report.entries : [
            {
              volume: report.volume || '0',
              entryUsed: report.entryUsed || ''
            }
          ]
        }));

        // Sort by loadedDate, oldest first
        setReports(processedReports.sort((a, b) => 
          new Date(a.loadedDate).getTime() - new Date(b.loadedDate).getTime()
        ));
      } else {
        setReports([]);
      }
    })

    return () => unsubscribe()
  }, [])

  // Add this after your existing useEffect hooks
  useEffect(() => {
    if (monthClickCount >= 3) {
      setShowEditControls(true)
      toast({
        title: "Edit Mode Activated",
        description: "You can now edit reports and migrate data",
      })
    }
  }, [monthClickCount])

  // Add this after the edit mode activation effect
  useEffect(() => {
    if (showEditControls) {
      toast({
        title: "Edit Mode Active",
        description: "You're in edit mode. Click here to exit.",
        action: (
          <ToastAction altText="Exit edit mode" onClick={() => setShowEditControls(false)}>
            Exit
          </ToastAction>
        ),
        duration: 0, // Keep showing until dismissed
      })
    }
  }, [showEditControls])

  const nextMonth = () => {
    setCurrentDate(prev => {
      const next = new Date(prev)
      next.setMonth(next.getMonth() + 1)
      return next
    })
  }

  const previousMonth = () => {
    setCurrentDate(prev => {
      const previous = new Date(prev)
      previous.setMonth(previous.getMonth() - 1)
      return previous
    })
  }

  const removeDuplicates = (reports: AllocationReport[]) => {
    const seen = new Map<string, AllocationReport>();
    const duplicates = new Set<string>();
  
    reports.forEach(report => {
      const key = `${report.loadedDate}-${report.truckNumber}`;
      if (seen.has(key)) {
        duplicates.add(key);
        // Keep the entry with depot information if available
        const existing = seen.get(key)!;
        if (!existing.depot && report.depot) {
          seen.set(key, report);
        }
      } else {
        seen.set(key, report);
      }
    });
  
    return {
      uniqueReports: Array.from(seen.values()),
      duplicateCount: duplicates.size
    };
  };

  const filteredReports = (() => {
    let filtered = reports.filter(report => {
      if (!report) return false;
      
      const reportDate = new Date(report.allocationDate);
      const isInCurrentMonth = 
        reportDate.getMonth() === currentDate.getMonth() && 
        reportDate.getFullYear() === currentDate.getFullYear();
  
      return isInCurrentMonth && (
        report.truckNumber?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.owner?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.product?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        report.entries?.some(entry => entry?.entryUsed?.toLowerCase().includes(searchTerm.toLowerCase()))
      );
    });
  
    if (!showDuplicates) {
      const { uniqueReports } = removeDuplicates(filtered);
      filtered = uniqueReports;
    }
  
    return filtered;
  })();

  // Add this helper function at the top level of your component
  const formatDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      return format(date, 'dd/MM/yyyy HH:mm');
    } catch (error) {
      return '-';
    }
  }

  const formatSimpleDate = (dateString: string | undefined) => {
    if (!dateString) return '-';
    try {
      const date = new Date(dateString);
      if (isNaN(date.getTime())) return '-';
      return format(date, 'dd-MMM-yyyy');
    } catch (error) {
      return '-';
    }
  }

  const exportToExcel = () => {
    // Prepare the data
    const data = filteredReports.map(report => ({
      'Loaded Date': formatSimpleDate(report.loadedDate),
      'Truck Number': report.truckNumber,
      'Owner': report.owner,
      'Product': report.product.toUpperCase(),
      'Volume': report.totalVolume ? `${report.totalVolume}L` : '-',
      'AT20': report.at20,
      'Entries': report.entries.map(entry => `${entry.entryUsed}: ${entry.volume}L`).join(', '),
      'Destination': report.entryDestination.toUpperCase(),
      'Depot': report.depot.toUpperCase()
    }))
  
    // Create worksheet
    const ws = XLSX.utils.json_to_sheet(data)
  
    // Set column widths
    const colWidths = {
      'A': 15, // Loaded Date
      'B': 15, // Truck Number
      'C': 20, // Owner
      'D': 10, // Product
      'E': 12, // Volume
      'F': 10, // AT20
      'G': 40, // Entries
      'H': 15, // Destination
      'I': 12  // Depot
    }
  
    ws['!cols'] = Object.values(colWidths).map(width => ({ width }))
  
    // Add styles
    const headerStyle = {
      font: { bold: true, color: { rgb: "FFFFFF" } },
      fill: { fgColor: { rgb: "10B981" } }, // Emerald-500
      alignment: { horizontal: "center" },
      border: {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      }
    }
  
    const cellStyle = {
      alignment: { horizontal: "left" },
      border: {
        top: { style: "thin" },
        bottom: { style: "thin" },
        left: { style: "thin" },
        right: { style: "thin" }
      }
    }
  
    // Apply styles to headers
    const range = XLSX.utils.decode_range(ws['!ref'] || 'A1:I1')
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const address = XLSX.utils.encode_cell({ r: 0, c: C })
      if (!ws[address]) continue
      ws[address].s = headerStyle
    }
  
    // Create workbook and add sheet
    const wb = XLSX.utils.book_new()
    wb.Props = {
      Title: "Allocation Reports",
      Subject: "Allocation Reports Export",
      Author: "System",
      CreatedDate: new Date()
    }
    
    XLSX.utils.book_append_sheet(wb, ws, 'Allocation Reports')
  
    // Generate file name with current month and year
    const fileName = `Allocation_Reports_${format(currentDate, 'MMM_yyyy')}.xlsx`
    
    // Save the file
    XLSX.writeFile(wb, fileName)
  
    toast({
      title: "Export Successful",
      description: `File saved as ${fileName}`,
      duration: 3000,
    })
  }

  // Add function to handle entry fields
  const handleEntryChange = (index: number, field: 'volume' | 'entryUsed', value: string) => {
    setFormData(prev => {
      const newEntries = [...prev.entries]
      newEntries[index] = { ...newEntries[index], [field]: value }
      return { ...prev, entries: newEntries }
    })
  }

  // Add function to add/remove entry fields
  const addEntry = () => {
    setFormData(prev => ({
      ...prev,
      entries: [...prev.entries, { volume: '', entryUsed: '' }]
    }))
  }

  const removeEntry = (index: number) => {
    if (formData.entries.length > 1) {
      setFormData(prev => ({
        ...prev,
        entries: prev.entries.filter((_, i) => i !== index)
      }))
    }
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      // Set default depot if not provided
      if (!formData.depot) {
        const destination = formData.entryDestination.toLowerCase();
        if (destination.includes('local')) {
          formData.depot = 'Local';
        } else if (destination === 'ssd') {
          formData.depot = 'SSD';
        } else if (destination.includes('north')) {
          formData.depot = 'Northern';
        } else if (destination.includes('west')) {
          formData.depot = 'Western';
        } else if (destination.includes('east')) {
          formData.depot = 'Eastern';
        } else {
          formData.depot = 'Unknown';
        }
      }

      const db = getDatabase()
      const reportRef = ref(db, 'allocation_reports')
      
      // Calculate total volume
      const totalVolume = formData.entries.reduce(
        (sum, entry) => sum + parseFloat(entry.volume || '0'), 
        0
      ).toString()

      const reportData = {
        truckNumber: formData.truckNumber,
        owner: formData.owner,
        product: formData.product,
        entryDestination: formData.entryDestination,
        depot: formData.depot,  // Add this line
        at20: formData.at20,
        entries: formData.entries,
        totalVolume,
        loadedDate: formData.loadedDate,  // Add this line
        allocationDate: new Date().toISOString()
      }

      const newReportRef = await push(reportRef, reportData)
      
      // Set the new report ID for highlighting
      setNewReportId(newReportRef.key)
      // Clear the highlight after 3 seconds
      setTimeout(() => setNewReportId(null), 3000)

      toast({
        title: "Success",
        description: "Report added successfully"
      })

      setIsAddModalOpen(false)
      setFormData(initialFormData) // Reset with initial data instead of empty values
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add report"
      })
    } finally {
      setIsSubmitting(false)
    }
  }

  // Add this helper function
  const handleMonthClick = () => {
    setMonthClickCount(prev => prev + 1)
    // Reset count after 2 seconds of no clicks
    setTimeout(() => setMonthClickCount(0), 2000)
  }

  // Add these functions to handle editing
  const handleEdit = (report: AllocationReport) => {
    setEditingReport(report.truckNumber);
    setEditFormData({
      ...report,
      entries: [...(report.entries || [])]  // Make sure to clone the entries array
    });
  };

  const handleSaveEdit = async (reportId: string) => {
    try {
      const db = getDatabase();
      const reportsRef = ref(db, 'allocation_reports');
      const snapshot = await get(reportsRef);
      
      if (snapshot.exists()) {
        let reportKey: string | null = null;
        Object.entries(snapshot.val()).forEach(([key, value]: [string, any]) => {
          if (value.truckNumber === reportId) {
            reportKey = key;
          }
        });

        if (reportKey) {
          // Calculate new total volume
          const totalVolume = editFormData.entries?.reduce(
            (sum, entry) => sum + parseFloat(entry.volume || '0'),
            0
          ).toString();

          // Include total volume in update
          await update(ref(db, `allocation_reports/${reportKey}`), {
            ...editFormData,
            totalVolume
          });

          toast({
            title: "Success",
            description: "Report updated successfully"
          });
          setEditingReport(null);
          setEditFormData({});
        }
      }
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update report"
      });
    }
  };

  // Add this new function to handle data migration
  const migrateExistingData = async () => {
    if (!showEditControls) return;
    
    if (!confirm('Update all records without depot? This will set depot based on destination.')) {
      return;
    }

    setIsMigrating(true);
    const db = getDatabase();
    
    try {
      const snapshot = await get(ref(db, 'allocation_reports'));
      if (!snapshot.exists()) return;

      const updates: { [key: string]: any } = {};
      
      snapshot.forEach((child) => {
        const report = child.val();
        if (!report.depot) {
          // Use the same logic as handleSubmit
          const destination = report.entryDestination.toLowerCase();
          let depot = '';

          if (destination.includes('local')) {
            depot = 'Local';
          } else if (destination === 'ssd') {
            depot = 'SSD';
          } else if (destination.includes('north')) {
            depot = 'Northern';
          } else if (destination.includes('west')) {
            depot = 'Western';
          } else if (destination.includes('east')) {
            depot = 'Eastern';
          } else if (destination.includes('nakuru')) {
            depot = 'Nakuru';
          } else if (destination.includes('eldoret')) {
            depot = 'Eldoret';
          } else if (destination.includes('kisumu')) {
            depot = 'Kisumu';
          } else {
            depot = 'Unknown';
          }

          updates[`allocation_reports/${child.key}/depot`] = depot;
        }
      });

      if (Object.keys(updates).length > 0) {
        await update(ref(db), updates);
        toast({
          title: "Migration Complete",
          description: `Updated ${Object.keys(updates).length} records with depot information`
        });
      } else {
        toast({
          title: "No Updates Needed",
          description: "All records already have depot information"
        });
      }
    } catch (error) {
      toast({
        title: "Migration Failed",
        description: "Failed to update records with depot information",
        variant: "destructive"
      });
    } finally {
      setIsMigrating(false);
    }
  };

  // Add these helper functions after your existing state declarations
const handleEditEntryChange = (reportId: string, entryIndex: number, field: 'volume' | 'entryUsed', value: string) => {
  setEditFormData(prev => {
    const newEntries = [...(prev.entries || [])];
    newEntries[entryIndex] = { ...newEntries[entryIndex], [field]: value };
    return { ...prev, entries: newEntries };
  });
};

const handleAddEditEntry = (reportId: string) => {
  setEditFormData(prev => ({
    ...prev,
    entries: [...(prev.entries || []), { volume: '', entryUsed: '' }]
  }));
};

const handleRemoveEditEntry = (reportId: string, entryIndex: number) => {
  setEditFormData(prev => ({
    ...prev,
    entries: (prev.entries || []).filter((_, i) => i !== entryIndex)
  }));
};

  // Add this function with your other handlers
  const exitEditMode = () => {
    setShowEditControls(false)
    setEditingReport(null)
    setEditFormData({})
    setShowDuplicates(false)
    setMonthClickCount(0)
    toast({
      title: "Edit Mode Deactivated",
      description: "You've exited edit mode"
    })
  }

  // Update handleBulkUpdate to handle depot updates
  const handleBulkUpdate = async () => {
    if (!bulkDepot || selectedReports.length === 0) return;

    try {
      const db = getDatabase();
      const updates: { [key: string]: any } = {};

      // Get all reports to find the matching IDs
      const snapshot = await get(ref(db, 'allocation_reports'));
      if (snapshot.exists()) {
        Object.entries(snapshot.val()).forEach(([key, value]: [string, any]) => {
          if (selectedReports.includes(value.truckNumber)) {
            updates[`allocation_reports/${key}/depot`] = bulkDepot;
          }
        });
      }

      await update(ref(db), updates);
      
      toast({
        title: "Bulk Update Complete",
        description: `Updated ${selectedReports.length} reports`
      });
      
      setShowBulkUpdate(false);
      setSelectedReports([]);
      setBulkDepot("");
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to update reports",
        variant: "destructive"
      });
    }
  };

  if (!mounted) return null

  return (
    <div className="min-h-screen">
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-gradient-to-r from-emerald-900/10 via-blue-900/10 to-blue-900/10 backdrop-blur-xl">
        <div className="w-full">
          <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
            {/* Left side with back arrow */}
            <div className="flex items-center gap-4">
              <Button
                variant="ghost"
                size="icon"
                onClick={() => router.push('/dashboard/work')}
                className="text-emerald-700 hover:text-emerald-800 hover:bg-emerald-100"
              >
                <ArrowLeft className="h-5 w-5" />
              </Button>
              <h1 className="text-xl font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
                Allocation Reports
              </h1>
            </div>
            {/* Right side */}
            <div className="flex items-center gap-4">
              <Button
                variant="outline"
                onClick={() => setIsAddModalOpen(true)}
                className="whitespace-nowrap hover:bg-emerald-100 hover:text-emerald-700"
              >
                <Plus className="h-4 w-4 sm:mr-2" />
                <span className="hidden sm:inline">Add Report</span>
              </Button>
              {showEditControls && (
                <Button
                  variant="outline"
                  onClick={migrateExistingData}
                  disabled={isMigrating}
                  className="whitespace-nowrap"
                >
                  {isMigrating ? (
                    <>
                      <Loader2 className="h-4 w-4 sm:mr-2 animate-spin" />
                      <span className="hidden sm:inline">Migrating...</span>
                    </>
                  ) : (
                    <>
                      <Plus className="h-4 w-4 sm:mr-2" />
                      <span className="hidden sm:inline">Update Missing Depots</span>
                    </>
                  )}
                </Button>
              )}
              {showEditControls && (
                <Button
                  variant="outline"
                  onClick={exitEditMode}
                  className="gap-2 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  <AlertCircle className="h-4 w-4" />
                  <span className="hidden sm:inline">Exit Edit Mode</span>
                </Button>
              )}
              <ThemeToggle />
              <Avatar 
                className="h-8 w-8 ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-background transition-shadow hover:ring-emerald-500/75 cursor-pointer"
                onClick={() => router.push('/dashboard')}
              >
                <AvatarImage 
                  src={profilePicUrl || ''} 
                  alt={session?.user?.name || 'User Profile'}
                />
                <AvatarFallback className="bg-emerald-100 text-emerald-700">
                  {session?.user?.email?.[0]?.toUpperCase() || 'U'}
                </AvatarFallback>
              </Avatar>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 pt-24 pb-8">
        <div className="flex flex-col items-center gap-6 mb-6">
          <div className="flex items-center gap-4 w-full max-w-xl relative group">
            <Search className={`h-4 w-4 absolute left-3 transition-all duration-300 ${
              searchTerm 
                ? 'from-emerald-600 via-teal-500 to-blue-500 animate-gradient-x' 
                : 'text-muted-foreground group-hover:bg-gradient-to-r group-hover:from-emerald-600 group-hover:via-teal-500 group-hover:to-blue-500 group-hover:bg-clip-text group-hover:text-transparent'
            }`} />
            <Input
              placeholder="Search by truck number, owner, product, or entry..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-10 transition-all duration-200 focus-visible:ring-emerald-500/50 focus-visible:ring-offset-2"
            />
            <Button onClick={exportToExcel}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            {/* Add this month navigator above the table */}
            <div className="flex items-center justify-center gap-4 mb-6">
              <Button
                variant="ghost"
                size="icon"
                onClick={previousMonth}
                className="hover:bg-emerald-100 hover:text-emerald-700"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <h2 
                className="text-lg font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent cursor-pointer"
                onClick={handleMonthClick}
              >
                {format(currentDate, 'MMMM yyyy')}
              </h2>
              <Button
                variant="ghost"
                size="icon"
                onClick={nextMonth}
                className="hover:bg-emerald-100 hover:text-emerald-700"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            {/* Replace the duplicate controls section with this */}
            {showEditControls && (
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <Label htmlFor="showDuplicates">Show Duplicates</Label>
                  <Switch
                    id="showDuplicates"
                    checked={showDuplicates}
                    onCheckedChange={setShowDuplicates}
                  />
                </div>
                {!showDuplicates && (
                  <p className="text-sm text-muted-foreground">
                    {removeDuplicates(reports).duplicateCount > 0 
                      ? `${removeDuplicates(reports).duplicateCount} duplicate entries hidden` 
                      : 'No duplicates found'}
                  </p>
                )}
              </div>
            )}

            <Table>
              <TableHeader>
                <TableRow>
                  {showEditControls && (
                    <TableHead className="w-[50px]">
                      <input
                        type="checkbox"
                        onChange={(e) => {
                          if (e.target.checked) {
                            setSelectedReports(filteredReports.map(r => r.truckNumber));
                          } else {
                            setSelectedReports([]);
                          }
                        }}
                        checked={selectedReports.length === filteredReports.length}
                      />
                    </TableHead>
                  )}
                  <TableHead>Loaded Date</TableHead>
                  <TableHead>Truck Number</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Entries</TableHead>
                  <TableHead>Total Volume</TableHead>
                  <TableHead>AT20</TableHead>
                  <TableHead>Destination</TableHead>
                  <TableHead>Depot</TableHead>
                  {showEditControls && <TableHead className="w-[50px]">Edit</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report, index) => (
                  <TableRow key={index} className={`${report.id === newReportId ? 'animate-highlight bg-emerald-100' : ''} transition-colors duration-500`}>
                    {showEditControls && (
                      <TableCell>
                        <input
                          type="checkbox"
                          checked={selectedReports.includes(report.truckNumber)}
                          onChange={(e) => {
                            if (e.target.checked) {
                              setSelectedReports([...selectedReports, report.truckNumber]);
                            } else {
                              setSelectedReports(selectedReports.filter(id => id !== report.truckNumber));
                            }
                          }}
                        />
                      </TableCell>
                    )}
                    <TableCell>{editingReport === report.truckNumber ? (
                      <Input
                        type="date"
                        value={editFormData.loadedDate || report.loadedDate}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, loadedDate: e.target.value }))}
                      />
                    ) : (
                      formatSimpleDate(report?.loadedDate)
                    )}</TableCell>
                    <TableCell>{editingReport === report.truckNumber ? (
                      <Input
                        value={editFormData.truckNumber || report.truckNumber}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, truckNumber: e.target.value }))}
                      />
                    ) : (
                      report?.truckNumber || '-'
                    )}</TableCell>
                    <TableCell>{editingReport === report.truckNumber ? (
                      <Input
                        value={editFormData.owner || report.owner}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, owner: e.target.value }))}
                      />
                    ) : (
                      report?.owner || '-'
                    )}</TableCell>
                    <TableCell>{report?.product?.toUpperCase() || '-'}</TableCell>
                    <TableCell>
                      {editingReport === report.truckNumber ? (
                        <div className="space-y-2">
                          {(editFormData.entries || report.entries)?.map((entry, i) => (
                            <div key={i} className="flex items-center gap-2">
                              <Input
                                className="w-24"
                                value={entry.entryUsed}
                                onChange={(e) => handleEditEntryChange(report.truckNumber, i, 'entryUsed', e.target.value)}
                                placeholder="Entry"
                              />
                              <Input
                                className="w-24"
                                type="number"
                                value={entry.volume}
                                onChange={(e) => handleEditEntryChange(report.truckNumber, i, 'volume', e.target.value)}
                                placeholder="Volume"
                              />
                              {(editFormData.entries || report.entries).length > 1 && (
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  onClick={() => handleRemoveEditEntry(report.truckNumber, i)}
                                  className="h-8 w-8 p-0"
                                >
                                  <X className="h-4 w-4" />
                                </Button>
                              )}
                            </div>
                          ))}
                          {(editFormData.entries || report.entries).length < 3 && (
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => handleAddEditEntry(report.truckNumber)}
                              className="w-full mt-2"
                            >
                              <Plus className="h-4 w-4 mr-2" /> Add Entry
                            </Button>
                          )}
                        </div>
                      ) : (
                        <div className="space-y-1">
                          {report?.entries?.map((entry, i) => (
                            <div key={i} className="text-sm">
                              {entry?.entryUsed || '-'}: {entry?.volume || '0'}L
                            </div>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>{report?.totalVolume ? `${report.totalVolume}L` : '-'}</TableCell>
                    <TableCell>{editingReport === report.truckNumber ? (
                      <Input
                        type="text"
                        value={editFormData.at20 || report.at20}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, at20: e.target.value }))}
                      />
                    ) : (
                      report?.at20 || '-'
                    )}</TableCell>
                    <TableCell>{editingReport === report.truckNumber ? (
                      <Select
                        value={editFormData.entryDestination || report.entryDestination}
                        onValueChange={(value) => setEditFormData(prev => ({ ...prev, entryDestination: value }))}
                      >
                        <SelectTrigger>
                          <SelectValue placeholder="Select destination" />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="local">Local</SelectItem>
                          <SelectItem value="ssd">SSD</SelectItem>
                          <SelectItem value="northern">Northern</SelectItem>
                          <SelectItem value="western">Western</SelectItem>
                          <SelectItem value="eastern">Eastern</SelectItem>
                          <SelectItem value="nakuru">Nakuru</SelectItem>
                          <SelectItem value="eldoret">Eldoret</SelectItem>
                          <SelectItem value="kisumu">Kisumu</SelectItem>
                        </SelectContent>
                      </Select>
                    ) : (
                      report?.entryDestination?.toUpperCase() || '-'
                    )}</TableCell>
                    <TableCell>{editingReport === report.truckNumber ? (
                      <Input
                        value={editFormData.depot || report.depot}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, depot: e.target.value }))}
                      />
                    ) : (
                      report?.depot || '-'
                    )}</TableCell>
                    {showEditControls && (
                      <TableCell>
                        {editingReport === report.truckNumber ? (
                          <div className="flex gap-2">
                            <Button variant="ghost" size="sm" onClick={() => handleSaveEdit(report.truckNumber)} className="h-8 w-8 p-0"><Check className="h-4 w-4" /></Button>
                            <Button variant="ghost" size="sm" onClick={() => {
                              setEditingReport(null)
                              setEditFormData({})
                            }} className="h-8 w-8 p-0"><X className="h-4 w-4" /></Button>
                          </div>
                        ) : (
                          <Button variant="ghost" size="sm" onClick={() => handleEdit(report)} className="h-8 w-8 p-0"><Edit className="h-4 w-4" /></Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {/* Add Bulk Update button after the table */}
            {showEditControls && selectedReports.length > 0 && (
              <div className="mt-4">
                <Button
                  onClick={() => setShowBulkUpdate(true)}
                  variant="outline"
                  className="gap-2"
                >
                  <Edit className="h-4 w-4" />
                  Bulk Update Selected ({selectedReports.length})
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </main>

      {/* Add Report Dialog */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="sm:max-w-[600px]">
          <DialogHeader>
            <DialogTitle className="text-xl font-semibold">Add New Report</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label htmlFor="truckNumber">Truck Number</Label>
                <Input
                  id="truckNumber"
                  value={formData.truckNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, truckNumber: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="owner">Owner</Label>
                <Input
                  id="owner"
                  value={formData.owner}
                  onChange={(e) => setFormData(prev => ({ ...prev, owner: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="product">Product</Label>
                <Select
                  value={formData.product || ''} // Add default empty string
                  onValueChange={(value) => setFormData(prev => ({ ...prev, product: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ago">AGO</SelectItem>
                    <SelectItem value="pms">PMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="entryDestination">Destination</Label>
                <Select
                  value={formData.entryDestination}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, entryDestination: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="ssd">SSD</SelectItem>
                    <SelectItem value="northern">Northern</SelectItem>
                    <SelectItem value="western">Western</SelectItem>
                    <SelectItem value="eastern">Eastern</SelectItem>
                    <SelectItem value="nakuru">Nakuru</SelectItem>
                    <SelectItem value="eldoret">Eldoret</SelectItem>
                    <SelectItem value="kisumu">Kisumu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label htmlFor="at20">AT20</Label>
                <Input
                  id="at20"
                  type="number"
                  value={formData.at20}
                  onChange={(e) => setFormData(prev => ({ ...prev, at20: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="loadedDate">Loaded Date</Label>
                <Input
                  id="loadedDate"
                  type="date"
                  value={formData.loadedDate || new Date().toISOString().split('T')[0]}
                  onChange={(e) => setFormData(prev => ({ ...prev, loadedDate: e.target.value }))}
                  required
                />
              </div>
              <div>
                <Label htmlFor="depot">Depot</Label>
                <Select
                  value={formData.depot}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, depot: value }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select depot" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Eldoret">Eldoret</SelectItem>
                    <SelectItem value="Nakuru">Nakuru</SelectItem>
                    <SelectItem value="Kisumu">Kisumu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Entries Section */}
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <Label>Entries Used</Label>
                <Button
                  type="button"
                  variant="outline"
                  onClick={addEntry}
                  disabled={formData.entries.length >= 3}
                >
                  Add Entry
                </Button>
              </div>
              {formData.entries.map((entry, index) => (
                <div key={index} className="grid grid-cols-2 gap-4 p-4 border rounded-md">
                  <div>
                    <Label>Entry Number</Label>
                    <Input
                      value={entry.entryUsed || ''} // Add default empty string
                      onChange={(e) => handleEntryChange(index, 'entryUsed', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>Volume</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={entry.volume || ''} // Add default empty string
                        onChange={(e) => handleEntryChange(index, 'volume', e.target.value)}
                        required
                      />
                      {formData.entries.length > 1 && (
                        <Button
                          type="button"
                          variant="destructive"
                          onClick={() => removeEntry(index)}
                          className="px-3"
                        >
                          ×
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex justify-end gap-4 mt-6">
              <Button type="button" variant="outline" onClick={() => setIsAddModalOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Saving...
                  </>
                ) : (
                  'Save Report'
                )}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Update Dialog */}
      <Dialog open={showBulkUpdate} onOpenChange={setShowBulkUpdate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Bulk Update Depots</DialogTitle>
            <DialogDescription>
              Update depot for {selectedReports.length} selected reports. 
              {selectedReports.length === filteredReports.length && (
                <span className="font-medium text-emerald-600"> All reports in current view are selected.</span>
              )}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>New Depot</Label>
              <Select
                value={bulkDepot}
                onValueChange={setBulkDepot}
              >
                <SelectTrigger className="w-full">
                  <SelectValue placeholder="Select new depot value" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="Eldoret">Eldoret</SelectItem>
                  <SelectItem value="Nakuru">Nakuru</SelectItem>
                  <SelectItem value="Kisumu">Kisumu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => {
                setShowBulkUpdate(false);
                setBulkDepot("");
              }}>
                Cancel
              </Button>
              <Button 
                onClick={handleBulkUpdate} 
                disabled={!bulkDepot}
                className="bg-emerald-600 hover:bg-emerald-700"
              >
                Update {selectedReports.length} {selectedReports.length === 1 ? 'Report' : 'Reports'}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
