// src/actions/offerCalculations.ts

export function calculateOfferAmount(assessedTotal: number): number {
  if (assessedTotal < 0) {
    return 0;
  }
  return assessedTotal * 0.5;
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
/**
 * Calculates the closing date, which is 30 calendar days from today.
 * @returns A new Date object for the closing date.
 */
export function calculateClosingDate(): Date {
  const today = new Date();
  const closingDate = new Date(today);
  closingDate.setDate(today.getDate() + 30);
  return closingDate;
}

export interface OfferDetails {
  offerPriceFormatted: string;
  emdAmountFormatted: string;
  closingDateFormatted: string;
  greetingName: string;
  offerExpirationDateFormatted: string;
  currentDateFormatted: string;
}

export function generateOfferDetails(assessedTotal: number, contactFullName?: string | null): OfferDetails {
  const offerAmount = calculateOfferAmount(assessedTotal);
  const emdAmount = calculateEMD(offerAmount);

  const today = new Date();
  const closingDate = calculateClosingDate(); // Uses today implicitly
  const offerExpirationDate = new Date(today);
  offerExpirationDate.setDate(today.getDate() + 3); // 72 hours = 3 days

  const greetingName = contactFullName ? contactFullName.split(' ')[0] : 'Valued Property Owner';

  // Formatting options
  const currencyFormatter = new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const dateFormatter = (date: Date) => {
    // Example: January 1, 2024. Adjust format as needed for PDF.
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  };

  return {
    offerPriceFormatted: currencyFormatter.format(offerAmount),
    emdAmountFormatted: currencyFormatter.format(emdAmount),
    closingDateFormatted: dateFormatter(closingDate),
    greetingName,
    offerExpirationDateFormatted: dateFormatter(offerExpirationDate),
    currentDateFormatted: dateFormatter(today),
  };
}
