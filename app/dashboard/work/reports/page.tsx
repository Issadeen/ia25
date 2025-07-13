'use client'

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Download, Search, Plus, Loader2, ChevronLeft, ChevronRight, Edit, Check, X, AlertCircle, ChevronDown, ChevronUp } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getDatabase, ref, onValue, push, update, get, set } from "firebase/database"
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
import { AlertDialog, AlertDialogContent, AlertDialogHeader, AlertDialogTitle, AlertDialogDescription, AlertDialogFooter, AlertDialogCancel, AlertDialogAction } from "@/components/ui/alert-dialog"

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

const WorkReportsPage: React.FC = () => {
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
  const [showStats, setShowStats] = useState(false);
  const [showCorrectionDialog, setShowCorrectionDialog] = useState(false)
  const [selectedReport, setSelectedReport] = useState<AllocationReport | null>(null)
  const [correctionReason, setCorrectionReason] = useState('')
  const [newAt20Value, setNewAt20Value] = useState('')
  const [isPendingApproval, setIsPendingApproval] = useState(false)
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

  const generateReport = async () => {
    const db = getDatabase();
    const reportsRef = ref(db, 'allocation_reports');

    // Fetch data from Firebase
    get(reportsRef).then((snapshot) => {
      if (snapshot.exists()) {
        const reportsData = Object.entries(snapshot.val()).map(([key, value]) => ({
          id: key,
          ...(value as any)
        }));

        // Filter and map data for the report
        const reportData = reportsData
          .filter(report => report.loadedDate) // Ensure loadedDate exists
          .map(report => ({
            number: report.truckNumber,
            timestamp: report.loadedDate,
            product: report.product,
            destination: report.entryDestination,
            initialQuantity: report.entries?.[0]?.volume || 0,
            remainingQuantity: report.totalVolume,
            truck: report.truckNumber,
            depot: report.depot,
            createdBy: report.owner,
          }));

        // Define columns for the report
        const columns = [
          { header: 'TR830 Number', key: 'number' },
          { header: 'Date', key: 'timestamp' },
          { header: 'Product', key: 'product' },
          { header: 'Destination', key: 'destination' },
          { header: 'Initial Qty', key: 'initialQuantity' },
          { header: 'Remaining Qty', key: 'remainingQuantity' },
          { header: 'Truck', key: 'truck' },
          { header: 'Depot', key: 'depot' },
          { header: 'Created By', key: 'createdBy' },
        ];
        
        // Generate and download the report
        const ws = XLSX.utils.json_to_sheet(reportData, { header: columns.map(col => col.key) });
        const wb = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(wb, ws, "Reports");

        // Save to file
        XLSX.writeFile(wb, `Work_Reports_${format(new Date(), 'yyyyMMdd_HHmmss')}.xlsx`);

        toast({
          title: "Report Generated",
          description: "Your report has been generated and downloaded.",
          duration: 5000,
        });
      } else {
        toast({
          title: "No Data",
          description: "No reports found for the selected criteria.",
          variant: "destructive",
        });
      }
    }).catch((error) => {
      console.error("Error fetching reports:", error);
      toast({
        title: "Error",
        description: "There was an error generating the report.",
        variant: "destructive",
      });
    });
  };

  // Add new function to handle AT20 correction
  const handleAt20Correction = async (report: AllocationReport) => {
    setSelectedReport(report)
    setNewAt20Value(report.at20 || '')
    setShowCorrectionDialog(true)
  }

  // Add function to submit correction
  const submitCorrection = async () => {
    if (!selectedReport || !correctionReason || !newAt20Value) return

    try {
      const db = getDatabase()
      const correctionRef = push(ref(db, 'at20_corrections'))
      
      const correction: AT20Correction = {
        id: correctionRef.key!,
        reportId: selectedReport.id!,
        truckNumber: selectedReport.truckNumber,
        oldValue: selectedReport.at20!,
        newValue: newAt20Value,
        correctedBy: session?.user?.email || 'unknown',
        correctedAt: new Date().toISOString(),
        reason: correctionReason,
        affectedEntries: selectedReport.entries.map(e => e.entryUsed),
        status: 'pending'
      }

      await set(correctionRef, correction)

      toast({
        title: "Correction Submitted",
        description: "AT20 correction is pending approval",
      })

      setShowCorrectionDialog(false)
      setCorrectionReason('')
      setNewAt20Value('')
      setSelectedReport(null)
      setIsPendingApproval(true)

    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to submit correction",
        variant: "destructive"
      })
    }
  }

  // Update the existing edit cell rendering
  const renderAt20Cell = (report: AllocationReport) => {
    if (editingReport === report.truckNumber) {
      return (
        <div className="flex gap-2 items-center">
          <Input
            type="text"
            value={editFormData.at20 || report.at20}
            onChange={(e) => setEditFormData(prev => ({ ...prev, at20: e.target.value }))}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleAt20Correction(report)}
            className="px-2"
          >
            <AlertCircle className="h-4 w-4" />
          </Button>
        </div>
      )
    }
    
    return (
      <div className="flex items-center gap-2">
        <span>{report?.at20 || '-'}</span>
        {showEditControls && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => handleAt20Correction(report)}
            className="px-2"
          >
            <AlertCircle className="h-4 w-4" />
          </Button>
        )}
      </div>
    )
  }

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
            {/* Update summary stats section */}
            <div className="flex justify-between items-center mb-4">
              <h3 className="text-lg font-semibold">Statistics Overview</h3>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowStats(!showStats)}
                className="text-muted-foreground hover:text-foreground gap-2"
              >
                {showStats ? (
                  <>
                    Hide Stats
                    <ChevronUp className="h-4 w-4" />
                  </>
                ) : (
                  <>
                    Show Stats
                    <ChevronDown className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>

            {showStats && (
              <div className="grid grid-cols-3 gap-4 mb-6 animate-in slide-in-from-top duration-200">
                <div className="p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                  <p className="text-sm text-muted-foreground">Total Reports</p>
                  <h3 className="text-2xl font-bold">{filteredReports.length}</h3>
                </div>
                <div className="p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                  <p className="text-sm text-muted-foreground">Total Volume</p>
                  <h3 className="text-2xl font-bold">
                    {filteredReports.reduce((sum, report) => 
                      sum + parseFloat(report.totalVolume || '0'), 0
                    ).toLocaleString()}L
                  </h3>
                </div>
                <div className="p-4 border rounded-lg bg-card hover:bg-accent/50 transition-colors">
                  <p className="text-sm text-muted-foreground">Average Volume</p>
                  <h3 className="text-2xl font-bold">
                    {(filteredReports.reduce((sum, report) => 
                      sum + parseFloat(report.totalVolume || '0'), 0
                    ) / (filteredReports.length || 1)).toLocaleString()}L
                  </h3>
                </div>
              </div>
            )}

            {/* Existing month navigator */}
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
                  <TableHead className="w-[50px]">No.</TableHead>
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
                    <TableCell className="font-medium">{index + 1}</TableCell>
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
                      <Input
                        value={editFormData.entryDestination || report.entryDestination}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, entryDestination: e.target.value }))}
                      />
                    ) : (
                      report?.entryDestination?.toUpperCase() || '-'
                    )}</TableCell>
                    <TableCell>{editingReport === report.truckNumber ? (
                      <Input
                        value={editFormData.depot || report.depot}
                        onChange={(e) => setEditFormData(prev => ({ ...prev, depot: e.target.value }))}
                      />
                    ) : (
                      report?.depot?.toUpperCase() || '-'
                    )}</TableCell>
                    {showEditControls && (
                      <TableCell>
                        {editingReport === report.truckNumber ? (
                          <div className="flex items-center gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => setEditingReport(null)}
                              className="h-8 w-8 p-0"
                            >
                              <X className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleSaveEdit(report.truckNumber)}
                              className="h-8 w-8 p-0 text-emerald-500 hover:text-emerald-600 hover:bg-emerald-50"
                            >
                              <Check className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(report)}
                            className="h-8 w-8 p-0"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>

            {filteredReports.length === 0 && (
              <div className="py-24 text-center">
                <p className="text-muted-foreground">No reports found for this month.</p>
                <Button
                  variant="outline"
                  onClick={() => setIsAddModalOpen(true)}
                  className="mt-4"
                >
                  <Plus className="h-4 w-4 mr-2" /> Add Report
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Add bulk update dialog */}
        {showEditControls && selectedReports.length > 0 && (
          <div className="fixed bottom-4 right-4 p-4 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-emerald-200 dark:border-emerald-900 flex items-center gap-4">
            <p className="text-sm font-medium">{selectedReports.length} reports selected</p>
            <Button 
              variant="outline"
              onClick={() => setShowBulkUpdate(true)}
              className="text-emerald-600"
            >
              Bulk Update
            </Button>
          </div>
        )}
      </main>

      {/* Add Report Modal */}
      <Dialog open={isAddModalOpen} onOpenChange={setIsAddModalOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>Add Allocation Report</DialogTitle>
            <DialogDescription>
              Enter the details of the truck and allocation.
            </DialogDescription>
          </DialogHeader>
          
          <form onSubmit={handleSubmit} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <Label htmlFor="loadedDate">Loaded Date</Label>
                <Input
                  id="loadedDate"
                  type="date"
                  value={formData.loadedDate}
                  onChange={(e) => setFormData(prev => ({ ...prev, loadedDate: e.target.value }))}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="truckNumber">Truck Number</Label>
                <Input
                  id="truckNumber"
                  value={formData.truckNumber}
                  onChange={(e) => setFormData(prev => ({ ...prev, truckNumber: e.target.value }))}
                  placeholder="KAA 000A"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="owner">Owner</Label>
                <Input
                  id="owner"
                  value={formData.owner}
                  onChange={(e) => setFormData(prev => ({ ...prev, owner: e.target.value }))}
                  placeholder="Enter owner"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="at20">AT20</Label>
                <Input
                  id="at20"
                  value={formData.at20}
                  onChange={(e) => setFormData(prev => ({ ...prev, at20: e.target.value }))}
                  placeholder="AT20 number"
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="product">Product</Label>
                <Select
                  value={formData.product}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, product: value }))}
                  required
                >
                  <SelectTrigger id="product">
                    <SelectValue placeholder="Select product" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="agol">AGO</SelectItem>
                    <SelectItem value="pms">PMS</SelectItem>
                    <SelectItem value="ik">IK</SelectItem>
                    <SelectItem value="v-power">V-Power</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="entryDestination">Destination</Label>
                <Select
                  value={formData.entryDestination}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, entryDestination: value }))}
                  required
                >
                  <SelectTrigger id="entryDestination">
                    <SelectValue placeholder="Select destination" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ssd">SSD</SelectItem>
                    <SelectItem value="local">Local</SelectItem>
                    <SelectItem value="northern">Northern</SelectItem>
                    <SelectItem value="western">Western</SelectItem>
                    <SelectItem value="eastern">Eastern</SelectItem>
                    <SelectItem value="nakuru">Nakuru</SelectItem>
                    <SelectItem value="eldoret">Eldoret</SelectItem>
                    <SelectItem value="kisumu">Kisumu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="depot">Depot</Label>
                <Select
                  value={formData.depot}
                  onValueChange={(value) => setFormData(prev => ({ ...prev, depot: value }))}
                >
                  <SelectTrigger id="depot">
                    <SelectValue placeholder="Select depot (optional)" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="SSD">SSD</SelectItem>
                    <SelectItem value="Local">Local</SelectItem>
                    <SelectItem value="Northern">Northern</SelectItem>
                    <SelectItem value="Western">Western</SelectItem>
                    <SelectItem value="Eastern">Eastern</SelectItem>
                    <SelectItem value="Nakuru">Nakuru</SelectItem>
                    <SelectItem value="Eldoret">Eldoret</SelectItem>
                    <SelectItem value="Kisumu">Kisumu</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-medium">Entries</h3>
                {formData.entries.length < 3 && (
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={addEntry}
                  >
                    <Plus className="h-4 w-4 mr-2" /> Add Entry
                  </Button>
                )}
              </div>
              
              {formData.entries.map((entry, index) => (
                <div key={index} className="flex items-end gap-4">
                  <div className="space-y-2 flex-1">
                    <Label htmlFor={`entry-${index}`}>Entry Number</Label>
                    <Input
                      id={`entry-${index}`}
                      value={entry.entryUsed}
                      onChange={(e) => handleEntryChange(index, 'entryUsed', e.target.value)}
                      placeholder="TR830 number"
                      required
                    />
                  </div>
                  <div className="space-y-2 flex-1">
                    <Label htmlFor={`volume-${index}`}>Volume (L)</Label>
                    <Input
                      id={`volume-${index}`}
                      type="number"
                      value={entry.volume}
                      onChange={(e) => handleEntryChange(index, 'volume', e.target.value)}
                      placeholder="Volume in liters"
                      required
                    />
                  </div>
                  {formData.entries.length > 1 && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => removeEntry(index)}
                      className="text-red-500 hover:text-red-600 hover:bg-red-50 mb-0.5"
                    >
                      <X className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              ))}
            </div>
            
            <div className="flex justify-end gap-3">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddModalOpen(false)}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 text-white"
                disabled={isSubmitting}
              >
                {isSubmitting ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null}
                Save Report
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      {/* Bulk Update Dialog */}
      <Dialog open={showBulkUpdate} onOpenChange={setShowBulkUpdate}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Bulk Update Depots</DialogTitle>
            <DialogDescription>
              Update depot for {selectedReports.length} selected reports
            </DialogDescription>
          </DialogHeader>
          
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="bulkDepot">Depot</Label>
              <Select
                value={bulkDepot}
                onValueChange={setBulkDepot}
                required
              >
                <SelectTrigger id="bulkDepot">
                  <SelectValue placeholder="Select depot" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="SSD">SSD</SelectItem>
                  <SelectItem value="Local">Local</SelectItem>
                  <SelectItem value="Northern">Northern</SelectItem>
                  <SelectItem value="Western">Western</SelectItem>
                  <SelectItem value="Eastern">Eastern</SelectItem>
                  <SelectItem value="Nakuru">Nakuru</SelectItem>
                  <SelectItem value="Eldoret">Eldoret</SelectItem>
                  <SelectItem value="Kisumu">Kisumu</SelectItem>
                </SelectContent>
              </Select>
            </div>
            
            <div className="flex justify-end gap-3">
              <Button
                variant="outline"
                onClick={() => setShowBulkUpdate(false)}
              >
                Cancel
              </Button>
              <Button
                onClick={handleBulkUpdate}
                disabled={!bulkDepot}
              >
                Update {selectedReports.length} Reports
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Add AT20 Correction Dialog */}
      <AlertDialog open={showCorrectionDialog} onOpenChange={setShowCorrectionDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>AT20 Correction</AlertDialogTitle>
            <AlertDialogDescription>
              Correcting AT20 for truck {selectedReport?.truckNumber}. This will need approval.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>Current AT20</Label>
              <Input
                disabled
                value={selectedReport?.at20 || ''}
              />
            </div>
            <div className="space-y-2">
              <Label>New AT20</Label>
              <Input
                value={newAt20Value}
                onChange={(e) => setNewAt20Value(e.target.value)}
                placeholder="Enter correct AT20 value"
              />
            </div>
            <div className="space-y-2">
              <Label>Reason for Correction</Label>
              <Input
                value={correctionReason}
                onChange={(e) => setCorrectionReason(e.target.value)}
                placeholder="Explain why this correction is needed"
              />
            </div>
          </div>

          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={submitCorrection}
              disabled={!newAt20Value || !correctionReason}
            >
              Submit for Approval
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

export default WorkReportsPage;
