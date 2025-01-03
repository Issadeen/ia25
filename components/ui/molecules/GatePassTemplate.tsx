import { useRef } from 'react';

interface GatePassTemplateProps {
  loadingOrderNo: string;
  deliverTo: string;
  mokNo: string;
  dateOfRelease: string;
  timeOfRelease: string;
  driversName: string;
  idNo: string;
  truckRegistration: string;
  loadingDepot: string;
  productDetails: {
    productName: string;
    volumeOrdered: string;
    volumeLoaded: string;
    truckCompartment: string;
  }[];
  preparedBy: string;
  authorizedBy: string;
  // Add optional props
  orderNo?: string;
  destination?: string;
  truck?: string;
  product?: string;
  quantity?: string;
  at20?: string;
  isLoaded?: string;
}

export const GatePassTemplate: React.FC<GatePassTemplateProps> = ({
  loadingOrderNo,
  deliverTo,
  mokNo,
  dateOfRelease,
  timeOfRelease,
  driversName,
  idNo,
  truckRegistration,
  loadingDepot,
  productDetails,
  preparedBy,
  authorizedBy,
  // Other props are not needed since we have them directly
}) => {
  // Function to format date
  const formatDate = (date: string) => {
    const options: Intl.DateTimeFormatOptions = { day: '2-digit', month: 'short', year: 'numeric' };
    return new Date(date).toLocaleDateString('en-GB', options).replace(/ /g, '-');
  };

  // Add defensive checks for all props
  const safeDeliverTo = deliverTo?.toString().trim() || 'N/A';
  const safeTruckRegistration = truckRegistration?.toString().trim() || 'N/A';
  const safeLoadingDepot = loadingDepot?.toString().trim() || 'N/A';

  return (
    <div className="bg-white text-[#49539c] p-4 m-2 relative font-sans overflow-hidden border-2 border-[#49539c] rounded-lg shadow-lg" style={{ minWidth: '1100px', aspectRatio: '1.414/1' }}>
      {/* Header */}
      <div className="flex justify-between items-start mb-4 border-b pb-2">
        <div className="w-1/3">
          <h3 className="font-bold text-sm mb-2">Admin office:</h3>
          <p className="text-xs leading-tight">
            Baniyas Complex, Block B,<br />
            Office 804 Nasser Square,<br />
            Dubai, United Arab Emirates
          </p>
        </div>
        <div className="w-1/3 flex justify-center">
          <img src="/images/mok-logo.png" alt="MOK Logo" width={120} height={120} className="mb-2" crossOrigin="anonymous" /> {/* Replaced next/image */}
        </div>
        <div className="w-1/3 text-right">
          <h3 className="font-bold text-sm mb-1">MOK PETRO ENERGY LIMITED</h3>
          <p className="text-xs leading-tight">
            Jubilee Insurance House, 3rd Floor<br />
            Wabera Street, P.O. Box 35139-00100<br />
            Nairobi-Kenya<br />
            Tel: +254 20 20 20 645<br />
            Email: Customercare-kenya@mokpetroenergy.com
          </p>
        </div>
      </div>

      {/* Gate Pass Title */}
      <h1 className="text-2xl font-bold text-center text-[#49539c] mb-4 relative after:content-[''] after:block after:w-32 after:h-1 after:bg-[#49539c] after:mx-auto after:mt-2">GATE PASS</h1>

      {/* Main Content */}
      <div className="mb-4 px-4 bg-gray-50 p-3 rounded-lg">
        <div className="grid grid-cols-3 gap-4 mb-4">
          <div>
            <p className="mb-3 flex items-center border border-[#49539c] p-2 rounded">
              <span className="font-bold min-w-[140px]">Loading Order #:</span>
              <span className="px-2">{loadingOrderNo}</span>
            </p>
            <p className="flex items-center border border-[#49539c] p-2 rounded">
              <span className="font-bold min-w-[140px]">Deliver to:</span>
              <span className="px-2">{safeDeliverTo}</span>
            </p>
          </div>
          <div className="text-center">
            <p className="mb-3 flex items-center justify-center">
              <span className="font-bold">Please release products (s)</span>
            </p>
            <p className="flex items-center justify-center">
              <span className="font-bold">as per advice below</span>
            </p>
            <p className="flex items-center justify-center">
              <span className="font-bold min-w-[140px]">Date of Release:</span>
              <span className="px-2">{formatDate(dateOfRelease)}</span>
            </p>
            <p className="flex items-center justify-center">
              <span className="font-bold min-w-[140px]">Truck Registration:</span>
              <span className="px-2">{safeTruckRegistration}</span>
            </p>
          </div>
          <div className="text-right">
            <p className="mb-3 flex items-center justify-end">
              <span className="font-bold min-w-[140px]">No: MOK:</span>
              <span className="px-2">{mokNo}</span>
            </p>
            <p className="flex items-center justify-end">
              <span className="font-bold min-w-[140px]">Time of Release:</span>
              <span className="px-2">{timeOfRelease}</span>
            </p>
            <p className="flex items-center justify-end">
              <span className="font-bold min-w-[140px]">ID No.:</span>
              <span className="px-2">{idNo}</span>
            </p>
            <p className="flex items-center justify-end">
              <span className="font-bold min-w-[140px]">Loading Depot:</span>
              <span className="px-2">{safeLoadingDepot}</span>
            </p>
          </div>
        </div>
      </div>

      {/* Table */}
      <table className="w-full border-collapse mb-4 bg-white shadow-sm rounded-lg overflow-hidden text-sm">
        <thead>
          <tr className="bg-[#49539c] text-white">
            <th className="border border-[#49539c] p-3 text-left">Product Name</th>
            <th className="border border-[#49539c] p-3 text-left">Volume ordered @ obs Temp</th>
            <th className="border border-[#49539c] p-3 text-left">Volume loaded @ 20 deg</th>
            <th className="border border-[#49539c] p-3 text-left">Truck Compartment</th>
          </tr>
        </thead>
        <tbody>
          {productDetails.map((product, index) => (
            <tr key={index} className="hover:bg-gray-50">
              <td className="border border-[#49539c] p-3">{product.productName}</td>
              <td className="border border-[#49539c] p-3">{product.volumeOrdered}</td>
              <td className="border border-[#49539c] p-3">{product.volumeLoaded}</td>
              <td className="border border-[#49539c] p-3">{product.truckCompartment}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {/* Footer with Signatures */}
      <div className="flex justify-between px-4 bg-gray-50 p-3 rounded-lg">
        <div className="w-1/2">
          <p className="mb-1"><span className="font-bold">Prepared by:</span></p>
          <p className="mb-1"><span className="font-bold">Name:</span> <span>{preparedBy}</span></p>
          <div className="relative h-20">
            <img 
              src="/images/prepared_by_signature.png" 
              alt="Prepared By Signature" 
              className="absolute top-0 left-0 w-32 h-16 object-contain"
            />
          </div>
        </div>
        <div className="w-1/2 text-right">
          <p className="mb-1"><span className="font-bold">Authorized by:</span></p>
          <p className="mb-1"><span className="font-bold">Name:</span> <span>{authorizedBy}</span></p>
          <div className="relative h-20">
            <img 
              src="/images/authorized_by_signature.png" 
              alt="Authorized By Signature" 
              className="absolute top-0 right-0 w-32 h-16 object-contain"
            />
          </div>
        </div>
      </div>

      {/* Stamp and Watermark */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
        <img 
          src="/images/stamp.png" 
          alt="Stamp" 
          className="w-32 h-32 object-contain opacity-60" // Increased size
        />
      </div>
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <img 
          src="/images/mok-seal.png" 
          alt="MOK Seal" 
          className="w-96 h-96 object-contain opacity-10"
        />
      </div>
    </div>
  )
}