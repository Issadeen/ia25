'use client'

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Download, Search, Plus, Loader2 } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { getDatabase, ref, onValue, push } from "firebase/database"
import { format } from "date-fns"
import * as XLSX from 'xlsx'
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { storage } from "@/lib/firebase"
import { getDownloadURL, ref as storageRef } from "firebase/storage"
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { ThemeToggle } from "@/components/ui/molecules/theme-toggle"

// Update the interface to handle multiple entries
interface AllocationReport {
  truckNumber: string;
  entries: {
    volume: string;
    entryUsed: string;
  }[];
  allocationDate: string;
  at20: string;
  owner: string;
  product: string;
  entryDestination: string;
  totalVolume?: string; // Added to store combined volume
}

// Update the form data interface
interface ReportFormData {
  truckNumber: string;
  owner: string;
  product: string;
  entryDestination: string;
  at20: string;
  entries: {
    volume: string;
    entryUsed: string;
  }[];
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
  const [formData, setFormData] = useState<ReportFormData>({
    truckNumber: '',
    owner: '',
    product: '',
    entryDestination: '',
    at20: '',
    entries: [{ volume: '', entryUsed: '' }]
  })

  const { toast } = useToast()

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
        const reportsData: AllocationReport[] = Object.values(snapshot.val())
        setReports(reportsData.sort((a, b) => 
          new Date(b.allocationDate).getTime() - new Date(a.allocationDate).getTime()
        ))
      }
    })

    return () => unsubscribe()
  }, [])

  useEffect(() => {
    const fetchImageUrl = async () => {
      if (!session?.user?.email || session?.user?.image) return
  
      try {
        const filename = `${session.user.email}.jpg`
        const imageRef = storageRef(storage, `profile-pics/${filename}`)
        const url = await getDownloadURL(imageRef)
        setLastUploadedImage(url)
      } catch (error) {
        // Silently handle missing profile image
      }
    }
  
    fetchImageUrl()
  }, [session?.user?.email, session?.user?.image])

  const filteredReports = reports.filter(report => 
    report.truckNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    report.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
    report.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
    report.entries.some(entry => entry.entryUsed.toLowerCase().includes(searchTerm.toLowerCase()))
  )

  const exportToExcel = () => {
    const data = filteredReports.map(report => ({
      'Date': format(new Date(report.allocationDate), 'dd/MM/yyyy HH:mm'),
      'Truck Number': report.truckNumber,
      'Owner': report.owner,
      'Product': report.product.toUpperCase(),
      'Volume': report.totalVolume,
      'AT20': report.at20,
      'Entries': report.entries.map(entry => `${entry.entryUsed}: ${entry.volume}L`).join(', '),
      'Destination': report.entryDestination.toUpperCase()
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Allocation Reports')
    XLSX.writeFile(wb, `Allocation_Reports_${format(new Date(), 'dd-MM-yyyy')}.xlsx`)
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
        at20: formData.at20,
        entries: formData.entries,
        totalVolume,
        allocationDate: new Date().toISOString()
      }

      await push(reportRef, reportData)

      toast({
        title: "Success",
        description: "Report added successfully"
      })

      setIsAddModalOpen(false)
      setFormData({
        truckNumber: '',
        owner: '',
        product: '',
        entryDestination: '',
        at20: '',
        entries: [{ volume: '', entryUsed: '' }]
      })
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to add report"
      })
    } finally {
      setIsSubmitting(false)
    }
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
                <Plus className="h-4 w-4 mr-2" />
                Add Report
              </Button>
              <ThemeToggle />
              <Avatar className="h-8 w-8 border-2 border-emerald-200">
                <AvatarImage 
                  src={session?.user?.image || lastUploadedImage || ''} 
                  alt="Profile"
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
          <div className="flex items-center gap-4 w-full max-w-xl">
            <Search className="h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search by truck number, owner, product, or entry..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full"
            />
            <Button onClick={exportToExcel}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>

        <Card>
          <CardContent className="p-6">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Truck Number</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Entries</TableHead>
                  <TableHead>Total Volume</TableHead>
                  <TableHead>AT20</TableHead>
                  <TableHead>Destination</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredReports.map((report, index) => (
                  <TableRow key={index}>
                    <TableCell>
                      {format(new Date(report.allocationDate), 'dd/MM/yyyy HH:mm')}
                    </TableCell>
                    <TableCell>{report.truckNumber}</TableCell>
                    <TableCell>{report.owner}</TableCell>
                    <TableCell>{report.product.toUpperCase()}</TableCell>
                    <TableCell>
                      <div className="space-y-1">
                        {report.entries.map((entry, i) => (
                          <div key={i} className="text-sm">
                            {entry.entryUsed}: {entry.volume}L
                          </div>
                        ))}
                      </div>
                    </TableCell>
                    <TableCell>{report.totalVolume}L</TableCell>
                    <TableCell>{report.at20}</TableCell>
                    <TableCell>{report.entryDestination.toUpperCase()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
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
                  value={formData.product}
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
                <Input
                  id="entryDestination"
                  value={formData.entryDestination}
                  onChange={(e) => setFormData(prev => ({ ...prev, entryDestination: e.target.value }))}
                  required
                />
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
                      value={entry.entryUsed}
                      onChange={(e) => handleEntryChange(index, 'entryUsed', e.target.value)}
                      required
                    />
                  </div>
                  <div>
                    <Label>Volume</Label>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        value={entry.volume}
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
    </div>
  )
}
