import { Entry } from '@/types/entries'

// Add type definitions
type ProductRules = {
  min: number;
  max: number;
}

type DestinationRules = {
  pms: ProductRules;
  ago: ProductRules;
}

type Rules = {
  [key: string]: DestinationRules;
}

export const validateAllocation = {
  // Destination-specific validation
  destinationRules: (destination: string, quantity: number, product: string) => {
    const rules: Rules = {
      'ssd': {
        'pms': { min: 37000, max: 45000 },
        'ago': { min: 33000, max: 36000 }
      },
      'local': {
        'pms': { min: 5000, max: 45000 },
        'ago': { min: 5000, max: 36000 }
      }
    }
    
    const destinationRule = rules[destination.toLowerCase()]
    if (!destinationRule) return { valid: true }
    
    const productRule = destinationRule[product.toLowerCase() as keyof DestinationRules]
    if (!productRule) return { valid: true }
    
    return {
      valid: quantity >= productRule.min && quantity <= productRule.max,
      message: `${product.toUpperCase()} quantity for ${destination.toUpperCase()} must be between ${productRule.min.toLocaleString()} and ${productRule.max.toLocaleString()} liters`
    }
  },

  // Cross-reference validation
  crossReference: (entries: Entry[], permitEntry?: string) => {
    const issues = []
    
    // Check for duplicate allocations
    const allocations = new Set()
    entries.forEach(entry => {
      const key = `${entry.truckNumber}-${entry.product}-${entry.timestamp}`
      if (allocations.has(key)) {
        issues.push(`Duplicate allocation detected for truck ${entry.truckNumber}`)
      }
      allocations.add(key)
    })
    
    // Validate permit entry usage
    if (permitEntry) {
      const permitEntryData = entries.find(e => e.key === permitEntry)
      if (!permitEntryData) {
        issues.push('Permit entry not found')
      } else if (permitEntryData.destination.toLowerCase() !== 'ssd') {
        issues.push('Invalid permit entry destination')
      }
    }
    
    return {
      valid: issues.length === 0,
      issues
    }
  }
}
