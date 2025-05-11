'use client'

import { useState, useEffect } from 'react'
import { getDatabase } from 'firebase/database'
import { useRouter } from 'next/navigation'
import { useSession } from 'next-auth/react'
import { ArrowLeft, RefreshCw, Search, Calendar, FileText, TruckIcon, ExternalLink, Sun, Moon, Copy, Check } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from '@/components/ui/card'
import { useToast } from '@/components/ui/use-toast'
import { Badge } from '@/components/ui/badge'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { useProfileImage } from '@/hooks/useProfileImage'
import { useTheme } from 'next-themes'
import { Input } from '@/components/ui/input'
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip"
import { 
  getActivePermitAllocations, 
  getActivePreAllocations, 
  getActivePermitWithAllocations
} from '@/lib/active-permit-service'
import type { WorkDetail } from '@/types/work'
import type { PreAllocation } from '@/types/permits'

interface AllocationWithData {
  workOrder: WorkDetail;
  preAllocations: PreAllocation[];
}

export default function ActivePermitsPage() {
  const { theme, setTheme } = useTheme()
  const router = useRouter()
  const { toast } = useToast()
  const { data: session } = useSession()
  const profilePicUrl = useProfileImage()
  
  const [allocations, setAllocations] = useState<AllocationWithData[]>([])
  const [loading, setLoading] = useState(true)
  const [searchTerm, setSearchTerm] = useState('')
  const [productFilter, setProductFilter] = useState('ALL')
  const [destinationFilter, setDestinationFilter] = useState('ALL')
  const [refreshing, setRefreshing] = useState(false)
  const [lastUpdateTime, setLastUpdateTime] = useState<Date | null>(null)
  const [copyingId, setCopyingId] = useState<string | null>(null);

  useEffect(() => {
    fetchAllocations()
  }, [])

  const fetchAllocations = async () => {
    try {
      setLoading(true)
      const db = getDatabase()
      const data = await getActivePermitWithAllocations(db)
      setAllocations(data)
      setLastUpdateTime(new Date())
    } catch (error) {
      console.error('Error fetching allocations:', error)
      toast({
        title: "Error",
        description: "Failed to load active permit allocations",
        variant: "destructive"
      })
    } finally {
      setLoading(false)
      setRefreshing(false)
    }
  }

  const handleRefresh = () => {
    setRefreshing(true)
    fetchAllocations()
  }

  const getFilteredAllocations = () => {
    return allocations.filter(item => {
      const { workOrder, preAllocations } = item
      
      // Filter by search term (truck number or owner)
      const matchesSearch = !searchTerm || 
        workOrder.truck_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
        workOrder.owner.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (workOrder.permitNumber && workOrder.permitNumber.toLowerCase().includes(searchTerm.toLowerCase()))
      
      // Filter by product
      const matchesProduct = productFilter === 'ALL' || 
        workOrder.product?.toLowerCase() === productFilter.toLowerCase()
      
      // Filter by destination
      const matchesDestination = destinationFilter === 'ALL' || 
        workOrder.destination?.toLowerCase() === destinationFilter.toLowerCase()
      
      return matchesSearch && matchesProduct && matchesDestination
    })
  }

  const formatTimeAgo = (dateString: string) => {
    const date = new Date(dateString)
    const now = new Date()
    const diffMs = now.getTime() - date.getTime()
    const diffMins = Math.floor(diffMs / 60000)
    const diffHours = Math.floor(diffMins / 60)
    const diffDays = Math.floor(diffHours / 24)
    
    if (diffMins < 60) return `${diffMins} min ago`
    if (diffHours < 24) return `${diffHours} hr ago`
    return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`
  }

  const copyPermitDetails = (workOrder: WorkDetail, permits: PreAllocation[]) => {
    if (!workOrder) return;
    
    setCopyingId(workOrder.id);
    
    const quantityDisplay = Number(workOrder.quantity) < 100
      ? `${workOrder.quantity}m³`
      : `${Math.round(Number(workOrder.quantity) / 1000)}K`;
      
    let permitNumbersDisplay = '';
    if (workOrder.permitNumber) {
      const permitNumbers = workOrder.permitNumber.split(',').map(num => num.trim());
      permitNumbersDisplay = permitNumbers.length > 1 
        ? `Entries: ${permitNumbers.join(' & ')}` 
        : `Entry: ${workOrder.permitNumber}`;
    }
    
    const formattedData = 
`Truck: ${workOrder.truck_number}
Product: ${workOrder.product}
Quantity: ${quantityDisplay}
${permitNumbersDisplay}
Destination: ${workOrder.destination}
Owner: ${workOrder.owner}`;
    
    navigator.clipboard.writeText(formattedData)
      .then(() => {
        toast({
          title: "Copied to clipboard",
          description: "Permit details copied",
          duration: 2000
        });
        
        setTimeout(() => {
          setCopyingId(null);
        }, 1000);
      })
      .catch(err => {
        console.error('Failed to copy:', err)
        toast({
          title: "Copy failed",
          description: "Couldn't copy to clipboard",
          variant: "destructive"
        })
        setCopyingId(null);
      });
  };

  return (
    <div className="min-h-screen bg-background">
      <header className="fixed top-0 left-0 w-full border-b z-50 bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 max-w-screen-2xl items-center justify-between">
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="icon" onClick={() => router.back()}>
              <ArrowLeft className="h-4 w-4" />
            </Button>
            <h1 className="font-semibold bg-gradient-to-r from-emerald-600 via-teal-500 to-blue-500 bg-clip-text text-transparent">
              Active Permit Allocations
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefresh}
              disabled={refreshing}
              className="flex items-center gap-2"
            >
              {refreshing ? (
                <RefreshCw className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
              Refresh
            </Button>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              aria-label="Toggle theme"
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
                src={session?.user?.image || profilePicUrl || ''}
                alt={session?.user?.name || 'User Profile'}
              />
              <AvatarFallback className="bg-emerald-100 text-emerald-700">
                {session?.user?.email?.[0]?.toUpperCase() || 'U'}
              </AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      <main className="container max-w-screen-2xl pt-20 pb-8">
        <div className="mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="relative w-full">
              <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search by truck, owner or permit..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-8 w-full" 
              />
            </div>
            <Select
              value={productFilter}
              onValueChange={setProductFilter}
            >
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Product" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Products</SelectItem>
                <SelectItem value="ago">AGO</SelectItem>
                <SelectItem value="pms">PMS</SelectItem>
              </SelectContent>
            </Select>
            <Select
              value={destinationFilter}
              onValueChange={setDestinationFilter}
            >
              <SelectTrigger className="w-full sm:w-[150px]">
                <SelectValue placeholder="Destination" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">All Destinations</SelectItem>
                <SelectItem value="ssd">South Sudan</SelectItem>
                <SelectItem value="drc">DRC</SelectItem>
              </SelectContent>
            </Select>
          </div>
          {lastUpdateTime && (
            <div className="text-xs text-muted-foreground mt-2">
              Last updated: {lastUpdateTime.toLocaleTimeString()}
            </div>
          )}
        </div>
        
        {loading ? (
          <div className="flex items-center justify-center p-12">
            <RefreshCw className="h-8 w-8 animate-spin text-muted-foreground" />
          </div>
        ) : getFilteredAllocations().length === 0 ? (
          <div className="text-center p-12 border rounded-lg bg-muted/20">
            <div className="text-muted-foreground mb-2">No active permit allocations found</div>
            <Button 
              variant="outline" 
              onClick={() => router.push('/dashboard/work/permits')}
            >
              Go to Permit Allocation
            </Button>
          </div>
        ) : (
          <div className="space-y-4">
            <h2 className="text-lg font-medium">
              {getFilteredAllocations().length} Active Allocation{getFilteredAllocations().length !== 1 && 's'}
            </h2>
            
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Truck</TableHead>
                    <TableHead>Permit Number</TableHead>
                    <TableHead>Owner</TableHead>
                    <TableHead>Product</TableHead>
                    <TableHead>Destination</TableHead>
                    <TableHead>Quantity</TableHead>
                    <TableHead>Allocated</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {getFilteredAllocations().map(({ workOrder, preAllocations }) => (
                    <TableRow key={workOrder.id}>
                      <TableCell className="font-medium">
                        <div className="flex items-center">
                          <TruckIcon className="h-3.5 w-3.5 text-muted-foreground mr-1.5" />
                          {workOrder.truck_number}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {workOrder.permitNumber && workOrder.permitNumber.split(',').map((num, idx) => (
                            <Badge key={idx} variant="outline" className="font-mono">{num.trim()}</Badge>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell>{workOrder.owner}</TableCell>
                      <TableCell>
                        <Badge variant="secondary">
                          {workOrder.product?.toUpperCase()}
                        </Badge>
                      </TableCell>
                      <TableCell>{workOrder.destination?.toUpperCase()}</TableCell>
                      <TableCell>{Number(workOrder.quantity).toLocaleString()}L</TableCell>
                      <TableCell>
                        {preAllocations.length > 0 && (
                          <div className="text-xs text-muted-foreground">
                            {formatTimeAgo(preAllocations[0].allocatedAt)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-2">
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => copyPermitDetails(workOrder, preAllocations)}
                                >
                                  {copyingId === workOrder.id ? (
                                    <Check className="h-4 w-4 text-green-500" />
                                  ) : (
                                    <Copy className="h-4 w-4" />
                                  )}
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>Copy Permit Details</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => router.push(`/dashboard/work/orders/${workOrder.id}`)}
                                >
                                  <ExternalLink className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View Order Details</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                          
                          <TooltipProvider>
                            <Tooltip>
                              <TooltipTrigger asChild>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-8 w-8"
                                  onClick={() => {
                                    const workOrderId = workOrder.id;
                                    if (workOrderId) {
                                      router.push(`/dashboard/work/permits/details/${workOrderId}`);
                                    }
                                  }}
                                >
                                  <FileText className="h-4 w-4" />
                                </Button>
                              </TooltipTrigger>
                              <TooltipContent>
                                <p>View Permit Details</p>
                              </TooltipContent>
                            </Tooltip>
                          </TooltipProvider>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        )}
      </main>
    </div>
  )
}
