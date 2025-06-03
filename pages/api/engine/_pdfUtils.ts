import fs from 'fs/promises'; // For reading template files and font
import path from 'path';
import { PDFDocument, StandardFonts, rgb, PageSizes } from 'pdf-lib'; // Ensure imports at top
import fontkit from '@pdf-lib/fontkit'; // Added fontkit import

// Define paths (ensure these are correct for your serverless environment)
const templateDir = path.join(process.cwd(), 'pages', 'api', 'eli5-engine', 'templates');
const BLANK_LETTERHEAD_PDF_FILE = path.join(templateDir, 'blank-letterhead.pdf');
const ALEX_BRUSH_FONT_FILE = path.join(templateDir, 'AlexBrush-Regular.ttf');

// Helper function for drawing wrapped text (CRITICAL DEBUG version)
// Assuming PDFPage, PDFFont, RGB types are compatible with 'any' or specific pdf-lib types
function drawWrappedText( 
    page: any, // PDFPage,
    text: string,
    x: number,
    y: number,
    font: any, // PDFFont,
    fontSize: number,
    maxWidth: number,
    lineHeight: number,
    color: any // RGB e.g. { red: 0, green: 0, blue: 0 }
): number { 
    console.log(`DEBUG_WRAP: drawWrappedText called. Initial Y: ${y}, MaxWidth: ${maxWidth}, FontSize: ${fontSize}, LineHeight: ${lineHeight}, Text snippet: "${text.substring(0, 50)}..."`, 'Color:', color);

    const words = text.split(' ');
    let currentLine = '';
    let currentY = y;

    for (const word of words) {
        let testLine = currentLine === '' ? word : currentLine + ' ' + word;
        const testLineWidth = font.widthOfTextAtSize(testLine, fontSize);

        if (testLineWidth <= maxWidth) {
            currentLine = testLine;
        } else {
            // Draw the current line (before adding the word that makes it too long)
            if (currentLine !== '') { // Avoid drawing empty lines if a single word is too long initially
                console.log(`DEBUG_WRAP: Drawing line at Y: ${currentY}, Line: "${currentLine}"`);
                page.drawText(currentLine, {
                    x: x,
                    y: currentY,
                    font: font,
                    size: fontSize,
                    color: color,
                });
                currentY -= lineHeight; // Move Y for the next line
            }
            currentLine = word; // Start the new line with the current word

            // Handle case where the word itself is longer than maxWidth
            // The new algorithm implicitly handles this by placing the long word on a new line.
            // If that single word is still too long, it will be drawn as is (and overflow).
            // This differs from the previous explicit "long word" handling.
            const currentWordWidth = font.widthOfTextAtSize(currentLine, fontSize);
            if (currentWordWidth > maxWidth) {
                console.log(`DEBUG_WRAP: Drawing line at Y: ${currentY}, Line (single word > maxWidth): "${currentLine}"`);
                page.drawText(currentLine, { // Draw the long word on its own line
                    x: x,
                    y: currentY,
                    font: font,
                    size: fontSize,
                    color: color,
                });
                currentY -= lineHeight;
                currentLine = ''; // Reset currentLine as the long word has been drawn
            }
        }
    }

    // Draw the last remaining line
    if (currentLine !== '') {
        console.log(`DEBUG_WRAP: Drawing line at Y: ${currentY}, Line (final): "${currentLine}"`);
        page.drawText(currentLine, {
            x: x,
            y: currentY,
            font: font,
            size: fontSize,
            color: color,
        });
        currentY -= lineHeight; // Decrement Y for consistency, returning position for *next* element.
    }
    
    return currentY; // Return the Y position after the last line drawn (plus one line height)
}


