// src/services/index.ts
// Export all services from a central file to improve imports

export { generateLoiPdf, type PersonalizationData } from './pdfService';
export { sendEmail, initializeGmailService } from './gmailService';
