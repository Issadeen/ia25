"use client"

import { useState, useRef, useEffect } from 'react'
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { GatePassTemplate } from '@/components/ui/molecules/GatePassTemplate'
import jsPDF from 'jspdf'
import html2canvas from 'html2canvas'
import { database } from "@/lib/firebase"
import { ref, get, set } from "firebase/database"
import { useTheme } from 'next-themes' // Add this import
import { toast } from "@/components/ui/use-toast" // Update this import

export function GatePassForm() {
  const { theme } = useTheme() // Add theme hook
  const [formData, setFormData] = useState({
    loadingOrderNo: '',
    deliverTo: '',
    mokNo: '',
    dateOfRelease: '',
    timeOfRelease: '',
    driversName: '',
    idNo: '',
    truckRegistration: '',
    loadingDepot: '',
    productDetails: [
      { productName: '', volumeOrdered: '', volumeLoaded: '', truckCompartment: '' }
    ],
    preparedBy: '',
    authorizedBy: ''
  })

  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  const [passNumber, setPassNumber] = useState<string>("")

  const templateRef = useRef<HTMLDivElement>(null)

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const { name, value } = e.target
    if (['mokNo', 'preparedBy', 'authorizedBy'].includes(name)) {
      return
    }
    setFormData(prevState => ({
      ...prevState,
      [name]: value
    }))
  }

  const handleProductChange = (index: number, field: string, value: string) => {
    setFormData(prevState => {
      const newProductDetails = [...prevState.productDetails]
      newProductDetails[index] = { ...newProductDetails[index], [field]: value }
      return { ...prevState, productDetails: newProductDetails }
    })
  }

  const addProductRow = () => {
    setFormData(prevState => ({
      ...prevState,
      productDetails: [...prevState.productDetails, { productName: '', volumeOrdered: '', volumeLoaded: '', truckCompartment: '' }]
    }))
  }

  const validateForm = () => {
    const newErrors: { [key: string]: string } = {};
    if (!formData.loadingOrderNo) newErrors.loadingOrderNo = "Loading Order # is required";
    if (!formData.deliverTo) newErrors.deliverTo = "Deliver to is required";
    if (!formData.mokNo) newErrors.mokNo = "No: MOK is required";
    if (!formData.dateOfRelease) newErrors.dateOfRelease = "Date of Release is required";
    if (!formData.timeOfRelease) newErrors.timeOfRelease = "Time of Release is required";
    if (!formData.driversName) newErrors.driversName = "Driver's Name is required";
    if (!formData.idNo) newErrors.idNo = "ID No. is required";
    if (!formData.truckRegistration) newErrors.truckRegistration = "Truck Registration is required";
    if (!formData.loadingDepot) newErrors.loadingDepot = "Loading Depot is required";
    if (!formData.preparedBy) newErrors.preparedBy = "Prepared By is required";
    if (!formData.authorizedBy) newErrors.authorizedBy = "Authorized By is required";
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const getLastPassNumber = async () => {
    const snapshot = await get(ref(database, "gatePasses/lastPassNumber"))
    return snapshot.exists() ? snapshot.val() : 192 // Default to 192 if not found
  }

  const incrementPassNumber = async () => {
    const lastNumber = await getLastPassNumber()
    const newNumber = lastNumber + 1
    await set(ref(database, "gatePasses/lastPassNumber"), newNumber)
    return newNumber
  }

  const checkDuplicateTruck = async (truckNumber: string) => {
    const gatePassesRef = ref(database, 'gatePasses');
    const snapshot = await get(gatePassesRef);
    if (snapshot.exists()) {
      const gatePasses = snapshot.val();
      for (const passNumber in gatePasses) {
        const pass = gatePasses[passNumber];
        const passTruckReg = pass.truckRegistration?.toString().toLowerCase().trim() || '';
        if (
          passTruckReg &&
          passTruckReg === truckNumber.toLowerCase().trim()
        ) {
          // Found duplicate
          return {
            passNumber,
            previousDestination: pass.destination,
            timestamp: pass.timestamp,
          };
        }
      }
    }
    return null; // No duplicate found
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    try {
      // Ensure truckRegistration is defined and is a string
      const truckRegistration = formData.truckRegistration?.toString().trim() || '';
      if (!truckRegistration) {
        toast({
          title: "Error",
          description: "Truck Registration is required.",
          variant: "destructive",
        });
        return;
      }

      // Check for duplicate truck first
      const duplicateInfo = await checkDuplicateTruck(truckRegistration);
      
      // Generate or get the pass number
      let currentPassNumber;
      if (duplicateInfo) {
        const timeAgo = Math.round((Date.now() - duplicateInfo.timestamp) / (1000 * 60));
        const shouldProceed = window.confirm(
          `Warning: This truck was gatepassed ${timeAgo} minutes ago\n` +
          `Previous Gate Pass: ${duplicateInfo.passNumber}\n` +
          `Previous Destination: ${duplicateInfo.previousDestination}\n\n` +
          `Do you want to proceed?`
        );
        
        if (!shouldProceed) return;
        
        currentPassNumber = duplicateInfo.passNumber;
      } else {
        const newNumber = await incrementPassNumber();
        currentPassNumber = `MOK-GP-${newNumber}`;
      }

      // Update state and create gate pass data
      setPassNumber(currentPassNumber);
      
      const gatePassData = {
        ...formData,
        passNumber: currentPassNumber,
        timestamp: Date.now(),
      };

      // Save to Firebase
      await set(ref(database, `gatePasses/${currentPassNumber}`), gatePassData);

      // Generate PDF
      const input = templateRef.current;
      if (!input) {
        throw new Error('Template element not found');
      }

      input.style.display = 'block';

      const canvas = await html2canvas(input, {
        scale: 3,
        useCORS: true,
        scrollY: -window.scrollY,
        allowTaint: true,
        logging: true,
        imageTimeout: 0,
      });

      input.style.display = 'none';

      const imgWidth = canvas.width;
      const imgHeight = canvas.height;
      const pdfWidth = 841.89;
      const pdfHeight = 595.28;
      const ratio = Math.min(pdfWidth / imgWidth, pdfHeight / imgHeight);
      const width = imgWidth * ratio;
      const height = imgHeight * ratio;

      const pdf = new jsPDF('landscape', 'pt', 'a4');

      pdf.addImage(
        canvas.toDataURL('image/png', 1.0),
        'PNG',
        (pdfWidth - width) / 2,
        (pdfHeight - height) / 2,
        width,
        height
      );

      pdf.save(`GatePass_${formData.loadingOrderNo || 'draft'}.pdf`);

      toast({
        title: "Success",
        description: `Gate Pass ${currentPassNumber} generated successfully.`,
      });

    } catch (error) {
      console.error('PDF Generation Error:', error);
      toast({
        title: "Error",
        description: "Failed to generate PDF. Please check console for details.",
        variant: "destructive",
      });
    }
  };

  useEffect(() => {
    const params = new URLSearchParams(window.location.search)
    const orderData = {
      loadingOrderNo: params.get('orderNo') || '',
      deliverTo: params.get('destination') || '',
      mokNo: '', // This will be auto-filled
      truckRegistration: params.get('truck') || '',
      loadingDepot: params.get('depot') || '',
      dateOfRelease: new Date().toISOString().split('T')[0], // Today's date
      timeOfRelease: new Date().toLocaleTimeString('en-GB', { 
        hour: '2-digit', 
        minute: '2-digit'
      }), // Current time
      productDetails: [{
        productName: params.get('product') || '',
        volumeOrdered: params.get('quantity') || '',
        volumeLoaded: params.get('at20') || '',
        truckCompartment: '1'
      }],
      preparedBy: 'ZAINAB AHMED', // Default prepared by
      authorizedBy: 'IBRAHIM MOHAMED ATHMAN' // Default authorized by
    }

    // Get the last GP number and increment it
    const getNextGPNumber = async () => {
      const lastNumber = await getLastPassNumber()
      const nextNumber = lastNumber + 1
      const gpNumber = `MOK-GP-${nextNumber}`
      setFormData(prev => ({
        ...prev,
        ...orderData,
        mokNo: gpNumber
      }))
    }

    if (orderData.loadingOrderNo) {
      getNextGPNumber()
    }
  }, [])

  return (
    <div className={`flex flex-col gap-8 ${theme === 'dark' ? 'dark' : ''}`}>
      <form onSubmit={handleSubmit} className="space-y-4 w-full">
        <fieldset className="space-y-4 w-full">
          <legend className="text-lg font-semibold text-[#49539c]">General Information</legend>
          <div>
            <Label htmlFor="loadingOrderNo">Loading Order #</Label>
            <Input id="loadingOrderNo" name="loadingOrderNo" value={formData.loadingOrderNo} onChange={handleInputChange} required 
              className={`
                w-full px-3 py-2 rounded-md border 
                dark:bg-gray-800 dark:border-gray-700 dark:text-white
                light:bg-white light:border-gray-300 light:text-gray-900
                focus:ring-2 focus:ring-blue-500 focus:border-transparent
                ${errors.loadingOrderNo ? 'border-red-500' : ''}
              `}
            />
            {errors.loadingOrderNo && <p className="text-red-500 text-xs">{errors.loadingOrderNo}</p>}
          </div>
          <div>
            <Label htmlFor="deliverTo">Deliver to</Label>
            <Input id="deliverTo" name="deliverTo" value={formData.deliverTo} onChange={handleInputChange} required 
              className={`
                w-full px-3 py-2 rounded-md border 
                dark:bg-gray-800 dark:border-gray-700 dark:text-white
                light:bg-white light:border-gray-300 light:text-gray-900
                focus:ring-2 focus:ring-blue-500 focus:border-transparent
                ${errors.deliverTo ? 'border-red-500' : ''}
              `}
            />
            {errors.deliverTo && <p className="text-red-500 text-xs">{errors.deliverTo}</p>}
          </div>
          <div>
            <Label htmlFor="mokNo">No: MOK</Label>
            <Input 
              id="mokNo" 
              name="mokNo" 
              value={formData.mokNo} 
              onChange={handleInputChange} 
              required 
              readOnly
              className={`
                w-full px-3 py-2 rounded-md border 
                dark:bg-gray-800 dark:border-gray-700 dark:text-white
                light:bg.white light:border-gray-300 light:text-gray-900
                focus:ring-2 focus:ring-blue-500 focus:border-transparent
                ${errors.mokNo ? 'border-red-500' : ''}
                bg-opacity-50 cursor-not-allowed
              `}
            />
            {errors.mokNo && <p className="text-red-500 text-xs">{errors.mokNo}</p>}
          </div>
          <div className="flex gap-4">
            <div className="w-1/2">
              <Label htmlFor="dateOfRelease">Date of Release</Label>
              <Input id="dateOfRelease" name="dateOfRelease" type="date" value={formData.dateOfRelease} onChange={handleInputChange} required 
                className={`
                  w-full px-3 py-2 rounded-md border 
                  dark:bg-gray-800 dark:border-gray-700 dark:text-white
                  light:bg-white light:border-gray-300 light:text-gray-900
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  ${errors.dateOfRelease ? 'border-red-500' : ''}
                `}
              />
              {errors.dateOfRelease && <p className="text-red-500 text-xs">{errors.dateOfRelease}</p>}
            </div>
            <div className="w-1/2">
              <Label htmlFor="timeOfRelease">Time of Release</Label>
              <Input id="timeOfRelease" name="timeOfRelease" type="time" value={formData.timeOfRelease} onChange={handleInputChange} required 
                className={`
                  w-full px-3 py-2 rounded-md border 
                  dark:bg-gray-800 dark:border-gray-700 dark:text-white
                  light:bg-white light:border-gray-300 light:text-gray-900
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  ${errors.timeOfRelease ? 'border-red-500' : ''}
                `}
              />
              {errors.timeOfRelease && <p className="text-red-500 text-xs">{errors.timeOfRelease}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="driversName">Driver's Name</Label>
            <Input id="driversName" name="driversName" value={formData.driversName} onChange={handleInputChange} required 
              className={`
                w-full px-3 py-2 rounded-md border 
                dark:bg-gray-800 dark:border-gray-700 dark:text-white
                light:bg-white light:border-gray-300 light:text-gray-900
                focus:ring-2 focus:ring-blue-500 focus:border-transparent
                ${errors.driversName ? 'border-red-500' : ''}
              `}
            />
            {errors.driversName && <p className="text-red-500 text-xs">{errors.driversName}</p>}
          </div>
          <div className="flex gap-4">
            <div className="w-1/2">
              <Label htmlFor="idNo">ID No.</Label>
              <Input id="idNo" name="idNo" value={formData.idNo} onChange={handleInputChange} required 
                className={`
                  w-full px-3 py-2 rounded-md border 
                  dark:bg-gray-800 dark:border-gray-700 dark:text-white
                  light:bg.white light:border-gray-300 light:text-gray-900
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  ${errors.idNo ? 'border-red-500' : ''}
                `}
              />
              {errors.idNo && <p className="text-red-500 text-xs">{errors.idNo}</p>}
            </div>
            <div className="w-1/2">
              <Label htmlFor="truckRegistration">Truck Registration</Label>
              <Input id="truckRegistration" name="truckRegistration" value={formData.truckRegistration} onChange={handleInputChange} required 
                className={`
                  w-full px-3 py-2 rounded-md border 
                  dark:bg-gray-800 dark:border-gray-700 dark:text-white
                  light:bg.white light:border-gray-300 light:text-gray-900
                  focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  ${errors.truckRegistration ? 'border-red-500' : ''}
                `}
              />
              {errors.truckRegistration && <p className="text-red-500 text-xs">{errors.truckRegistration}</p>}
            </div>
          </div>
          <div>
            <Label htmlFor="loadingDepot">Loading Depot</Label>
            <Input id="loadingDepot" name="loadingDepot" value={formData.loadingDepot} onChange={handleInputChange} required 
              className={`
                w-full px-3 py-2 rounded-md border 
                dark:bg-gray-800 dark:border-gray-700 dark:text-white
                light:bg.white light:border-gray-300 light:text-gray-900
                focus:ring-2 focus:ring-blue-500 focus:border-transparent
                ${errors.loadingDepot ? 'border-red-500' : ''}
              `}
            />
            {errors.loadingDepot && <p className="text-red-500 text-xs">{errors.loadingDepot}</p>}
          </div>
        </fieldset>

        <fieldset className="space-y-4 w-full">
          <legend className="text-lg font-semibold text-[#49539c]">Product Details & Authorization</legend>
          <div>
            <Label>Product Details</Label>
            {formData.productDetails.map((product, index) => (
              <div key={index} className="grid grid-cols-4 gap-2 mt-2">
                <Input placeholder="Product Name" value={product.productName} onChange={(e) => handleProductChange(index, 'productName', e.target.value)} 
                  className={`
                    w-full px-3 py-2 rounded-md border 
                    dark:bg-gray-800 dark:border-gray-700 dark:text-white
                    light:bg.white light:border-gray-300 light:text-gray-900
                    focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  `}
                />
                <Input placeholder="Volume Ordered" value={product.volumeOrdered} onChange={(e) => handleProductChange(index, 'volumeOrdered', e.target.value)} 
                  className={`
                    w-full px-3 py-2 rounded-md border 
                    dark:bg-gray-800 dark:border-gray-700 dark:text-white
                    light:bg.white light:border-gray-300 light:text-gray-900
                    focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  `}
                />
                <Input placeholder="Volume Loaded" value={product.volumeLoaded} onChange={(e) => handleProductChange(index, 'volumeLoaded', e.target.value)} 
                  className={`
                    w-full px-3 py-2 rounded-md border 
                    dark:bg-gray-800 dark:border-gray-700 dark:text-white
                    light:bg.white light:border-gray-300 light:text-gray-900
                    focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  `}
                />
                <Input placeholder="Truck Compartment" value={product.truckCompartment} onChange={(e) => handleProductChange(index, 'truckCompartment', e.target.value)} 
                  className={`
                    w-full px-3 py-2 rounded-md border 
                    dark:bg-gray-800 dark:border-gray-700 dark:text-white
                    light:bg.white light:border-gray-300 light:text-gray-900
                    focus:ring-2 focus:ring-blue-500 focus:border-transparent
                  `}
                />
              </div>
            ))}
            <Button type="button" onClick={addProductRow} className="mt-2">Add Product</Button>
          </div>

          <div>
            <Label htmlFor="preparedBy">Prepared By</Label>
            <Input 
              id="preparedBy" 
              name="preparedBy" 
              value={formData.preparedBy} 
              onChange={handleInputChange} 
              required 
              readOnly
              className={`
                w-full px-3 py-2 rounded-md border 
                dark:bg-gray-800 dark:border-gray-700 dark:text-white
                light:bg-white light:border-gray-300 light:text-gray-900
                focus:ring-2 focus:ring-blue-500 focus:border-transparent
                ${errors.preparedBy ? 'border-red-500' : ''}
                bg-opacity-50 cursor-not-allowed
              `}
            />
            {errors.preparedBy && <p className="text-red-500 text-xs">{errors.preparedBy}</p>}
          </div>
          <div>
            <Label htmlFor="authorizedBy">Authorized By</Label>
            <Input 
              id="authorizedBy" 
              name="authorizedBy" 
              value={formData.authorizedBy} 
              onChange={handleInputChange} 
              required 
              readOnly
              className={`
                w-full px-3 py-2 rounded-md border 
                dark:bg-gray-800 dark:border-gray-700 dark:text-white
                light:bg.white light:border-gray-300 light:text-gray-900
                focus:ring-2 focus:ring-blue-500 focus:border-transparent
                ${errors.authorizedBy ? 'border-red-500' : ''}
                bg-opacity-50 cursor-not-allowed
              `}
            />
            {errors.authorizedBy && <p className="text-red-500 text-xs">{errors.authorizedBy}</p>}
          </div>
          
          <Button type="submit">Generate Gate Pass</Button>
        </fieldset>
      </form>

      <div 
        ref={templateRef}
        className="bg-white w-[1100px]"
        style={{ 
          display: 'none',
          aspectRatio: '1.414/1',
          margin: '0 auto'
        }}
      >
        <GatePassTemplate {...formData} />
      </div>
    </div>
  )
}