export const generateLoiPdf = async (
  personalizationData: any,
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
    contentPdfDoc.registerFontkit(fontkit); // Register fontkit
    const page = contentPdfDoc.addPage(PageSizes.A4); // Using standard A4 size
    const { width, height } = page.getSize();

    // Load Fonts
    const helveticaFont = await contentPdfDoc.embedFont(StandardFonts.Helvetica);
    const helveticaBoldFont = await contentPdfDoc.embedFont(StandardFonts.HelveticaBold);
    const timesRomanFont = await contentPdfDoc.embedFont(StandardFonts.TimesRoman);
    const timesRomanItalicFont = await contentPdfDoc.embedFont(StandardFonts.TimesRomanItalic);
    
    let alexBrushFont;
    try {
      const alexBrushFontBytes = await fs.readFile(ALEX_BRUSH_FONT_FILE);
      alexBrushFont = await contentPdfDoc.embedFont(alexBrushFontBytes);
    } catch (fontError) {
      console.error("Failed to load Alex Brush font, using Helvetica-Bold as fallback for signature:", fontError);
      alexBrushFont = helveticaBoldFont; // Fallback
    }

    // 2. Draw LOI Content Programmatically
    // Define drawing parameters
    const pageMargin = 50; // Updated page margin
    let currentY = height - pageMargin; // Start from top, below margin
    const textX = pageMargin;
    const textMaxWidth = width - 2 * pageMargin; // Updated textMaxWidth
    
    const baseFontSize = 14; 
    const titleFontSize = 20; 
    const subtitleFontSize = 16;
    const signatureFontSize = 28; 
    const disclaimerFontSize = 12;

    const bodyLineHeight = baseFontSize * 1.2;
    const disclaimerLineHeight = disclaimerFontSize * 1.2;
    const titleColor = rgb(0,0,0);
    const bodyColor = rgb(0,0,0);
    const subtitleColor = rgb(0.1, 0.1, 0.1);
    const signatureColor = rgb(0.05, 0.2, 0.5);
    const disclaimerColor = rgb(0.3,0.3,0.3);

    // --- Title ---
    page.drawText("LETTER OF INTENT TO PURCHASE REAL ESTATE", { // Main Title - Assuming this is the one for increased spacing
      x: textX, // Or centered: (width - helveticaBoldFont.widthOfTextAtSize("LETTER OF INTENT", titleFontSize)) / 2
      y: currentY,
      font: helveticaBoldFont,
      size: titleFontSize,
      color: titleColor,
    });
    currentY -= titleFontSize * 1.5;
    currentY -= bodyLineHeight * 0.75; // Added extra spacing (0.75 of a body line) after title

    // --- Property Address Subtitle ---
    const streetAddress = personalizationData.property_address || "N/A Street Address";
    page.drawText(streetAddress, {
      x: textX,
      y: currentY,
      font: helveticaFont,
      size: subtitleFontSize,
      color: subtitleColor,
    });
    currentY -= subtitleFontSize * 1.2; // Line height for subtitle

    const cityStateZip = `${personalizationData.property_city || "N/A City"}, ${personalizationData.property_state || "N/A State"} ${personalizationData.property_postal_code || "N/A Zip"}`;
    page.drawText(cityStateZip, {
      x: textX,
      y: currentY,
      font: helveticaFont,
      size: subtitleFontSize,
      color: subtitleColor,
    });
    currentY -= subtitleFontSize * 1.5; // Space after address block
    
    // --- Date ---
    const dateText = personalizationData.current_date || "N/A Date";
    page.drawText(dateText, {
        x: width - pageMargin - helveticaFont.widthOfTextAtSize(dateText, baseFontSize), // Align right
        y: currentY,
        font: helveticaFont,
        size: baseFontSize,
        color: bodyColor
    });
    currentY -= bodyLineHeight * 2; // Space after date

    // --- Salutation ---
    page.drawText(`Dear ${personalizationData.greeting_name || "Sir/Madam"},`, {
      x: textX,
      y: currentY,
      font: helveticaFont,
      size: baseFontSize,
      color: bodyColor,
    });
    currentY -= bodyLineHeight * 2; // Extra space after salutation

    // --- Body Paragraph 1 (Introductory) ---
    const introParagraph = `We are pleased to submit this Letter of Intent ("LOI") to purchase the property located at ${personalizationData.property_address || "N/A Property Address"} (the "Property") under the terms and conditions set forth herein. This LOI is an expression of our serious interest in acquiring the Property.`;
    currentY = drawWrappedText(page, introParagraph, textX, currentY, timesRomanFont, baseFontSize, textMaxWidth, bodyLineHeight, bodyColor ); // Updated call
    currentY -= bodyLineHeight; // Space after paragraph

    // --- Offer Summary (Simplified Key-Value) ---
    const offerDetails = [
      { label: "Purchase Price:", value: personalizationData.offer_price || "N/A" },
      { label: "Earnest Money Deposit (EMD):", value: personalizationData.emd_amount || "N/A" },
      { label: "Closing Date:", value: personalizationData.closing_date || "N/A" },
      { label: "Title Company:", value: personalizationData.title_company || "N/A" },
      { label: "Buyer’s Assignment Consideration:", value: "$10" }, 
    ];
    
    const labelX = textX + 10; // Use textX (which is pageMargin) or add a small indent
    const valueX = pageMargin + 220; // New fixed X for all values, increased from previous relative offset

    for (const detail of offerDetails) {
      page.drawText(detail.label, { 
        x: labelX, 
        y: currentY, 
        font: timesRomanFont, // Using timesRomanFont for labels
        size: baseFontSize, 
        color: bodyColor 
      });
      page.drawText(detail.value, { 
        x: valueX, // Use the new fixed X for values
        y: currentY, 
        font: helveticaBoldFont, // Keep helveticaBoldFont for values as per original
        size: baseFontSize, 
        color: bodyColor 
      });
      currentY -= bodyLineHeight;
    }
    currentY -= bodyLineHeight; // Space after offer details

    // --- 72-Hour Validity Paragraph (Placeholder) ---
    // Replace with actual data from personalizationData if available, e.g., personalizationData.validity_paragraph
    const validityText = personalizationData.validity_paragraph || "This offer is valid for a period of seventy-two (72) hours from the date and time of submission. Should this offer not be accepted within this timeframe, it shall be deemed automatically withdrawn.";
    currentY = drawWrappedText(page, validityText, textX, currentY, timesRomanFont, baseFontSize, textMaxWidth, bodyLineHeight, bodyColor ); // Updated call
    currentY -= bodyLineHeight; // Space after paragraph

    // --- Closing Paragraph (Simplified) ---
    const closingParagraph = "We look forward to the possibility of working with you on this transaction and are excited about the prospect of acquiring this Property. Please reply back to us if you wish to move forward or have questions.";
    currentY = drawWrappedText(page, closingParagraph, textX, currentY, timesRomanFont, baseFontSize, textMaxWidth, bodyLineHeight, bodyColor ); // Updated call
    currentY -= bodyLineHeight * 2; // Space before "Warm regards,"

    // --- "Warm regards," ---
    page.drawText("Warm regards,", {
      x: textX,
      y: currentY,
      font: helveticaFont,
      size: baseFontSize,
      color: bodyColor,
    });
    currentY -= bodyLineHeight * 2; // Space for signature

    // --- Sender Signature Block ---
    page.drawText(personalizationData.sender_name || "N/A Sender Name", {
      x: textX,
      y: currentY,
      font: alexBrushFont, // Use AlexBrush or fallback
      size: signatureFontSize,
      color: signatureColor, 
    });
    currentY -= signatureFontSize * 0.8; // Adjust based on font visual size

    page.drawText(personalizationData.sender_name || "N/A Sender Name", {
      x: textX,
      y: currentY,
      font: helveticaFont,
      size: baseFontSize,
      color: bodyColor,
    });
    currentY -= bodyLineHeight;
    page.drawText(personalizationData.sender_title || "N/A Sender Title", {
      x: textX,
      y: currentY,
      font: helveticaFont,
      size: baseFontSize,
      color: bodyColor,
    });
    currentY -= bodyLineHeight;
    page.drawText(personalizationData.company_name || "N/A Company Name", {
      x: textX,
      y: currentY,
      font: helveticaFont,
      size: baseFontSize,
      color: bodyColor,
    });
    currentY -= bodyLineHeight * 3; // More space before disclaimer

    // --- Disclaimer Footer (Simplified) ---
    const disclaimer = "This Letter of Intent is non-binding and is intended solely as a basis for further discussion and negotiation. No contractual obligations will arise between the parties unless and until a definitive written agreement is executed by both parties.";
    // For disclaimer, it's often better to position from bottom if possible, or ensure enough space
    // For now, continuing the flow, but ensure currentY does not go off-page.
    // A check: if currentY < pageMargin + (disclaimerLineHeight * ~3 lines), then reposition.
    if (currentY < pageMargin + (disclaimerLineHeight * 4)) { // Estimate 3 lines for disclaimer + padding
        currentY = pageMargin + (disclaimerLineHeight * 4); // Place it at the bottom with some margin
    }
    
    currentY = drawWrappedText(page, disclaimer, textX, currentY, timesRomanItalicFont, disclaimerFontSize, textMaxWidth, disclaimerLineHeight, disclaimerColor ); // Updated call

    // ... all page.drawText() and other drawing calls on 'page' from contentPdfDoc are complete ...

     const contentPdfBytes = await contentPdfDoc.save();
     console.log('DEBUG_PDFUTILS: contentPdfBytes type:', typeof contentPdfBytes, 'instanceof Uint8Array:', contentPdfBytes instanceof Uint8Array, 'length:', contentPdfBytes?.length);

     if (!(contentPdfBytes instanceof Uint8Array) || contentPdfBytes.length === 0) {
         console.error('DEBUG_PDFUTILS: contentPdfBytes is invalid or empty. PDF content generation might have failed silently.');
         throw new Error('Generated content PDF bytes are invalid or empty.');
     }

     const BLANK_LETTERHEAD_PDF_FILE = path.join(templateDir, 'blank-letterhead.pdf'); // Ensure templateDir is correctly defined
     const letterheadPdfBytes = await fs.readFile(BLANK_LETTERHEAD_PDF_FILE);

     const letterheadPdfDoc = await PDFDocument.load(letterheadPdfBytes);
     const contentPdfToEmbed = await PDFDocument.load(contentPdfBytes); // This is the dynamically generated content
     
     console.log('DEBUG_PDFUTILS: contentPdfToEmbed (dynamic content) type:', typeof contentPdfToEmbed, 'pageCount:', contentPdfToEmbed?.getPageCount());

     const pagesToEmbed = contentPdfToEmbed.getPages();
     console.log('DEBUG_PDFUTILS: contentPdfToEmbed pages array length:', pagesToEmbed.length);

     if (pagesToEmbed.length === 0) {
         console.error('DEBUG_PDFUTILS: No pages found in dynamically generated content PDF (contentPdfToEmbed).');
         throw new Error('No pages found in the generated content PDF to embed.');
     }
     // const firstPageFromContent = pagesToEmbed[0]; // This line can be removed as firstPageFromContent is no longer used directly here
     // console.log('DEBUG_PDFUTILS: firstPageFromContent type:', typeof firstPageFromContent); // This log can also be removed

     // Embed the first page (index 0) from the contentPdfToEmbed document
     const [embeddedContentPage] = await letterheadPdfDoc.embedPdf(contentPdfToEmbed, [0]); 
     
     console.log('DEBUG_PDFUTILS: embeddedContentPage type:', typeof embeddedContentPage, 'width:', embeddedContentPage.width, 'height:', embeddedContentPage.height);

     const firstPageOfLetterhead = letterheadPdfDoc.getPages()[0];
     if (!firstPageOfLetterhead) {
         console.error('DEBUG_PDFUTILS: Blank letterhead PDF does not contain any pages.');
         throw new Error('Blank letterhead PDF does not contain any pages.');
     }
     
     // Draw the EMBEDDED page onto the first page of the letterhead
     firstPageOfLetterhead.drawPage(embeddedContentPage, { // Use the 'embeddedContentPage' here
         x: 0, 
         y: 0, 
         width: embeddedContentPage.width, 
         height: embeddedContentPage.height,
     });

     const mergedPdfBytes = await letterheadPdfDoc.save();
     console.log('DEBUG_PDFUTILS: Merged PDF saved, byte length:', mergedPdfBytes.length);
     return Buffer.from(mergedPdfBytes);

  } catch (error: any) {
    console.error(`Error in generateLoiPdf (pdf-lib) for lead ${leadId}: ${error.message}`, error.stack);
    return null;
  }
};
