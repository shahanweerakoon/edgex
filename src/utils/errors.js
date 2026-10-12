/**
 * Custom Error hierarchy for Facebook Lead Collector.
 * Provides user-facing friendly messages, technical details, and error recovery hints.
 */

export class ExtensionError extends Error {
  /**
   * @param {string} message - Technical error message
   * @param {string} userMessage - Friendly message shown to end users
   * @param {string} code - Machine-readable error code
   * @param {object} [details={}] - Additional diagnostic details
   * @param {string} [recoveryHint=''] - Actionable suggestion for the user
   */
  constructor(message, userMessage, code = 'UNKNOWN_ERROR', details = {}, recoveryHint = '') {
    super(message);
    this.name = this.constructor.name;
    this.userMessage = userMessage || message;
    this.code = code;
    this.details = details;
    this.recoveryHint = recoveryHint;
  }
}

export class AuthError extends ExtensionError {
  constructor(message, userMessage, code = 'AUTH_ERROR', details = {}, recoveryHint = '') {
    super(
      message,
      userMessage || 'Google account authentication failed.',
      code,
      details,
      recoveryHint || 'Please check your Google OAuth credentials in Settings and sign in again.'
    );
  }
}

export class SheetsError extends ExtensionError {
  constructor(message, userMessage, code = 'SHEETS_ERROR', details = {}, recoveryHint = '') {
    super(
      message,
      userMessage || 'Google Sheets operation failed.',
      code,
      details,
      recoveryHint || 'Verify your spreadsheet permissions and make sure the spreadsheet ID is valid.'
    );
  }
}

export class ValidationError extends ExtensionError {
  constructor(message, userMessage, code = 'VALIDATION_ERROR', details = {}, recoveryHint = '') {
    super(
      message,
      userMessage || 'The entered lead data is invalid.',
      code,
      details,
      recoveryHint || 'Please correct the highlighted fields before saving.'
    );
  }
}

export class DuplicateError extends ExtensionError {
  constructor(message, existingLead, duplicateKey, details = {}) {
    super(
      message,
      `A lead matching "${duplicateKey}" already exists in the spreadsheet.`,
      'DUPLICATE_LEAD',
      { ...details, existingLead, duplicateKey },
      'You can update the existing record, save as a new lead, or skip.'
    );
    this.existingLead = existingLead;
    this.duplicateKey = duplicateKey;
  }
}

export class PartialSaveError extends ExtensionError {
  constructor(message, { categorySaved = false, masterSaved = false, leadData = null, originalError = null } = {}) {
    super(
      message,
      'Lead was partially saved to one sheet, but the second write failed.',
      'PARTIAL_SAVE_ERROR',
      { categorySaved, masterSaved, leadData, originalError: originalError?.message },
      'Click "Retry Synchronization" to ensure records match between All Leads and the category tab.'
    );
    this.categorySaved = categorySaved;
    this.masterSaved = masterSaved;
    this.leadData = leadData;
    this.originalError = originalError;
  }
}

export class NetworkError extends ExtensionError {
  constructor(message, details = {}) {
    super(
      message,
      'Network connection failed. Please check your internet connection.',
      'NETWORK_ERROR',
      details,
      'Ensure your device is connected to the internet and try again.'
    );
  }
}
