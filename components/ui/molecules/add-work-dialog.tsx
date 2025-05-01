'use client'

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Trash2, Plus } from 'lucide-react'; // Import icons
import { formatNumber } from '@/lib/utils'; // For formatting numbers
import { AddWorkFormData, MultiProductWorkFormData, ProductEntry } from "@/types/work";

// Define the structure for an item within a work order
interface WorkItem {
  product: 'AGO' | 'PMS' | string;
  quantity: number;
  price: number;
}

// Define the expected structure for the form data
interface WorkFormData {
  owner: string;
  items: WorkItem[]; // Keep this for backward compatibility
  truck_number: string;
  status: string;
  orderno: string;
  depot: string;
  destination: string;
  products: ProductEntry[]; // Add this for multiple products
}

interface AddWorkDialogProps {
  onClose: () => void;
  onSave: (data: AddWorkFormData | MultiProductWorkFormData) => Promise<{ success: boolean; id: string }>;
}

export function AddWorkDialog({ onClose, onSave }: AddWorkDialogProps) {
  // Update initial state
  const [formData, setFormData] = useState<WorkFormData>({
    owner: "",
    items: [{ product: "AGO", quantity: 0, price: 0 }],
    products: [{ product: "AGO", quantity: "0", price: "0" }],
    truck_number: "",
    status: "queued",
    orderno: "",
    depot: "",
    destination: "",
  });
  const [isSaving, setIsSaving] = useState(false);

  // Handle changes for top-level fields
  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    const { name, value } = e.target;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Handle changes for status select
  const handleStatusChange = (value: string) => {
    setFormData(prev => ({ ...prev, status: value }));
  };

  // Add handler for multiple products
  const handleProductChange = (index: number, field: keyof ProductEntry, value: string) => {
    const newProducts = [...formData.products];
    newProducts[index] = { ...newProducts[index], [field]: value };
    setFormData(prev => ({ ...prev, products: newProducts }));
  };

  // Add new product entry
  const addProduct = () => {
    setFormData(prev => ({
      ...prev,
      products: [...prev.products, { product: "AGO", quantity: "0", price: "0" }]
    }));
  };

  // Remove product entry
  const removeProduct = (index: number) => {
    if (formData.products.length <= 1) return;
    const newProducts = formData.products.filter((_, i) => i !== index);
    setFormData(prev => ({ ...prev, products: newProducts }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    
    // Basic validation
    if (formData.products.length === 0 || formData.products.every(p => parseFloat(p.quantity) <= 0)) {
      alert("Please add at least one product with a quantity greater than 0.");
      setIsSaving(false);
      return;
    }

    if (!formData.owner || !formData.truck_number || !formData.orderno) {
      alert("Please fill in Owner, Truck Number, and Order Number.");
      setIsSaving(false);
      return;
    }

    const multiProductForm: MultiProductWorkFormData = {
      owner: formData.owner,
      truck_number: formData.truck_number,
      status: formData.status,
      orderno: formData.orderno,
      depot: formData.depot,
      destination: formData.destination,
      products: formData.products
    };

    await onSave(multiProductForm);
    setIsSaving(false);
  };

  // Calculate total quantity and value for display
  const totalQuantity = formData.products.reduce((sum, product) => sum + parseFloat(product.quantity), 0);
  const totalValue = formData.products.reduce((sum, product) => sum + (parseFloat(product.quantity) * parseFloat(product.price)), 0);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {/* Top Level Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div>
          <Label htmlFor="owner">Owner</Label>
          <Input id="owner" name="owner" value={formData.owner} onChange={handleChange} required />
        </div>
        <div>
          <Label htmlFor="truck_number">Truck Number</Label>
          <Input id="truck_number" name="truck_number" value={formData.truck_number} onChange={handleChange} required />
        </div>
        <div>
          <Label htmlFor="orderno">Order No</Label>
          <Input id="orderno" name="orderno" value={formData.orderno} onChange={handleChange} required />
        </div>
        <div>
          <Label htmlFor="status">Status</Label>
          <Select value={formData.status} onValueChange={handleStatusChange}>
            <SelectTrigger id="status">
              <SelectValue placeholder="Select status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="queued">Queued</SelectItem>
              <SelectItem value="not queued">Not Queued</SelectItem>
              {/* Add other statuses if needed */}
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label htmlFor="depot">Depot</Label>
          <Input id="depot" name="depot" value={formData.depot} onChange={handleChange} />
        </div>
        <div>
          <Label htmlFor="destination">Destination</Label>
          <Input id="destination" name="destination" value={formData.destination} onChange={handleChange} />
        </div>
      </div>

      {/* Products Section */}
      <div className="space-y-3 border-t pt-4">
        <h3 className="text-lg font-medium">Products</h3>
        {formData.products.map((product, index) => (
          <div key={index} className="grid grid-cols-1 sm:grid-cols-4 gap-2 items-end border p-3 rounded">
            <div>
              <Label htmlFor={`product-type-${index}`}>Product</Label>
              <Select
                value={product.product}
                onValueChange={(value) => handleProductChange(index, 'product', value)}
              >
                <SelectTrigger id={`product-type-${index}`}>
                  <SelectValue placeholder="Select product" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AGO">AGO</SelectItem>
                  <SelectItem value="PMS">PMS</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label htmlFor={`product-quantity-${index}`}>Quantity</Label>
              <Input
                id={`product-quantity-${index}`}
                type="number"
                value={product.quantity}
                onChange={(e) => handleProductChange(index, 'quantity', e.target.value)}
                min="0"
                step="any"
                required
              />
            </div>
            <div>
              <Label htmlFor={`product-price-${index}`}>Price</Label>
              <Input
                id={`product-price-${index}`}
                type="number"
                value={product.price}
                onChange={(e) => handleProductChange(index, 'price', e.target.value)}
                min="0"
                step="any"
                required
              />
            </div>
            <div className="flex items-center">
              {formData.products.length > 1 && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => removeProduct(index)}
                  className="text-red-500 hover:text-red-700"
                >
                  <Trash2 className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        ))}
        <Button type="button" variant="outline" size="sm" onClick={addProduct} className="mt-2">
          <Plus className="h-4 w-4 mr-2" /> Add Product
        </Button>
      </div>

      {/* Summary Display */}
      <div className="border-t pt-4 flex justify-between text-sm font-medium">
          <span>Total Quantity: {formatNumber(totalQuantity)}</span>
          <span>Total Value: ${formatNumber(totalValue)}</span>
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end space-x-2 pt-4">
        <Button type="button" variant="outline" onClick={onClose} disabled={isSaving}>
          Cancel
        </Button>
        <Button type="submit" disabled={isSaving}>
          {isSaving ? "Saving..." : "Save Work Detail"}
        </Button>
      </div>
    </form>
  );
}