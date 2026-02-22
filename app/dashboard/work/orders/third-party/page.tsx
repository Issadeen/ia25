'use client'

import { useEffect, useState, useMemo, useCallback } from "react"
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { motion, AnimatePresence } from "framer-motion"
import {
  ArrowLeft,
  Plus,
  Trash2,
  Edit,
  Check,
  X,
  Truck,
  Search,
  Filter,
  Download,
  Copy,
  RefreshCw,
  MoreHorizontal,
  Building2,
  Fuel,
  Loader2,
} from "lucide-react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { database } from "@/lib/firebase"
import { ref, onValue, push, update, remove, get } from "firebase/database"
import { toast } from "@/components/ui/use-toast"
import { useProfileImage } from "@/hooks/useProfileImage"
import { ThemeToggle } from "@/components/ui/molecules/theme-toggle"
import {
  ThirdPartyOrder,
  ThirdPartyFormData,
  THIRD_PARTY_STATUSES,
} from "@/types/third-party"
import jsPDF from "jspdf"
import autoTable from "jspdf-autotable"

// ------------------------------------------------------------------
// Summary stats
// ------------------------------------------------------------------
interface TPSummary {
  total: number
  notQueued: number
  queued: number
  loaded: number
  agoVolume: number
  pmsVolume: number
  byCompany: Record<string, { count: number; volume: number }>
}

const emptySummary: TPSummary = {
  total: 0,
  notQueued: 0,
  queued: 0,
  loaded: 0,
  agoVolume: 0,
  pmsVolume: 0,
  byCompany: {},
}

// ------------------------------------------------------------------
// Default form data
// ------------------------------------------------------------------
const defaultForm: ThirdPartyFormData = {
  truckNumber: "",
  product: "AGO",
  volume: 0,
  loadingCompany: "",
  destination: "",
  status: "not_queued",
  notes: "",
}

