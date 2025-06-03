// src/offerCalculations.ts

/**
 * Calculates the offer amount based on the wholesale value.
 * Offer Amount = Wholesale Value * 0.5
 * @param wholesaleValue - The wholesale value of the property.
 * @returns The calculated offer amount.
 */
export function calculateOfferAmount(wholesaleValue: number): number {
  if (wholesaleValue < 0) {
    return 0;
  }
  return wholesaleValue * 0.5;
}

/**
 * Calculates the Earnest Money Deposit (EMD).
 * EMD = Offer Amount * 0.01
 * @param offerAmount - The calculated offer amount.
 * @returns The calculated EMD.
 */
export function calculateEMD(offerAmount: number): number {
  if (offerAmount < 0) {
    return 0;
  }
  return Math.round((offerAmount * 0.01) * 100) / 100;
}

/**
 * Adds a specified number of business days to a date.
 * @param date - The starting date.
 * @param businessDays - The number of business days to add.
 * @returns A new Date object representing the future date.
 */
export function addBusinessDays(date: Date, businessDays: number): Date {
  const newDate = new Date(date);
  let daysAdded = 0;
  while (daysAdded < businessDays) {
    newDate.setDate(newDate.getDate() + 1);
    const dayOfWeek = newDate.getDay(); // 0 (Sunday) to 6 (Saturday)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      daysAdded++;
    }
  }
  return newDate;
}

/**
 * Calculates the closing date, which is 14 business days from today.
 * @returns A new Date object for the closing date.
 */
export function calculateClosingDate(): Date {
  const today = new Date();
  return addBusinessDays(today, 14);
}

export interface OfferDetails {
  offerAmount: number;
  emdAmount: number;
  closingDate: Date;
  closingDateFormatted: string;
}

export function generateOfferDetails(wholesaleValue: number): OfferDetails {
  const offerAmount = calculateOfferAmount(wholesaleValue);
  const emdAmount = calculateEMD(offerAmount);
  const closingDate = calculateClosingDate();
  const closingDateFormatted = closingDate.toLocaleDateString('en-CA');

  return {
    offerAmount,
    emdAmount,
    closingDate,
    closingDateFormatted,
  };
}
