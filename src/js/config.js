/**
 * IRIS - Public Configuration
 *
 * This file uses Vite environment variables.
 * Values are injected at build time from the .env file.
 */

export const CONFIG = {
  /** Daily message quota shown in the UI */
  dailyMessageLimit: Number(import.meta.env.VITE_DAILY_MESSAGE_LIMIT) || 25,

  /** Path to the auto-loaded PDF, relative to the server root */
  pdfPath: import.meta.env.VITE_PDF_PATH || 'source.pdf',

  /** Display name for the auto-loaded document */
  pdfDisplayName: import.meta.env.VITE_PDF_DISPLAY_NAME || 'NMS BOOK'
};
