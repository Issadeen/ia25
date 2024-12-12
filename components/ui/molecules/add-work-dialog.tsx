'use client'

// ...existing imports...
import { useState } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Label } from "@/components/ui/label"
import { Loader2 } from "lucide-react"
import { database } from "@/lib/firebase"
import { ref, get, query, orderByChild, equalTo } from "firebase/database"
import { toast } from "@/components/ui/use-toast"

interface WorkFormData {
  owner: string
  product: string
  truck_number: string
  quantity: string
  status: string
  orderno: string
  depot: string
  destination: string
  price: string
}

interface AddWorkDialogProps {
  onClose: () => void
  onSave: (formData: WorkFormData) => Promise<{ success: boolean; id: string }>
}

export function AddWorkDialog({ onClose, onSave }: AddWorkDialogProps) {
  const [isLoading, setIsLoading] = useState(false)
  const [orderError, setOrderError] = useState("")
  const [formData, setFormData] = useState<WorkFormData>({
    owner: "",
    product: "",
    truck_number: "",
    quantity: "",
    status: "not queued",
    orderno: "",
    depot: "",
    destination: "",
    price: ""
  })

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setIsLoading(true)
    setOrderError("")
    
    try {
      // Validate required fields
      if (!formData.owner || !formData.product || !formData.truck_number || 
          !formData.quantity || !formData.orderno || !formData.depot || 
          !formData.destination || !formData.price) {
        alert("All fields are required")
        return
      }

      // Validate quantity is a number
      if (isNaN(Number(formData.quantity))) {
        alert("Quantity must be a number")
        return
      }

      // Validate price is a number with up to 3 decimal places
      const priceRegex = /^\d+(\.\d{0,3})?$/
      if (!priceRegex.test(formData.price)) {
        alert("Price must be a number with up to 3 decimal places")
        return
      }

      // Check for duplicate order number - with more thorough validation
      const orderRef = ref(database, 'work_details')
      const orderQuery = query(
        orderRef,
        orderByChild('orderno')
      )
      const orderSnapshot = await get(orderQuery)

      if (orderSnapshot.exists()) {
        const orders = Object.values(orderSnapshot.val()) as any[]
        const matchingOrder = orders.find(order => 
          order.orderno.toLowerCase() === formData.orderno.toLowerCase() ||
          order.orderno.replace(/\s+/g, '') === formData.orderno.replace(/\s+/g, '') ||
          order.orderno.replace(/[-_]/g, '') === formData.orderno.replace(/[-_]/g, '')
        )

        if (matchingOrder) {
          setOrderError(`Order number ${formData.orderno} (or similar) is already used by truck ${matchingOrder.truck_number}. Please use a different order number.`)
          setIsLoading(false)
          return
        }
      }

      // Check stock availability
      const stockRef = ref(database, `stocks/${formData.product.toLowerCase()}`)
      const stockSnapshot = await get(stockRef)
      const currentStock = stockSnapshot.val()?.quantity || 0
      const requestedQuantity = parseFloat(formData.quantity)

      if (currentStock < requestedQuantity) {
        setOrderError(`Insufficient stock. Available ${formData.product}: ${currentStock.toLocaleString()} litres. Requested: ${requestedQuantity.toLocaleString()} litres`)
        return
      }

      const result = await onSave({
        ...formData,
        price: formData.price,
      })
      
      if (result.success) {
        toast({
          title: "Success",
          description: "Work detail added successfully",
        })
        onClose()
      }
    } catch (error) {
      console.error('Save error:', error)
      setOrderError(error instanceof Error ? error.message : "Failed to save work detail")
    } finally {
      setIsLoading(false)
    }
  }

  const handleChange = (field: keyof WorkFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }))
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Owner Input */}
        <div className="space-y-2">
          <Label htmlFor="owner">Owner</Label>
          <Input
            id="owner"
            value={formData.owner}
            onChange={(e) => handleChange("owner", e.target.value)}
            placeholder="Enter owner name"
          />
        </div>

        {/* Product Select */}
        <div className="space-y-2">
          <Label htmlFor="product">Product</Label>
          <Select
            value={formData.product}
            onValueChange={(value) => handleChange("product", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select product" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="AGO">AGO</SelectItem>
              <SelectItem value="PMS">PMS</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Truck Number Input */}
        <div className="space-y-2">
          <Label htmlFor="truck_number">Truck Number</Label>
          <Input
            id="truck_number"
            value={formData.truck_number}
            onChange={(e) => handleChange("truck_number", e.target.value)}
            placeholder="Enter truck number"
          />
        </div>

        {/* Quantity Input */}
        <div className="space-y-2">
          <Label htmlFor="quantity">Quantity</Label>
          <Input
            id="quantity"
            type="number"
            value={formData.quantity}
            onChange={(e) => handleChange("quantity", e.target.value)}
            placeholder="Enter quantity"
          />
        </div>

        {/* Order Number Input */}
        <div className="space-y-2">
          <Label htmlFor="orderno">Order Number</Label>
          <Input
            id="orderno"
            value={formData.orderno}
            onChange={(e) => handleChange("orderno", e.target.value)}
            placeholder="Enter order number"
          />
        </div>

        {/* Depot Input */}
        <div className="space-y-2">
          <Label htmlFor="depot">Depot</Label>
          <Input
            id="depot"
            value={formData.depot}
            onChange={(e) => handleChange("depot", e.target.value)}
            placeholder="Enter depot"
          />
        </div>

        {/* Destination Input */}
        <div className="space-y-2">
          <Label htmlFor="destination">Destination</Label>
          <Input
            id="destination"
            value={formData.destination}
            onChange={(e) => handleChange("destination", e.target.value)}
            placeholder="Enter destination"
          />
        </div>

        {/* Price Input */}
        <div className="space-y-2">
          <Label htmlFor="price">Price</Label>
          <Input
            id="price"
            type="number"
            step="0.001"
            value={formData.price}
            onChange={(e) => handleChange("price", e.target.value)}
            placeholder="Enter price (up to 3 decimal places)"
          />
        </div>

        {/* Status Select */}
        <div className="space-y-2">
          <Label htmlFor="status">Status</Label>
          <Select
            value={formData.status}
            onValueChange={(value) => handleChange("status", value)}
          >
            <SelectTrigger>
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="not queued">Not Queued</SelectItem>
              <SelectItem value="queued">Queued</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {orderError && (
        <div className="text-red-500 text-sm">{orderError}</div>
      )}

      <div className="flex justify-end gap-4">
        <Button type="button" variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button type="submit" disabled={isLoading}>
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Save
        </Button>
      </div>
    </form>
  )
}