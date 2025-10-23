/**
 * Credit Validation Module
 * Ensures data integrity for credit operations
 */

export interface ValidationResult {
  valid: boolean;
  error?: string;
}

/**
 * Validate credit amount
 * - Must be positive
 * - Must be finite
 * - Must not exceed maximum reasonable value
 */
export function validateCreditAmount(amount: any): ValidationResult {
  // Type check
  if (typeof amount !== 'number') {
    return { valid: false, error: 'Credit amount must be a number' };
  }

  // Negative check
  if (amount < 0) {
    return { valid: false, error: 'Credit amount cannot be negative' };
  }

  // Finite check
  if (!Number.isFinite(amount)) {
    return { valid: false, error: 'Credit amount must be finite' };
  }

  // Zero is technically valid but unusual
  if (amount === 0) {
    return { valid: false, error: 'Credit amount cannot be zero' };
  }

  // Maximum check (1 million dollars is a reasonable upper limit)
  if (amount > 1_000_000) {
    return { valid: false, error: 'Credit amount exceeds maximum allowed ($1,000,000)' };
  }

  // Precision check (no more than 2 decimal places)
  const decimalPlaces = (amount.toString().split('.')[1] || '').length;
  if (decimalPlaces > 2) {
    return { valid: false, error: 'Credit amount cannot have more than 2 decimal places' };
  }

  return { valid: true };
}

/**
 * Validate credit record structure
 */
export function validateCreditRecord(credit: any): ValidationResult {
  if (!credit || typeof credit !== 'object') {
    return { valid: false, error: 'Credit must be an object' };
  }

  // Check required fields
  if (!credit.id || typeof credit.id !== 'string') {
    return { valid: false, error: 'Credit ID is required and must be string' };
  }

  if (!credit.truckId || typeof credit.truckId !== 'string') {
    return { valid: false, error: 'Truck ID is required' };
  }

  if (!credit.truckNumber || typeof credit.truckNumber !== 'string') {
    return { valid: false, error: 'Truck number is required' };
  }

  if (!credit.amount && credit.amount !== 0) {
    return { valid: false, error: 'Credit amount is required' };
  }

  // Validate amount
  const amountValidation = validateCreditAmount(credit.amount);
  if (!amountValidation.valid) {
    return amountValidation;
  }

  // Check status
  const validStatuses = ['available', 'used', 'expired', 'reverted'];
  if (!credit.status || !validStatuses.includes(credit.status)) {
    return { valid: false, error: `Status must be one of: ${validStatuses.join(', ')}` };
  }

  // Check source
  const validSources = ['overpayment_retroactive', 'overpayment_realtime', 'manual', 'transfer'];
  if (!credit.source || !validSources.includes(credit.source)) {
    return { valid: false, error: `Source must be one of: ${validSources.join(', ')}` };
  }

  // Check timestamp format (ISO string)
  if (!credit.timestamp || typeof credit.timestamp !== 'string') {
    return { valid: false, error: 'Timestamp is required and must be ISO string' };
  }

  try {
    new Date(credit.timestamp);
  } catch (e) {
    return { valid: false, error: 'Timestamp must be valid ISO date string' };
  }

  return { valid: true };
}

/**
 * Validate credit array (for batch operations)
 */
export function validateCreditArray(credits: any[]): ValidationResult {
  if (!Array.isArray(credits)) {
    return { valid: false, error: 'Credits must be an array' };
  }

  if (credits.length === 0) {
    return { valid: false, error: 'Credits array cannot be empty' };
  }

  if (credits.length > 1000) {
    return { valid: false, error: 'Cannot process more than 1000 credits at once' };
  }

  for (let i = 0; i < credits.length; i++) {
    const validation = validateCreditRecord(credits[i]);
    if (!validation.valid) {
      return { valid: false, error: `Credit at index ${i}: ${validation.error}` };
    }
  }

  return { valid: true };
}

/**
 * Validate owner parameter
 */
export function validateOwner(owner: any): ValidationResult {
  if (!owner || typeof owner !== 'string') {
    return { valid: false, error: 'Owner must be a non-empty string' };
  }

  if (owner.length < 3) {
    return { valid: false, error: 'Owner must be at least 3 characters' };
  }

  if (owner.length > 100) {
    return { valid: false, error: 'Owner cannot exceed 100 characters' };
  }

  return { valid: true };
}

/**
 * Validate credit ID format
 */
export function validateCreditId(creditId: any): ValidationResult {
  if (!creditId || typeof creditId !== 'string') {
    return { valid: false, error: 'Credit ID must be a non-empty string' };
  }

  if (!creditId.startsWith('credit_')) {
    return { valid: false, error: 'Invalid credit ID format' };
  }

  return { valid: true };
}

/**
 * Validate timestamp is not in the future
 */
export function validateTimestamp(timestamp: any): ValidationResult {
  if (typeof timestamp !== 'string') {
    return { valid: false, error: 'Timestamp must be a string' };
  }

  try {
    const date = new Date(timestamp);
    if (isNaN(date.getTime())) {
      return { valid: false, error: 'Invalid date format' };
    }

    if (date > new Date()) {
      return { valid: false, error: 'Timestamp cannot be in the future' };
    }

    return { valid: true };
  } catch (e) {
    return { valid: false, error: 'Invalid timestamp format' };
  }
}

/**
 * Validate mark-credits-used request
 */
export function validateMarkCreditsUsedRequest(data: any): ValidationResult {
  const { owner, creditIds } = data;

  const ownerValidation = validateOwner(owner);
  if (!ownerValidation.valid) {
    return ownerValidation;
  }

  if (!Array.isArray(creditIds)) {
    return { valid: false, error: 'creditIds must be an array' };
  }

  if (creditIds.length === 0) {
    return { valid: false, error: 'creditIds cannot be empty' };
  }

  if (creditIds.length > 100) {
    return { valid: false, error: 'Cannot mark more than 100 credits at once' };
  }

  for (let i = 0; i < creditIds.length; i++) {
    const validation = validateCreditId(creditIds[i]);
    if (!validation.valid) {
      return { valid: false, error: `Credit ID at index ${i}: ${validation.error}` };
    }
  }

  return { valid: true };
}
