/**
 * Google Sheets REST API v4 Client.
 * Handles spreadsheet reading, appending, updating, batch updates, and structured error responses.
 */

import { SheetsError, AuthError, NetworkError } from '../utils/errors.js';

const SHEETS_API_BASE = 'https://sheets.googleapis.com/v4/spreadsheets';

/**
 * Extracts a spreadsheet ID from a Google Sheets URL or raw ID string.
 *
 * @param {string} input - Full URL or raw ID
 * @returns {string} - Clean Spreadsheet ID
 */
export function extractSpreadsheetId(input) {
  if (!input || typeof input !== 'string') return '';
  const trimmed = input.trim();

  // Pattern for Google Sheets URL: /spreadsheets/d/([a-zA-Z0-9-_]+)
  const urlMatch = trimmed.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch && urlMatch[1]) {
    return urlMatch[1];
  }

  // If input matches direct ID pattern (alphanumeric, dashes, underscores, length >= 25)
  if (/^[a-zA-Z0-9-_]{25,}$/.test(trimmed)) {
    return trimmed;
  }

  return trimmed;
}

/**
 * Internal request wrapper for Google Sheets API with error mapping.
 *
 * @param {string} endpoint - Full API URL
 * @param {object} options - Fetch options (method, headers, body)
 * @returns {Promise<any>}
 */
async function sheetsFetch(endpoint, options = {}) {
  let res;
  try {
    res = await fetch(endpoint, options);
  } catch (err) {
    throw new NetworkError(`Network connection to Google Sheets failed: ${err.message}`, {
      originalError: err.message
    });
  }

  if (res.ok) {
    if (res.status === 204) return null;
    return await res.json();
  }

  // Parse Google API error details
  let errorData = null;
  try {
    errorData = await res.json();
  } catch {
    // Non-JSON response
  }

  const googleMessage = errorData?.error?.message || res.statusText || 'Unknown API error';
  const status = res.status;

  if (status === 401) {
    throw new AuthError(
      `Google authentication expired or invalid: ${googleMessage}`,
      'Your Google sign-in session has expired. Please sign in again.',
      'TOKEN_EXPIRED',
      { status, googleMessage },
      'Click "Connect Google Account" in Settings to renew your session.'
    );
  }

  if (status === 403) {
    if (googleMessage.includes('has not been used') || googleMessage.includes('API has not been enabled')) {
      throw new SheetsError(
        `Google Sheets API is not enabled: ${googleMessage}`,
        'The Google Sheets API is not enabled in your Google Cloud Project.',
        'SHEETS_API_NOT_ENABLED',
        { status, googleMessage },
        'Visit Google Cloud Console, select your project, and enable "Google Sheets API".'
      );
    }

    throw new SheetsError(
      `Spreadsheet permission denied: ${googleMessage}`,
      'You do not have edit permission for this spreadsheet or access was denied.',
      'PERMISSION_DENIED',
      { status, googleMessage },
      'Check spreadsheet sharing permissions in Google Drive and ensure your account has Editor access.'
    );
  }

  if (status === 404) {
    throw new SheetsError(
      `Spreadsheet not found: ${googleMessage}`,
      'Spreadsheet not found. Please check the Spreadsheet ID or URL.',
      'SPREADSHEET_NOT_FOUND',
      { status, googleMessage },
      'Verify the spreadsheet URL or ID in Settings.'
    );
  }

  if (status === 429) {
    throw new SheetsError(
      `Google API quota exceeded: ${googleMessage}`,
      'Google Sheets API rate limit reached. Please wait a moment and try again.',
      'QUOTA_EXCEEDED',
      { status, googleMessage },
      'Wait a minute before retrying your request.'
    );
  }

  throw new SheetsError(
    `Google Sheets API error (${status}): ${googleMessage}`,
    `Spreadsheet operation failed: ${googleMessage}`,
    'API_ERROR',
    { status, googleMessage }
  );
}

/**
 * Retrieves metadata for a spreadsheet, including list of sheet tabs and properties.
 *
 * @param {string} spreadsheetId
 * @param {string} token
 * @returns {Promise<object>}
 */
export async function getSpreadsheet(spreadsheetId, token) {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const url = `${SHEETS_API_BASE}/${cleanId}?fields=spreadsheetId,properties.title,sheets(properties(sheetId,title,index,gridProperties))`;
  return await sheetsFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
}

/**
 * Reads a range of cell values from a spreadsheet.
 *
 * @param {string} spreadsheetId
 * @param {string} range - e.g. "All Leads!A:M" or "'Software'!A1:M100"
 * @param {string} token
 * @returns {Promise<any[][]>} - Array of row arrays
 */
export async function getValues(spreadsheetId, range, token) {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const encodedRange = encodeURIComponent(range);
  const url = `${SHEETS_API_BASE}/${cleanId}/values/${encodedRange}`;
  const data = await sheetsFetch(url, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/json'
    }
  });
  return data.values || [];
}

/**
 * Appends rows to a sheet tab using spreadsheets.values.append.
 *
 * @param {string} spreadsheetId
 * @param {string} range - e.g. "'Software'!A:M"
 * @param {any[][]} values - Array of row arrays to append
 * @param {string} token
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function appendValues(spreadsheetId, range, values, token, {
  valueInputOption = 'USER_ENTERED',
  insertDataOption = 'INSERT_ROWS'
} = {}) {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const encodedRange = encodeURIComponent(range);
  const url = `${SHEETS_API_BASE}/${cleanId}/values/${encodedRange}:append?valueInputOption=${valueInputOption}&insertDataOption=${insertDataOption}`;

  return await sheetsFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ values })
  });
}

/**
 * Updates an explicit range of cells (e.g. for editing existing leads).
 *
 * @param {string} spreadsheetId
 * @param {string} range - e.g. "'Software'!A5:M5"
 * @param {any[][]} values
 * @param {string} token
 * @param {object} [options={}]
 * @returns {Promise<object>}
 */
export async function updateValues(spreadsheetId, range, values, token, {
  valueInputOption = 'USER_ENTERED'
} = {}) {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const encodedRange = encodeURIComponent(range);
  const url = `${SHEETS_API_BASE}/${cleanId}/values/${encodedRange}?valueInputOption=${valueInputOption}`;

  return await sheetsFetch(url, {
    method: 'PUT',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ values })
  });
}

/**
 * Executes batch update requests (create sheets, rename sheets, format, etc.).
 *
 * @param {string} spreadsheetId
 * @param {object[]} requests - Array of Google Sheets API Request objects
 * @param {string} token
 * @returns {Promise<object>}
 */
export async function batchUpdate(spreadsheetId, requests, token) {
  const cleanId = extractSpreadsheetId(spreadsheetId);
  const url = `${SHEETS_API_BASE}/${cleanId}:batchUpdate`;

  return await sheetsFetch(url, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      Accept: 'application/json'
    },
    body: JSON.stringify({ requests })
  });
}
