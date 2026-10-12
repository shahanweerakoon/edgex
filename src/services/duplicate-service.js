/**
 * Duplicate Detection Service for Facebook Leads.
 * Performs primary (URL) and secondary (Phone) matching against Google Sheets data.
 */

import { getValues } from './sheets-api.js';
import { rowToLead } from './lead-model.js';
import { normalizeFacebookUrl } from '../utils/url-normalizer.js';
import { getPhoneMatchKey } from '../utils/phone-normalizer.js';
import { MASTER_SHEET_NAME } from '../utils/validation.js';

/**
 * Searches Google Sheets for an existing duplicate lead.
 * Checks the target Category sheet and the Master 'All Leads' sheet.
 *
 * @param {string} spreadsheetId
 * @param {object} lead - Lead object to check
 * @param {string} token
 * @returns {Promise<{ isDuplicate: boolean, matchType: 'url'|'phone'|null, matchedValue: string|null, existingLead: object|null, masterRowIndex: number, categoryRowIndex: number }>}
 */
export async function checkForDuplicate(spreadsheetId, lead, token) {
  const normalizedUrl = normalizeFacebookUrl(lead.url);
  const phoneKey = lead.phone ? getPhoneMatchKey(lead.phone) : '';

  let existingLead = null;
  let matchType = null;
  let matchedValue = null;
  let masterRowIndex = -1;
  let categoryRowIndex = -1;

  // 1. Search in master sheet 'All Leads'
  try {
    const masterRows = await getValues(spreadsheetId, `'${MASTER_SHEET_NAME}'!A2:M`, token);

    for (let i = 0; i < masterRows.length; i++) {
      const row = masterRows[i];
      const actualRowIndex = i + 2; // Row 1 is header, 1-indexed

      const rowUrl = row[2] ? normalizeFacebookUrl(row[2]) : '';
      const rowPhone = row[1] ? getPhoneMatchKey(row[1]) : '';
      const rowAdditionalPhone = row[8] ? getPhoneMatchKey(row[8]) : '';

      // Primary check: Facebook URL
      if (normalizedUrl && rowUrl && normalizedUrl === rowUrl) {
        existingLead = rowToLead(row, actualRowIndex);
        matchType = 'url';
        matchedValue = row[2];
        masterRowIndex = actualRowIndex;
        break;
      }

      // Secondary check: Phone number (only if phone is present and not matched yet)
      if (phoneKey && (phoneKey === rowPhone || phoneKey === rowAdditionalPhone)) {
        existingLead = rowToLead(row, actualRowIndex);
        matchType = 'phone';
        matchedValue = row[1] || row[8];
        masterRowIndex = actualRowIndex;
        break;
      }
    }
  } catch {
    // If master sheet read fails, proceed to category sheet check
  }

  // 2. Also locate row index in Category sheet if category exists
  if (lead.category && lead.category.toLowerCase() !== MASTER_SHEET_NAME.toLowerCase()) {
    try {
      const catRows = await getValues(spreadsheetId, `'${lead.category}'!A2:M`, token);

      for (let i = 0; i < catRows.length; i++) {
        const row = catRows[i];
        const actualRowIndex = i + 2;

        const rowUrl = row[2] ? normalizeFacebookUrl(row[2]) : '';
        const rowPhone = row[1] ? getPhoneMatchKey(row[1]) : '';
        const rowId = row[3] || '';

        // Match by lead ID if known, or by URL or Phone
        if (existingLead?.id && rowId === existingLead.id) {
          categoryRowIndex = actualRowIndex;
          break;
        } else if (normalizedUrl && rowUrl === normalizedUrl) {
          categoryRowIndex = actualRowIndex;
          if (!existingLead) {
            existingLead = rowToLead(row, actualRowIndex);
            matchType = 'url';
            matchedValue = row[2];
          }
          break;
        } else if (phoneKey && rowPhone === phoneKey) {
          categoryRowIndex = actualRowIndex;
          if (!existingLead) {
            existingLead = rowToLead(row, actualRowIndex);
            matchType = 'phone';
            matchedValue = row[1];
          }
          break;
        }
      }
    } catch {
      // Category sheet might not exist yet
    }
  }

  return {
    isDuplicate: Boolean(existingLead),
    matchType,
    matchedValue,
    existingLead,
    masterRowIndex,
    categoryRowIndex
  };
}
