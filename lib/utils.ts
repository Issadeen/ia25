import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatNumber(value?: number) {
  if (typeof value !== 'number' || isNaN(value)) {
    return '0.00'
  }
  return Number(value.toFixed(2)).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2
  })
}

export const toFixed2 = (num: number) => Number(Math.round(num * 100) / 100)

// Add other shared utility functions here
