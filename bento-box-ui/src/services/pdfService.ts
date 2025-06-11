// src/services/pdfService.ts
import fs from 'fs/promises';
import path from 'path';

import fontkit from '@pdf-lib/fontkit';
import { PDFDocument, StandardFonts, rgb, PageSizes, PDFFont, PDFPage } from 'pdf-lib';

// Define paths for templates and assets
const templateDir = path.join(process.cwd(), 'src', 'app', 'api', 'engine', 'templates');
const BLANK_LETTERHEAD_PDF_FILE = path.join(templateDir, 'blank-letterhead.pdf');
const ALEX_BRUSH_FONT_FILE = path.join(templateDir, 'AlexBrush-Regular.ttf');

// Helper function for drawing wrapped text
function drawWrappedText(
    page: PDFPage,
    text: string,
    x: number,
    y: number,
    font: PDFFont,
    fontSize: number,
    maxWidth: number,
    lineHeight: number,
    color: ReturnType<typeof rgb>
): number {
    const words = text.split(' ');
    let currentLine = '';
    let currentY = y;

    for (const word of words) {
        const testLine = currentLine === '' ? word : `${currentLine} ${word}`;
        const testLineWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testLineWidth <= maxWidth) {
            currentLine = testLine;
        } else {
            if (currentLine !== '') {
                page.drawText(currentLine, { x, y: currentY, font, size: fontSize, color });
                currentY -= lineHeight;
            }
            currentLine = word;
            // Handle single word longer than maxWidth
            const currentWordWidth = font.widthOfTextAtSize(currentLine, fontSize);
            if (currentWordWidth > maxWidth) {
                 page.drawText(currentLine, { x, y: currentY, font, size: fontSize, color });
                 currentY -= lineHeight;
                 currentLine = '';
            }
        }
    }
    if (currentLine !== '') {
        page.drawText(currentLine, { x, y: currentY, font, size: fontSize, color });
        currentY -= lineHeight;
    }
    return currentY;
}

/**
 * Generates a Letter of Intent PDF for real estate purchase
 * @param personalizationData - Contains all personalization data for the letter
 * @param leadId - ID of the lead for logging purposes
 * @param contactEmail - Email of the contact for logging purposes
 * @returns Buffer containing the PDF or null if generation fails
 */
/**
 * Type definition for personalization data to avoid unsafe 'any' usage
 */
export interface PersonalizationData {
  property_address?: string;
  property_city?: string;
  property_state?: string;
  property_postal_code?: string;
  current_date?: string; // Formatted: January 1, 2024
  greeting_name?: string; // First name or default
  offer_price?: string; // Formatted: $100,000.00
  emd_amount?: string; // Formatted: $1,000.00
  closing_date?: string; // Formatted: January 31, 2024 (current_date + 30 days)
  sender_title?: string; // Static: "Acquisitions Specialist"
  company_name?: string; // Static: "True Soul Partners LLC"
  // greeting_name is derived (e.g., first name) from the lead's full contact_name.
  // It's used for the salutation (e.g., "Dear John,").
  // The full contact_name could be added as a separate field if needed elsewhere in the PDF.
  [key: string]: string | undefined; // Keep for flexibility if other dynamic fields arise
}

