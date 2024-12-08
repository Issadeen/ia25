'use client'

import { useState, useEffect, useCallback } from 'react'
import { useSession } from "next-auth/react"
import { useRouter } from "next/navigation"
import { useTheme } from "next-themes"
import { ArrowLeft, Search, Sun, Moon } from 'lucide-react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card"
import { Avatar, AvatarFallback, AvatarImage } from "components/ui/avatar"
import { database } from "lib/firebase"
import { storage } from "lib/firebase"  // Add this line
import { get, set, query, orderByChild, equalTo, ref } from 'firebase/database'
import { ref as storageRef, getDownloadURL } from 'firebase/storage'  // Add this line
import * as PDFLib from 'pdf-lib'
import { saveAs } from 'file-saver'
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib'

// Add this utility function at the top level
async function loadPdfTemplate() {
  try {
    const response = await fetch('/invoice-template.pdf')
    if (!response.ok) throw new Error('Failed to load PDF template')
    const arrayBuffer = await response.arrayBuffer()
    return arrayBuffer
  } catch (error) {
    console.error('Error loading PDF template:', error)
    throw error
  }
}

export default function WalletPage() {
  const { data: session, status } = useSession()
  const router = useRouter()
  const { theme, setTheme } = useTheme()
  const [lastUploadedImage, setLastUploadedImage] = useState<string | null>(null)

  // Basic form states
  const [billTo, setBillTo] = useState('')
  const [shipTo, setShipTo] = useState('')
  const [invoiceNumber, setInvoiceNumber] = useState('')
  const [invoiceDate, setInvoiceDate] = useState('')
  const [customerId, setCustomerId] = useState('')
  const [description, setDescription] = useState('')
  const [hsCode] = useState('0001.13.01')
  const [quantity, setQuantity] = useState('')
  const [unitPrice, setUnitPrice] = useState('')
  const [searchQuery, setSearchQuery] = useState('')
  interface InvoiceData {
    billTo: string;
    shipTo: string;
    invoiceNumber: string;
    invoiceDate: string;
    customerId: string;
    description: string;
    hsCode: string;
    quantity: number;
    unitPrice: number;
    amount: string;
    pdfUrl?: string;
  }

  const [searchResults, setSearchResults] = useState<InvoiceData[] | null>(null)

  // Auth protection
  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login")
    }
  }, [status, router])

  function generateProfileImageFilename(email: string): string {
    return email.toLowerCase().replace(/[@.]/g, '_') + '_com.jpg';
  }

  const getStoragePath = useCallback((email: string) => {
    const filename = generateProfileImageFilename(email);
    return `profile-pics/${filename}`;
  }, []);

  // Update the profile image fetch logic to match dashboard
  useEffect(() => {
    const fetchImageUrl = async () => {
      if (session?.user?.email && !session?.user?.image) {
        try {
          const path = getStoragePath(session.user.email);
          const imageRef = storageRef(storage, path);
          const url = await getDownloadURL(imageRef);
          setLastUploadedImage(url);
        } catch (error) {
          console.error('Error fetching profile image:', error);
          setLastUploadedImage(null);
        }
      }
    };

    // Only fetch if we don't have an image yet
    if (!lastUploadedImage) {
      fetchImageUrl();
    }
  }, [session?.user?.email, session?.user?.image, getStoragePath, lastUploadedImage]);

  const cardClassName = `${
    theme === 'dark' 
      ? 'bg-gray-800/95 border-gray-700' 
      : 'bg-white/95 border-gray-200'
  }`

  const inputClassName = `w-full rounded-md ${
    theme === 'dark'
      ? 'bg-gray-800 border-gray-700 text-gray-100'
      : 'bg-white border-gray-200 text-gray-900'
  }`

  const buttonClassName = `${
    theme === 'dark'
      ? 'bg-blue-600 hover:bg-blue-700 text-white'
      : 'bg-blue-500 hover:bg-blue-600 text-white'
  }`

  // Move fillPdf function outside handleSubmit
  async function fillPdf(formData: InvoiceData) {
    try {
      // Load template
      const templateBytes = await loadPdfTemplate()
      
      // Create PDF document
      const pdfDoc = await PDFDocument.load(templateBytes)
      
      // Get the first page
      const page = pdfDoc.getPages()[0]
      
      // Add a font
      const font = await pdfDoc.embedFont(StandardFonts.Helvetica)
      
      // Define positions for text (adjust these coordinates based on your template)
      const positions = {
        billTo: { x: 50, y: 700 },
        shipTo: { x: 50, y: 650 },
        invoiceNumber: { x: 450, y: 750 },
        invoiceDate: { x: 450, y: 700 },
        description: { x: 50, y: 500 },
        hsCode: { x: 50, y: 450 },
        quantity: { x: 300, y: 450 },
        unitPrice: { x: 400, y: 450 },
        amount: { x: 500, y: 450 }
      }
      
      // Draw text directly on the page
      const drawText = (text: string, x: number, y: number) => {
        page.drawText(String(text), {
          x,
          y,
          size: 12,
          font,
          color: rgb(0, 0, 0)
        })
      }
      
      // Add all text fields
      Object.entries(positions).forEach(([key, pos]) => {
        const value = formData[key as keyof InvoiceData]
        if (value !== undefined) {
          drawText(String(value), pos.x, pos.y)
        }
      })
      
      // Save the modified PDF
      const pdfBytes = await pdfDoc.save()
      const blob = new Blob([pdfBytes], { type: 'application/pdf' })
      const url = URL.createObjectURL(blob)
      
      return { blob, url }
    } catch (error) {
      console.error('PDF Generation Error:', error)
      throw new Error('Failed to generate PDF: ' + (error instanceof Error ? error.message : 'Unknown error'))
    }
  }

  // Update handleSubmit function
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    try {
      // Validate form data first
      if (!billTo || !shipTo || !invoiceDate || !description || !quantity || !unitPrice) {
        throw new Error('Please fill in all required fields')
      }
  
      // Parse numeric values
      const parsedQuantity = parseFloat(quantity)
      const parsedUnitPrice = parseFloat(unitPrice)
      if (isNaN(parsedQuantity) || isNaN(parsedUnitPrice)) {
        throw new Error('Invalid quantity or unit price')
      }
  
      // Get invoice number
      const snapshot = await get(ref(database, 'invoiceNumber'))
      let currentNumber = snapshot.val() || 599
      currentNumber++
      const newInvoiceNumber = `MOK-PFI-${currentNumber.toString().padStart(3, '0')}`
      
      // Prepare form data
      const formData: InvoiceData = {
        billTo,
        shipTo,
        invoiceNumber: newInvoiceNumber,
        invoiceDate,
        customerId,
        description,
        hsCode,
        quantity: parsedQuantity,
        unitPrice: parsedUnitPrice,
        amount: (parsedQuantity * parsedUnitPrice).toFixed(2)
      }
  
      // Save initial data
      await set(ref(database, `invoices/${newInvoiceNumber}`), formData)
      await set(ref(database, 'invoiceNumber'), currentNumber)
  
      // Generate PDF
      const { blob, url } = await fillPdf(formData)
      
      // Update with PDF URL and save
      formData.pdfUrl = url
      await set(ref(database, `invoices/${newInvoiceNumber}`), formData)
  
      // Save PDF
      saveAs(blob, `${newInvoiceNumber}.pdf`)
  
      // Update state and clear form
      setInvoiceNumber(newInvoiceNumber)
      setBillTo('')
      setShipTo('')
      setInvoiceDate('')
      setCustomerId('')
      setDescription('')
      setQuantity('')
      setUnitPrice('')
  
    } catch (error) {
      console.error('Error submitting form:', error)
      if (error instanceof Error) {
        alert(error.message || 'An error occurred while submitting the form. Please try again.')
      } else {
        alert('An error occurred while submitting the form. Please try again.')
      }
    }
  }

  const handleSearch = async () => {
    try {
      let searchRef
      if (searchQuery.startsWith('MOK-PFI-')) {
        searchRef = ref(database, `invoices/${searchQuery}`)
      } else {
        searchRef = query(ref(database, 'invoices'), orderByChild('billTo'), equalTo(searchQuery))
      }
      const snapshot = await get(searchRef)
      if (snapshot.exists()) {
        if (searchQuery.startsWith('MOK-PFI-')) {
          setSearchResults([snapshot.val()])
        } else {
          const results = snapshot.val()
          const resultArray = Object.keys(results).map(key => results[key])
          setSearchResults(resultArray)
        }
      } else {
        alert('Invoice not found.')
        setSearchResults(null)
      }
    } catch (error) {
      console.error('Error searching for invoice:', error)
      alert('An error occurred while searching for the invoice. Please try again.')
    }
  }

  // Move avatar source logic before the return statement and after loading check
  if (status === "loading") return null;

  const avatarSrc = session?.user?.image || lastUploadedImage || '';

  return (
    <div className={`min-h-screen ${
      theme === 'dark' ? 'bg-gray-900 text-gray-100' : 'bg-gray-50 text-gray-900'
    }`}>
      {/* Header */}
      <header className={`fixed top-0 left-0 w-full z-20 border-b ${
        theme === 'dark'
          ? 'border-gray-800 bg-gray-900/70'
          : 'border-gray-200 bg-white/70'
      } backdrop-blur-md`}>
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              onClick={() => router.push('/dashboard')}
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Back
            </Button>
            <h1 className="text-xl font-semibold">Wallet</h1>
          </div>
          <div className="flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-5 w-5" /> : <Moon className="h-5 w-5" />}
            </Button>
            <Avatar>
              <AvatarImage src={avatarSrc} alt={session?.user?.email || 'User'} />
              <AvatarFallback>{session?.user?.email?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
            </Avatar>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="container mx-auto px-4 py-24">
        {/* Invoice Generator Card */}
        <Card className={`mb-6 ${cardClassName}`}>
          <CardHeader>
            <CardTitle>Invoice Generator</CardTitle>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="billTo">Bill To</Label>
                  <Input
                    id="billTo"
                    placeholder="Enter bill to"
                    value={billTo}
                    onChange={(e) => setBillTo(e.target.value)}
                    className={inputClassName}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="shipTo">Ship To</Label>
                  <Input
                    id="shipTo"
                    placeholder="Enter ship to"
                    value={shipTo}
                    onChange={(e) => setShipTo(e.target.value)}
                    className={inputClassName}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceNumber">Proforma Invoice Number</Label>
                  <Input
                    id="invoiceNumber"
                    placeholder="Invoice number"
                    value={invoiceNumber}
                    readOnly
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="invoiceDate">Date</Label>
                  <Input
                    id="invoiceDate"
                    type="date"
                    value={invoiceDate}
                    onChange={(e) => setInvoiceDate(e.target.value)}
                    className={inputClassName}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="customerId">Customer ID</Label>
                  <Input
                    id="customerId"
                    placeholder="Enter customer ID"
                    value={customerId}
                    onChange={(e) => setCustomerId(e.target.value)}
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="description">Description of Goods</Label>
                  <Input
                    id="description"
                    placeholder="Enter description"
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    className={inputClassName}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="hsCode">HS Code</Label>
                  <Input
                    id="hsCode"
                    placeholder="HS Code"
                    value={hsCode}
                    readOnly
                    className={inputClassName}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="quantity">Quantity</Label>
                  <Input
                    id="quantity"
                    type="number"
                    step="0.001"
                    placeholder="Enter quantity"
                    value={quantity}
                    onChange={(e) => setQuantity(e.target.value)}
                    className={inputClassName}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unitPrice">Unit Price</Label>
                  <Input
                    id="unitPrice"
                    type="number"
                    step="0.001"
                    placeholder="Enter unit price"
                    value={unitPrice}
                    onChange={(e) => setUnitPrice(e.target.value)}
                    className={inputClassName}
                    required
                  />
                </div>
              </div>
              <Button 
                type="submit" 
                className={`w-full md:w-auto ${buttonClassName}`}
              >
                Generate Invoice
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Search Card */}
        <Card className={cardClassName}>
          <CardHeader>
            <CardTitle>Search Invoices</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-col md:flex-row space-y-2 md:space-y-0 md:space-x-2">
              <Input
                placeholder="Enter Invoice Number or Bill To"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className={inputClassName}
              />
              <Button 
                onClick={handleSearch} 
                className={buttonClassName}
              >
                <Search className="h-5 w-5" />
              </Button>
            </div>

            {/* Update search results styling */}
            {searchResults && searchResults.length > 0 && (
              <div className="mt-4">
                <h3 className={`text-lg font-bold ${
                  theme === 'dark' ? 'text-gray-100' : 'text-gray-900'
                }`}>
                  Invoice Details
                </h3>
                {searchResults.map((result, index) => (
                  <div key={index} className={`mb-4 p-4 border rounded-lg ${
                    theme === 'dark' 
                      ? 'border-gray-700 bg-gray-800/50' 
                      : 'border-gray-200 bg-white'
                  }`}>
                    <p><strong>Bill To:</strong> {result.billTo}</p>
                    <p><strong>Ship To:</strong> {result.shipTo}</p>
                    <p><strong>Invoice Number:</strong> {result.invoiceNumber}</p>
                    <p><strong>Date:</strong> {result.invoiceDate}</p>
                    <p><strong>Customer ID:</strong> {result.customerId}</p>
                    <p><strong>Description:</strong> {result.description}</p>
                    <p><strong>HS Code:</strong> {result.hsCode}</p>
                    <p><strong>Quantity:</strong> {result.quantity}</p>
                    <p><strong>Unit Price:</strong> {result.unitPrice}</p>
                    <p><strong>Amount:</strong> {result.amount}</p>
                    {result.pdfUrl && (
                      <Button
                        onClick={() => window.open(result.pdfUrl, '_blank')}
                        className={`mt-2 w-full md:w-auto ${buttonClassName}`}
                      >
                        Download Invoice
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </main>
    </div>
  )
}