// ------------------------------------------------------------------
// Component
// ------------------------------------------------------------------
export default function ThirdPartyOrdersPage() {
  const { data: session, status: authStatus } = useSession()
  const router = useRouter()
  const profilePicUrl = useProfileImage()

  // State
  const [orders, setOrders] = useState<ThirdPartyOrder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState("")
  const [statusFilter, setStatusFilter] = useState<string>("ALL")
  const [productFilter, setProductFilter] = useState<string>("ALL")
  const [companyFilter, setCompanyFilter] = useState<string>("ALL")
  const [showFilters, setShowFilters] = useState(false)

  // Dialog state
  const [isAddOpen, setIsAddOpen] = useState(false)
  const [editingOrder, setEditingOrder] = useState<ThirdPartyOrder | null>(null)
  const [formData, setFormData] = useState<ThirdPartyFormData>(defaultForm)
  const [isSaving, setIsSaving] = useState(false)

  // ----------------------------------------------------------------
  // Auth guard
  // ----------------------------------------------------------------
  useEffect(() => {
    if (authStatus === "unauthenticated") {
      router.push("/login")
    }
  }, [authStatus, router])

  // ----------------------------------------------------------------
  // Firebase listener
  // ----------------------------------------------------------------
  useEffect(() => {
    const ordersRef = ref(database, "third_party_orders")
    const unsub = onValue(ordersRef, (snapshot) => {
      const data = snapshot.val()
      if (data) {
        const list: ThirdPartyOrder[] = Object.entries(data).map(
          ([id, val]: [string, any]) => ({ id, ...val })
        )
        // newest first
        list.sort(
          (a, b) =>
            new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        )
        setOrders(list)
      } else {
        setOrders([])
      }
      setIsLoading(false)
    })
    return () => unsub()
  }, [])

  // ----------------------------------------------------------------
  // Computed: summary
  // ----------------------------------------------------------------
  const summary = useMemo<TPSummary>(() => {
    return orders.reduce<TPSummary>((acc, o) => {
      acc.total++
      if (o.status === "not_queued") acc.notQueued++
      if (o.status === "queued") acc.queued++
      if (o.status === "loaded") acc.loaded++
      if (o.product === "AGO") acc.agoVolume += o.volume
      if (o.product === "PMS") acc.pmsVolume += o.volume

      if (!acc.byCompany[o.loadingCompany]) {
        acc.byCompany[o.loadingCompany] = { count: 0, volume: 0 }
      }
      acc.byCompany[o.loadingCompany].count++
      acc.byCompany[o.loadingCompany].volume += o.volume

      return acc
    }, { ...emptySummary, byCompany: {} })
  }, [orders])

  // ----------------------------------------------------------------
  // Computed: unique companies for filter
  // ----------------------------------------------------------------
  const companies = useMemo(() => {
    const set = new Set(orders.map((o) => o.loadingCompany))
    return Array.from(set).sort()
  }, [orders])

  // ----------------------------------------------------------------
  // Filtered orders
  // ----------------------------------------------------------------
  const filteredOrders = useMemo(() => {
    return orders.filter((o) => {
      if (
        searchTerm &&
        !o.truckNumber.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !o.loadingCompany.toLowerCase().includes(searchTerm.toLowerCase()) &&
        !o.notes?.toLowerCase().includes(searchTerm.toLowerCase())
      )
        return false
      if (statusFilter !== "ALL" && o.status !== statusFilter) return false
      if (productFilter !== "ALL" && o.product !== productFilter) return false
      if (companyFilter !== "ALL" && o.loadingCompany !== companyFilter)
        return false
      return true
    })
  }, [orders, searchTerm, statusFilter, productFilter, companyFilter])

  // ----------------------------------------------------------------
  // CRUD helpers
  // ----------------------------------------------------------------
  const handleSave = useCallback(async () => {
    if (!formData.truckNumber.trim()) {
      toast({ title: "Missing truck number", variant: "destructive" })
      return
    }
    if (!formData.loadingCompany.trim()) {
      toast({ title: "Missing loading company", variant: "destructive" })
      return
    }
    if (!formData.destination.trim()) {
      toast({ title: "Missing destination", variant: "destructive" })
      return
    }
    if (formData.volume <= 0) {
      toast({ title: "Volume must be greater than 0", variant: "destructive" })
      return
    }

    setIsSaving(true)
    try {
      const now = new Date().toISOString()
      if (editingOrder) {
        // Update
        await update(
          ref(database, `third_party_orders/${editingOrder.id}`),
          {
            truckNumber: formData.truckNumber.toUpperCase().trim(),
            product: formData.product,
            volume: formData.volume,
            loadingCompany: formData.loadingCompany.trim(),
            destination: formData.destination.trim(),
            status: formData.status,
            notes: formData.notes || "",
            updatedAt: now,
          }
        )
        toast({ title: "Order updated" })
      } else {
        // Create
        const newRef = push(ref(database, "third_party_orders"))
        await update(newRef, {
          truckNumber: formData.truckNumber.toUpperCase().trim(),
          product: formData.product,
          volume: formData.volume,
          loadingCompany: formData.loadingCompany.trim(),
          destination: formData.destination.trim(),
          status: formData.status,
          notes: formData.notes || "",
          createdAt: now,
          updatedAt: now,
          createdBy: session?.user?.email || "unknown",
        })
        toast({ title: "Order added" })
      }
      closeDialog()
    } catch (err: any) {
      toast({
        title: "Error saving order",
        description: err.message,
        variant: "destructive",
      })
    } finally {
      setIsSaving(false)
    }
  }, [formData, editingOrder, session])

  const handleDelete = useCallback(async (id: string) => {
    try {
      await remove(ref(database, `third_party_orders/${id}`))
      toast({ title: "Order deleted" })
    } catch (err: any) {
      toast({
        title: "Error deleting",
        description: err.message,
        variant: "destructive",
      })
    }
  }, [])

  const handleStatusChange = useCallback(
    async (order: ThirdPartyOrder, newStatus: ThirdPartyOrder["status"]) => {
      try {
        await update(ref(database, `third_party_orders/${order.id}`), {
          status: newStatus,
          updatedAt: new Date().toISOString(),
        })
        toast({ title: `Status updated to ${THIRD_PARTY_STATUSES[newStatus].label}` })
      } catch (err: any) {
        toast({
          title: "Error updating status",
          description: err.message,
          variant: "destructive",
        })
      }
    },
    []
  )

  // ----------------------------------------------------------------
  // Dialog helpers
  // ----------------------------------------------------------------
  const openAdd = () => {
    setEditingOrder(null)
    setFormData(defaultForm)
    setIsAddOpen(true)
  }

  const openEdit = (order: ThirdPartyOrder) => {
    setEditingOrder(order)
    setFormData({
      truckNumber: order.truckNumber,
      product: order.product,
      volume: order.volume,
      loadingCompany: order.loadingCompany,
      destination: order.destination || "",
      status: order.status,
      notes: order.notes || "",
    })
    setIsAddOpen(true)
  }

  const closeDialog = () => {
    setIsAddOpen(false)
    setEditingOrder(null)
    setFormData(defaultForm)
  }

  // ----------------------------------------------------------------
  // Copy summary
  // ----------------------------------------------------------------
  const handleCopySummary = useCallback(() => {
    const data = filteredOrders
    const now = new Date().toLocaleString()

    // Overall stats
    const total = data.length
    const notQueued = data.filter((o) => o.status === "not_queued")
    const queued = data.filter((o) => o.status === "queued")
    const loaded = data.filter((o) => o.status === "loaded")
    const agoTotal = data.filter((o) => o.product === "AGO")
    const pmsTotal = data.filter((o) => o.product === "PMS")
    const agoVol = agoTotal.reduce((s, o) => s + o.volume, 0)
    const pmsVol = pmsTotal.reduce((s, o) => s + o.volume, 0)

    let text = `Third Party Orders Summary\n`
    text += `Generated: ${now}\n\n`
    text += `Overview:\n`
    text += `  Total Orders: ${total}\n`
    text += `  Not Queued: ${notQueued.length}\n`
    text += `  Queued: ${queued.length}\n`
    text += `  Loaded: ${loaded.length}\n`
    text += `  AGO: ${agoTotal.length} orders – ${agoVol.toLocaleString()} L\n`
    text += `  PMS: ${pmsTotal.length} orders – ${pmsVol.toLocaleString()} L\n`
    text += `  Total Volume: ${(agoVol + pmsVol).toLocaleString()} L\n`

    // Group by company
    const byCompany: Record<
      string,
      { orders: ThirdPartyOrder[]; volume: number }
    > = {}
    data.forEach((o) => {
      if (!byCompany[o.loadingCompany]) {
        byCompany[o.loadingCompany] = { orders: [], volume: 0 }
      }
      byCompany[o.loadingCompany].orders.push(o)
      byCompany[o.loadingCompany].volume += o.volume
    })

    text += `\n---\n\nBy Company:\n`
    Object.entries(byCompany).forEach(([company, info], idx) => {
      const cNotQueued = info.orders.filter((o) => o.status === "not_queued").length
      const cQueued = info.orders.filter((o) => o.status === "queued").length
      const cLoaded = info.orders.filter((o) => o.status === "loaded").length

      text += `\n${idx + 1}. ${company}\n`
      text += `   Orders: ${info.orders.length} | Volume: ${info.volume.toLocaleString()} L\n`
      text += `   Not Queued: ${cNotQueued} | Queued: ${cQueued} | Loaded: ${cLoaded}\n`
      text += `   Trucks:\n`

      info.orders.forEach((o, i) => {
        text += `     ${i + 1}. ${o.truckNumber} – ${o.product} ${o.volume.toLocaleString()} L → ${o.destination || "N/A"} [${THIRD_PARTY_STATUSES[o.status].label}]\n`
      })
    })

    // Filters applied
    if (statusFilter !== "ALL" || productFilter !== "ALL" || companyFilter !== "ALL" || searchTerm) {
      text += `\nFilters Applied:\n`
      if (statusFilter !== "ALL") text += `  Status: ${statusFilter}\n`
      if (productFilter !== "ALL") text += `  Product: ${productFilter}\n`
      if (companyFilter !== "ALL") text += `  Company: ${companyFilter}\n`
      if (searchTerm) text += `  Search: ${searchTerm}\n`
    }

    navigator.clipboard
      .writeText(text)
      .then(() => {
        toast({ title: "Copied", description: "Summary copied to clipboard" })
      })
      .catch(() => {
        toast({ title: "Error", description: "Failed to copy summary", variant: "destructive" })
      })
  }, [filteredOrders, statusFilter, productFilter, companyFilter, searchTerm])

  // ----------------------------------------------------------------
  // PDF export
  // ----------------------------------------------------------------
  const exportPDF = () => {
    const doc = new jsPDF()
    doc.setFontSize(16)
    doc.text("Third Party Orders", 14, 15)
    doc.setFontSize(10)
    doc.text(`Generated: ${new Date().toLocaleString()}`, 14, 22)

    autoTable(doc, {
      startY: 28,
      head: [["#", "Truck", "Product", "Volume (L)", "Company", "Destination", "Status"]],
      body: filteredOrders.map((o, i) => [
        i + 1,
        o.truckNumber,
        o.product,
        o.volume.toLocaleString(),
        o.loadingCompany,
        o.destination || "—",
        THIRD_PARTY_STATUSES[o.status].label,
      ]),
    })

    doc.save("third-party-orders.pdf")
  }

  // ----------------------------------------------------------------
  // Loading / auth
  // ----------------------------------------------------------------

  if (authStatus === "loading" || isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-500" />
      </div>
    )
  }

  // ----------------------------------------------------------------
  // Render
  // ----------------------------------------------------------------
  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="sticky top-0 z-50 w-full border-b bg-background/80 backdrop-blur-sm">
        <div className="container flex h-14 items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.push("/dashboard/work/orders")}
            >
              <ArrowLeft className="h-5 w-5" />
            </Button>
            <h1 className="text-lg font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Third Party Orders
            </h1>
            <Badge variant="secondary" className="text-xs">
              {filteredOrders.length}
            </Badge>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={handleCopySummary} title="Copy summary">
              <Copy className="h-4 w-4" />
            </Button>
            <Button variant="outline" size="sm" onClick={exportPDF}>
              <Download className="h-4 w-4 mr-1" />
              PDF
            </Button>
            <Button
              size="sm"
              onClick={openAdd}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
            <ThemeToggle />
            <Avatar
              className="h-8 w-8 ring-2 ring-emerald-500/50 ring-offset-2 ring-offset-background cursor-pointer"
              onClick={() => router.push("/dashboard")}
            >
              <AvatarImage
                src={session?.user?.image || profilePicUrl || ""}
                alt={session?.user?.name || "User"}
              />
              <AvatarFallback className="bg-emerald-100 text-emerald-700">
                {session?.user?.email?.[0]?.toUpperCase() || "U"}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6 space-y-6">
        {/* Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-3">
          <SummaryCard label="Total" value={summary.total} />
          <SummaryCard
            label="Not Queued"
            value={summary.notQueued}
            className="border-red-200 dark:border-red-800"
          />
          <SummaryCard
            label="Queued"
            value={summary.queued}
            className="border-amber-200 dark:border-amber-800"
          />
          <SummaryCard
            label="Loaded"
            value={summary.loaded}
            className="border-emerald-200 dark:border-emerald-800"
          />
          <SummaryCard
            label="AGO (L)"
            value={summary.agoVolume.toLocaleString()}
          />
          <SummaryCard
            label="PMS (L)"
            value={summary.pmsVolume.toLocaleString()}
          />
        </div>

        {/* Company breakdown */}
        {Object.keys(summary.byCompany).length > 0 && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Object.entries(summary.byCompany).map(([company, data]) => (
              <Card key={company} className="p-3">
                <div className="flex items-center gap-2 mb-1">
                  <Building2 className="h-4 w-4 text-muted-foreground" />
                  <span className="font-medium text-sm truncate">
                    {company}
                  </span>
                </div>
                <div className="flex gap-3 text-xs text-muted-foreground">
                  <span>{data.count} orders</span>
                  <span>{data.volume.toLocaleString()} L</span>
                </div>
              </Card>
            ))}
          </div>
        )}

        {/* Search & Filters */}
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Search truck, company, notes..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setShowFilters(!showFilters)}
          >
            <Filter className="h-4 w-4 mr-1" />
            Filters
          </Button>
        </div>

        <AnimatePresence>
          {showFilters && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: "auto", opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              className="overflow-hidden"
            >
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pb-2">
                <Select
                  value={statusFilter}
                  onValueChange={setStatusFilter}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Statuses</SelectItem>
                    <SelectItem value="not_queued">Not Queued</SelectItem>
                    <SelectItem value="queued">Queued</SelectItem>
                    <SelectItem value="loaded">Loaded</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={productFilter}
                  onValueChange={setProductFilter}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Product" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Products</SelectItem>
                    <SelectItem value="AGO">AGO</SelectItem>
                    <SelectItem value="PMS">PMS</SelectItem>
                  </SelectContent>
                </Select>

                <Select
                  value={companyFilter}
                  onValueChange={setCompanyFilter}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Company" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All Companies</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c} value={c}>
                        {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Orders Table */}
        <Card>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="text-left p-3 font-medium">#</th>
                  <th className="text-left p-3 font-medium">Truck</th>
                  <th className="text-left p-3 font-medium">Product</th>
                  <th className="text-right p-3 font-medium">Volume (L)</th>
                  <th className="text-left p-3 font-medium">Company</th>
                  <th className="text-left p-3 font-medium">Destination</th>
                  <th className="text-left p-3 font-medium">Status</th>
                  <th className="text-left p-3 font-medium">Notes</th>
                  <th className="text-right p-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                <AnimatePresence>
                  {filteredOrders.length === 0 ? (
                    <tr>
                      <td
                        colSpan={9}
                        className="text-center py-12 text-muted-foreground"
                      >
                        {orders.length === 0
                          ? "No third party orders yet. Click Add to create one."
                          : "No orders match your filters."}
                      </td>
                    </tr>
                  ) : (
                    filteredOrders.map((order, idx) => (
                      <motion.tr
                        key={order.id}
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0, y: -10 }}
                        transition={{ delay: idx * 0.02 }}
                        className="border-b hover:bg-muted/30 transition-colors"
                      >
                        <td className="p-3 text-muted-foreground">
                          {idx + 1}
                        </td>
                        <td className="p-3 font-mono font-medium">
                          {order.truckNumber}
                        </td>
                        <td className="p-3">
                          <Badge
                            variant="outline"
                            className={
                              order.product === "AGO"
                                ? "border-blue-300 text-blue-700 dark:border-blue-700 dark:text-blue-300"
                                : "border-purple-300 text-purple-700 dark:border-purple-700 dark:text-purple-300"
                            }
                          >
                            {order.product}
                          </Badge>
                        </td>
                        <td className="p-3 text-right font-mono">
                          {order.volume.toLocaleString()}
                        </td>
                        <td className="p-3">{order.loadingCompany}</td>
                        <td className="p-3">{order.destination || "—"}</td>
                        <td className="p-3">
                          <StatusBadgeDropdown
                            order={order}
                            onStatusChange={handleStatusChange}
                          />
                        </td>
                        <td className="p-3 max-w-[150px] truncate text-muted-foreground">
                          {order.notes || "—"}
                        </td>
                        <td className="p-3 text-right">
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem
                                onClick={() => openEdit(order)}
                              >
                                <Edit className="h-4 w-4 mr-2" /> Edit
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                className="text-red-600"
                                onClick={() => handleDelete(order.id)}
                              >
                                <Trash2 className="h-4 w-4 mr-2" /> Delete
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </td>
                      </motion.tr>
                    ))
                  )}
                </AnimatePresence>
              </tbody>
            </table>
          </div>
        </Card>
      </main>

      {/* Add / Edit Dialog */}
      <Dialog open={isAddOpen} onOpenChange={setIsAddOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingOrder ? "Edit Third Party Order" : "Add Third Party Order"}
            </DialogTitle>
          </DialogHeader>

          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>Truck Number *</Label>
              <Input
                placeholder="e.g. T 123 ABC"
                value={formData.truckNumber}
                onChange={(e) =>
                  setFormData({ ...formData, truckNumber: e.target.value })
                }
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>Product *</Label>
                <Select
                  value={formData.product}
                  onValueChange={(v) =>
                    setFormData({
                      ...formData,
                      product: v as "AGO" | "PMS",
                    })
                  }
                >
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="AGO">AGO</SelectItem>
                    <SelectItem value="PMS">PMS</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="grid gap-2">
                <Label>Volume (Litres) *</Label>
                <Input
                  type="number"
                  placeholder="0"
                  value={formData.volume || ""}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      volume: parseFloat(e.target.value) || 0,
                    })
                  }
                />
              </div>
            </div>

            <div className="grid gap-2">
              <Label>Loading Company *</Label>
              <Input
                placeholder="e.g. TotalEnergies, Oryx, Puma..."
                value={formData.loadingCompany}
                onChange={(e) =>
                  setFormData({ ...formData, loadingCompany: e.target.value })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label>Destination *</Label>
              <Input
                placeholder="e.g. Dar es Salaam, Dodoma..."
                value={formData.destination}
                onChange={(e) =>
                  setFormData({ ...formData, destination: e.target.value })
                }
              />
            </div>

            <div className="grid gap-2">
              <Label>Status</Label>
              <Select
                value={formData.status}
                onValueChange={(v) =>
                  setFormData({
                    ...formData,
                    status: v as ThirdPartyFormData["status"],
                  })
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="not_queued">Not Queued</SelectItem>
                  <SelectItem value="queued">Queued</SelectItem>
                  <SelectItem value="loaded">Loaded</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="grid gap-2">
              <Label>Notes (optional)</Label>
              <Textarea
                placeholder="Any extra details..."
                value={formData.notes}
                onChange={(e) =>
                  setFormData({ ...formData, notes: e.target.value })
                }
                className="resize-none"
                rows={2}
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={closeDialog}>
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={isSaving}
              className="bg-emerald-600 hover:bg-emerald-700 text-white"
            >
              {isSaving ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : null}
              {editingOrder ? "Update" : "Add Order"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// ------------------------------------------------------------------
// Sub-components
// ------------------------------------------------------------------

function SummaryCard({
  label,
  value,
  className,
}: {
  label: string
  value: string | number
  className?: string
}) {
  return (
    <Card className={`p-3 ${className || ""}`}>
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold">{value}</p>
    </Card>
  )
}

function StatusBadgeDropdown({
  order,
  onStatusChange,
}: {
  order: ThirdPartyOrder
  onStatusChange: (
    order: ThirdPartyOrder,
    status: ThirdPartyOrder["status"]
  ) => void
}) {
  const info = THIRD_PARTY_STATUSES[order.status]

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="focus:outline-none">
          <Badge
            className={`cursor-pointer ${info.color} hover:opacity-80 transition-opacity`}
          >
            {info.label}
          </Badge>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent>
        {(
          Object.entries(THIRD_PARTY_STATUSES) as [
            ThirdPartyOrder["status"],
            (typeof THIRD_PARTY_STATUSES)[ThirdPartyOrder["status"]],
          ][]
        ).map(([key, val]) => (
          <DropdownMenuItem
            key={key}
            disabled={key === order.status}
            onClick={() => onStatusChange(order, key)}
          >
            <Badge className={`${val.color} mr-2`}>{val.label}</Badge>
            {key === order.status && (
              <Check className="h-3 w-3 ml-auto text-emerald-500" />
            )}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
