import { Entry } from '@/types/entries'

export const smartAllocation = {
  // Suggest optimal entries based on historical patterns
  suggestEntries: (availableEntries: Entry[], requiredQuantity: number) => {
    return {
      // Sort entries by optimal criteria (FIFO, permit requirements, etc.)
      optimizedEntries: availableEntries
        .sort((a, b) => {
          // Prioritize entries close to required quantity
          const aDiff = Math.abs(a.remainingQuantity - requiredQuantity)
          const bDiff = Math.abs(b.remainingQuantity - requiredQuantity)
          
          // If quantities are similar, use FIFO
          if (Math.abs(aDiff - bDiff) < 1000) {
            return a.timestamp - b.timestamp
          }
          
          return aDiff - bDiff
        })
        .filter(entry => entry.remainingQuantity > 0),
      
      // Provide allocation strategy
      strategy: {
        recommendedSplit: calculateOptimalSplit(availableEntries, requiredQuantity),
        reason: generateRecommendationReason(availableEntries, requiredQuantity)
      }
    }
  },

  // Predict potential issues
  predictIssues: (entries: Entry[], requiredQuantity: number) => {
    const issues = []
    const totalAvailable = entries.reduce((sum, entry) => sum + entry.remainingQuantity, 0)
    
    if (totalAvailable < requiredQuantity) {
      issues.push({
        type: 'INSUFFICIENT_QUANTITY',
        message: `Total available (${totalAvailable.toLocaleString()}) is less than required (${requiredQuantity.toLocaleString()})`,
        severity: 'high'
      })
    }
    
    // Add other predictions...
    return issues
  }
}

// Helper functions
function calculateOptimalSplit(entries: Entry[], required: number) {
  // Implementation of optimal split calculation
  // This could use various algorithms like greedy, dynamic programming, etc.
  return entries
    .filter(e => e.remainingQuantity > 0)
    .map(entry => ({
      entry: entry.number,
      suggested: Math.min(entry.remainingQuantity, required)
    }))
}

function generateRecommendationReason(entries: Entry[], required: number) {
  // Generate human-readable explanation for the recommendation
  const totalAvailable = entries.reduce((sum, e) => sum + e.remainingQuantity, 0)
  
  if (totalAvailable === required) {
    return "Exact match found for required quantity"
  }
  
  return "Recommendation based on FIFO and optimal quantity matching"
}