export const generateLoiPdf = async (
  personalizationData: PersonalizationData,
  leadId: string,
  contactEmail: string
): Promise<Buffer | null> => {
  console.log('DEBUG_PDFUTILS_ENTRY: generateLoiPdf function started (pdf-lib version).');
  console.log('DEBUG_PDFUTILS_DATA_RECEIVED: Raw personalizationData:', JSON.stringify(personalizationData));
  console.log('DEBUG_PDFUTILS_CONTACT_NAME_RECEIVED: contact_name type:', typeof personalizationData?.contact_name, 'value:', JSON.stringify(personalizationData?.contact_name));
  console.log(`Generating LOI PDF for lead ID: ${leadId}, contact: ${contactEmail} (pdf-lib version)`);

  try {
    // 1. Create New PDF Document for Content
    const contentPdfDoc = await PDFDocument.create();
    contentPdfDoc.registerFontkit(fontkit);
    const page = contentPdfDoc.addPage(PageSizes.A4); // Or PageSizes.Letter
    const { width, height } = page.getSize();

    // Load Fonts
    const helveticaBoldFont = await contentPdfDoc.embedFont(StandardFonts.HelveticaBold);
    const timesRomanFont = await contentPdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesRomanItalicFont = await contentPdfDoc.embedFont(StandardFonts.TimesRomanItalic);

    let alexBrushFont;
    try {
      const alexBrushFontBytes = await fs.readFile(ALEX_BRUSH_FONT_FILE);
      alexBrushFont = await contentPdfDoc.embedFont(alexBrushFontBytes);
    } catch (fontError) {
      console.warn("Failed to load Alex Brush font, using Helvetica-Bold as fallback for signature:", fontError);
      alexBrushFont = helveticaBoldFont; // Fallback
    }

    // Drawing parameters
    const pageMargin = 50;
    let currentY = height - pageMargin;
    const textX = pageMargin;
    const textMaxWidth = width - 2 * pageMargin;

    const baseFontSize = 14;
    const titleFontSize = 20;
    const subtitleFontSize = 18;
    const signatureFontSize = 28;
    const disclaimerFontSize = 12;

    const bodyLineHeight = baseFontSize * 1.5;
    const disclaimerLineHeight = disclaimerFontSize * 1.2;
    const titleColor = rgb(0,0,0);
    const bodyColor = rgb(0,0,0);
    const subtitleColor = rgb(0.1, 0.1, 0.1);
    const signatureColor = rgb(0.05, 0.2, 0.5);
    const disclaimerColor = rgb(0.3,0.3,0.3);

    // --- Title ---
    const titleText = "LETTER OF INTENT TO PURCHASE REAL ESTATE";
    const titleWidth = helveticaBoldFont.widthOfTextAtSize(titleText, titleFontSize);
    const centeredX = (width - titleWidth) / 2; // Calculate center position

    page.drawText(titleText, { // Main Title
      x: centeredX, // Centered position
      y: currentY,
      font: helveticaBoldFont,
      size: titleFontSize,
      color: titleColor,
    });
    currentY -= titleFontSize * 1.5;
    currentY -= bodyLineHeight * 0.25; // Added extra spacing (0.75 of a body line) after title

    // --- Property Address Subtitle ---
    // Use type-safe access to personalization data
    const streetAddressText = personalizationData.property_address || "N/A Street Address";
    const cityText = personalizationData.property_city || "N/A City";
    const stateText = personalizationData.property_state || "N/A State";
    const postalCodeText = personalizationData.property_postal_code || "N/A Zip";

    const fullAddressLine = `${streetAddressText}, ${cityText}, ${stateText} ${postalCodeText}`;

    // Calculate width of the full address line to center it
    const addressWidth = timesRomanFont.widthOfTextAtSize(fullAddressLine, subtitleFontSize);
    const centeredAddressX = (page.getWidth() - addressWidth) / 2;

    page.drawText(fullAddressLine, {
      x: centeredAddressX, // Use centered X
      y: currentY,
      font: helveticaBoldFont,
      size: subtitleFontSize,
      color: subtitleColor,
    });
    currentY -= subtitleFontSize * 2; // Space after address block (adjust as needed for single line)

    // --- Date ---
    const dateText = personalizationData.current_date || "";
    page.drawText(dateText, {
        x: width - pageMargin - timesRomanFont.widthOfTextAtSize(dateText, baseFontSize), // Align right
        y: currentY,
        font: timesRomanFont,
        size: baseFontSize,
        color: bodyColor
    });
    currentY -= bodyLineHeight * 3; // Space after date

    // --- Salutation ---
    page.drawText(`Dear ${personalizationData.greeting_name || "Sir/Madam"},`, {
      x: textX,
      y: currentY,
      font: timesRomanFont,
      size: baseFontSize,
      color: bodyColor,
    });
    currentY -= bodyLineHeight * 1.5; // Extra space after salutation

    // --- Body Paragraph 1 (Introductory) ---
    const introParagraph = `We are pleased to submit this Letter of Intent ("LOI") to purchase the property located at ${personalizationData.property_address || "N/A Property Address"} (the "Property") under the terms and conditions set forth herein. This LOI is an expression of our serious interest in acquiring the Property.`;
    currentY = drawWrappedText(page, introParagraph, textX, currentY, timesRomanFont, baseFontSize, textMaxWidth, bodyLineHeight, bodyColor ); // Updated call
    currentY -= bodyLineHeight * 0.5; // Space after paragraph

    // --- Offer Summary (Simplified Key-Value) ---
    const offerDetails = [
      { label: "Purchase Price:", value: personalizationData.offer_price || "N/A" },
      { label: "Closing Date:", value: personalizationData.closing_date_preference || "To be mutually agreed upon" },
      { label: "Inspection Period:", value: personalizationData.inspection_period || "14 days from acceptance" },
      { label: "Offer Expiration:", value: personalizationData.offer_expiration_date || "3 days from receipt" }
    ];

    for (const detail of offerDetails) {
      page.drawText(detail.label, {
        x: textX + 20,
        y: currentY,
        font: helveticaBoldFont,
        size: baseFontSize,
        color: bodyColor,
      });

      page.drawText(detail.value, {
        x: textX + 170, // Offset for value
        y: currentY,
        font: timesRomanFont,
        size: baseFontSize,
        color: bodyColor,
      });

      currentY -= bodyLineHeight;
    }
    currentY -= bodyLineHeight * 0.5; // Extra half-line after details

    // --- Body Paragraph 2 (Conditions) ---
    const conditionsParagraph = "This Letter of Intent is subject to the preparation and execution of a definitive Purchase Agreement containing terms and conditions satisfactory to both parties. This LOI is non-binding except for the confidentiality provisions herein.";
    currentY = drawWrappedText(page, conditionsParagraph, textX, currentY, timesRomanFont, baseFontSize, textMaxWidth, bodyLineHeight, bodyColor );
    currentY -= bodyLineHeight * 0.5;

    // --- Body Paragraph 3 (Confidentiality) ---
    const confidentialityParagraph = "The parties agree to keep the terms of this LOI and all discussions related to the potential purchase of the Property strictly confidential.";
    currentY = drawWrappedText(page, confidentialityParagraph, textX, currentY, timesRomanFont, baseFontSize, textMaxWidth, bodyLineHeight, bodyColor );
    currentY -= bodyLineHeight * 0.5;

    // --- Closing ---
    const closingParagraph = "We look forward to your favorable response and the opportunity to move forward with this transaction.";
    currentY = drawWrappedText(page, closingParagraph, textX, currentY, timesRomanFont, baseFontSize, textMaxWidth, bodyLineHeight, bodyColor );
    currentY -= bodyLineHeight * 1.5;

    // --- Signature Block ---
    page.drawText("Sincerely,", {
      x: textX,
      y: currentY,
      font: timesRomanFont,
      size: baseFontSize,
      color: bodyColor,
    });
    currentY -= bodyLineHeight * 1.5;

    // Signature (using Alex Brush font or fallback)
    const signerName = personalizationData.sender_name || "Authorized Representative";
    page.drawText(signerName, {
      x: textX,
      y: currentY,
      font: alexBrushFont,
      size: signatureFontSize,
      color: signatureColor,
    });
    currentY -= (bodyLineHeight + 3); // Added 5 more pixels of spacing

    // Sender's Title
    page.drawText("Acquisitions Director", {
      x: textX,
      y: currentY,
      font: timesRomanFont,
      size: baseFontSize,
      color: bodyColor,
    });
    currentY -= bodyLineHeight;

    // Company Name
    page.drawText("True Soul Partners LLC", {
      x: textX,
      y: currentY,
      font: timesRomanFont,
      size: baseFontSize,
      color: bodyColor,
    });
    currentY -= bodyLineHeight;

    // --- Disclaimer at Bottom ---
    currentY = height - (height - 12); // Reset to near bottom of page
    const disclaimerText = "No binding obligation exists until a definitive Purchase Agreement has been executed by both parties.";
    currentY = drawWrappedText(page, disclaimerText, textX, currentY, timesRomanItalicFont, disclaimerFontSize, textMaxWidth, disclaimerLineHeight, disclaimerColor );

    // 3. Merge with Letterhead (if available)
    let finalPdfDoc;
    try {
      const letterheadBytes = await fs.readFile(BLANK_LETTERHEAD_PDF_FILE);
      const letterheadPdfDoc = await PDFDocument.load(letterheadBytes);

      // Create a new document to merge content onto letterhead
      finalPdfDoc = await PDFDocument.create();

      // Copy the letterhead page
      const [letterheadPage] = await finalPdfDoc.copyPages(letterheadPdfDoc, [0]);
      const letterheadPageInFinal = finalPdfDoc.addPage(letterheadPage);

      // Copy the content page
      const [contentPage] = await finalPdfDoc.copyPages(contentPdfDoc, [0]);

      // Draw the content onto the letterhead page
      // Note: We need to convert the contentPage to an embedded page first
      // This is a workaround for the TypeScript error with drawPage
      const { width: lWidth, height: lHeight } = letterheadPageInFinal.getSize();
      const contentPageEmbedded = await finalPdfDoc.embedPage(contentPage);
      letterheadPageInFinal.drawPage(contentPageEmbedded, {
        x: 0,
        y: 0,
        width: lWidth,
        height: lHeight,
      });

      console.log('DEBUG_PDFUTILS: Successfully merged content with letterhead');
    } catch (letterheadError) {
      console.error('Error loading or merging letterhead, using content-only PDF:', letterheadError);
      finalPdfDoc = contentPdfDoc; // Fallback to content-only if letterhead fails
    }

    // 4. Save to Buffer
    const pdfBytes = await finalPdfDoc.save();
    return Buffer.from(pdfBytes);

  } catch (error) {
    console.error('Error generating LOI PDF:', error);
    return null;
  }
};