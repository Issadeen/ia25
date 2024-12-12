'use client'

import { useState, useEffect } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { ArrowLeft, Download, Search } from "lucide-react"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { getDatabase, ref, onValue } from "firebase/database"
import { format } from "date-fns"
import * as XLSX from 'xlsx'

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

export default function ReportsPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const [reports, setReports] = useState<AllocationReport[]>([])
  const [searchTerm, setSearchTerm] = useState("")
  const [mounted, setMounted] = useState(false)

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

  const filteredReports = reports.filter(report => 
    report.truckNumber.toLowerCase().includes(searchTerm.toLowerCase()) ||
    report.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
    report.product.toLowerCase().includes(searchTerm.toLowerCase()) ||
    report.entryUsed.toLowerCase().includes(searchTerm.toLowerCase())
  )

  const exportToExcel = () => {
    const data = filteredReports.map(report => ({
      'Date': format(new Date(report.allocationDate), 'dd/MM/yyyy HH:mm'),
      'Truck Number': report.truckNumber,
      'Owner': report.owner,
      'Product': report.product.toUpperCase(),
      'Volume': report.volume,
      'AT20': report.at20,
      'Entry Used': report.entryUsed,
      'Destination': report.entryDestination.toUpperCase()
    }))

    const ws = XLSX.utils.json_to_sheet(data)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Allocation Reports')
    XLSX.writeFile(wb, `Allocation_Reports_${format(new Date(), 'dd-MM-yyyy')}.xlsx`)
  }

  if (!mounted) return null

  return (
    <div className="min-h-screen p-8">
      <div className="max-w-7xl mx-auto">
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/dashboard/work')}
            >
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="text-2xl font-semibold">Allocation Reports</h1>
          </div>
          <Button onClick={exportToExcel}>
            <Download className="h-4 w-4 mr-2" />
            Export to Excel
          </Button>
        </div>

        <Card>
          <CardHeader>
            <div className="flex items-center gap-4">
              <Search className="h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by truck number, owner, product, or entry..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="max-w-sm"
              />
            </div>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Date</TableHead>
                  <TableHead>Truck Number</TableHead>
                  <TableHead>Owner</TableHead>
                  <TableHead>Product</TableHead>
                  <TableHead>Volume</TableHead>
                  <TableHead>AT20</TableHead>
                  <TableHead>Entry Used</TableHead>
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
                    <TableCell>{report.volume}</TableCell>
                    <TableCell>{report.at20}</TableCell>
                    <TableCell>{report.entryUsed}</TableCell>
                    <TableCell>{report.entryDestination.toUpperCase()}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
