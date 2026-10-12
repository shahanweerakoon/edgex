/**
 * Lead Service.
 * Manages lead validation, duplicate detection, atomic appending to Category and Master tabs,
 * updating existing leads, and partial-save recovery.
 */

import { validateLead } from '../utils/validation.js';
import { ValidationError, SheetsError, PartialSaveError } from '../utils/errors.js';
import { appendValues, updateValues, getSpreadsheet } from './sheets-api.js';
import { leadToRow, rowToLead, LEAD_HEADERS } from './lead-model.js';
import { checkForDuplicate } from './duplicate-service.js';
import { createCategory, initializeSpreadsheet } from './category-service.js';
import { MASTER_SHEET_NAME } from '../utils/validation.js';

/**
 * Saves a lead to Google Sheets.
 * Appends to both the selected Category tab and the Master 'All Leads' tab.
 *
 * @param {string} spreadsheetId
 * @param {object} rawLead
 * @param {string} token
 * @param {object} [options={}]
 * @param {boolean} [options.allowDuplicate=false]
 * @param {'skip'|'update'|'save_anyway'} [options.duplicateAction='skip']
 * @returns {Promise<{ success: boolean, lead: object, status: string, duplicateInfo?: object }>}
 */
export async function saveLead(spreadsheetId, rawLead, token, {
  allowDuplicate = false,
  duplicateAction = 'skip'
} = {}) {
  // 1. Validate Lead Payload
  const validation = validateLead(rawLead);
  if (!validation.isValid) {
    const errorDetails = Object.values(validation.errors).join(' ');
    throw new ValidationError(
      `Lead validation failed: ${errorDetails}`,
      errorDetails,
      'VALIDATION_FAILED',
      validation.errors
    );
  }

  const lead = validation.normalizedLead;

  // 2. Ensure spreadsheet is initialized and category sheet exists
  const meta = await getSpreadsheet(spreadsheetId, token);
  const existingSheetTitles = (meta.sheets || []).map((s) => s.properties?.title).filter(Boolean);

  // If All Leads doesn't exist, initialize
  if (!existingSheetTitles.some((t) => t.toLowerCase() === MASTER_SHEET_NAME.toLowerCase())) {
    await initializeSpreadsheet(spreadsheetId, token);
    existingSheetTitles.push(MASTER_SHEET_NAME);
  }

  // If Category sheet does not exist, create it automatically
  const categoryExists = existingSheetTitles.some(
    (t) => t.toLowerCase() === lead.category.toLowerCase()
  );

  if (!categoryExists) {
    await createCategory(spreadsheetId, lead.category, token, existingSheetTitles);
    existingSheetTitles.push(lead.category);
  }

  // 3. Duplicate Detection Check
  if (!allowDuplicate) {
    const duplicateInfo = await checkForDuplicate(spreadsheetId, lead, token);
    if (duplicateInfo.isDuplicate) {
      if (duplicateAction === 'skip') {
        return {
          success: false,
          status: 'duplicate_detected',
          duplicateInfo,
          lead
        };
      } else if (duplicateAction === 'update') {
        return await updateExistingLead(spreadsheetId, lead, duplicateInfo, token);
      }
      // If duplicateAction is 'save_anyway', fall through to append
    }
  }

  // 4. Prepare row data
  const rowData = leadToRow(lead);

  let categorySaved = false;
  let masterSaved = false;

  // 5. Append to Category Sheet
  try {
    await appendValues(spreadsheetId, `'${lead.category}'!A:M`, [rowData], token);
    categorySaved = true;
  } catch (err) {
    throw new SheetsError(
      `Failed to save lead to category tab "${lead.category}": ${err.message}`,
      `Could not write to the "${lead.category}" tab: ${err.userMessage || err.message}`,
      'CATEGORY_SAVE_FAILED',
      { originalError: err.message }
    );
  }

  // 6. Append to Master 'All Leads' Sheet
  try {
    await appendValues(spreadsheetId, `'${MASTER_SHEET_NAME}'!A:M`, [rowData], token);
    masterSaved = true;
  } catch (err) {
    // Category succeeded but master failed: raise PartialSaveError
    throw new PartialSaveError(
      `Lead was saved to "${lead.category}", but saving to "${MASTER_SHEET_NAME}" failed.`,
      { categorySaved, masterSaved, leadData: lead, originalError: err }
    );
  }

  return {
    success: true,
    status: 'saved',
    lead
  };
}

/**
 * Updates an existing lead in both Category and Master sheets.
 * Preserves existing data when new fields are blank.
 *
 * @param {string} spreadsheetId
 * @param {object} updatedLead
 * @param {object} duplicateInfo
 * @param {string} token
 * @returns {Promise<{ success: boolean, status: string, lead: object }>}
 */
export async function updateExistingLead(spreadsheetId, updatedLead, duplicateInfo, token) {
  const existing = duplicateInfo.existingLead || {};

  // Merge: preserve existing useful fields if new ones are blank
  const mergedLead = {
    ...existing,
    ...updatedLead,
    id: existing.id || updatedLead.id,
    name: updatedLead.name || existing.name,
    phone: updatedLead.phone || existing.phone,
    url: updatedLead.url || existing.url,
    category: updatedLead.category || existing.category,
    email: updatedLead.email || existing.email,
    website: updatedLead.website || existing.website,
    notes: updatedLead.notes ? `${existing.notes ? existing.notes + ' | ' : ''}${updatedLead.notes}` : existing.notes,
    dateAdded: existing.dateAdded || new Date().toISOString(),
    lastUpdated: new Date().toISOString()
  };

  const rowData = leadToRow(mergedLead);

  let masterUpdated = false;
  let categoryUpdated = false;

  // Update Master Sheet Row if rowIndex is known
  if (duplicateInfo.masterRowIndex > 1) {
    try {
      await updateValues(
        spreadsheetId,
        `'${MASTER_SHEET_NAME}'!A${duplicateInfo.masterRowIndex}:M${duplicateInfo.masterRowIndex}`,
        [rowData],
        token
      );
      masterUpdated = true;
    } catch (err) {
      // Log or retain error
    }
  }

  // Update Category Sheet Row if rowIndex is known
  if (duplicateInfo.categoryRowIndex > 1 && mergedLead.category) {
    try {
      await updateValues(
        spreadsheetId,
        `'${mergedLead.category}'!A${duplicateInfo.categoryRowIndex}:M${duplicateInfo.categoryRowIndex}`,
        [rowData],
        token
      );
      categoryUpdated = true;
    } catch (err) {
      // Log or retain error
    }
  }

  if (!masterUpdated && !categoryUpdated) {
    // If neither row could be updated directly, append as a revision
    return await saveLead(spreadsheetId, mergedLead, token, { allowDuplicate: true });
  }

  return {
    success: true,
    status: 'updated',
    lead: mergedLead,
    masterUpdated,
    categoryUpdated
  };
}

/**
 * Reconciles a partial save by attempting to write the missing sheet.
 *
 * @param {string} spreadsheetId
 * @param {object} leadData
 * @param {object} partialInfo
 * @param {string} token
 * @returns {Promise<boolean>}
 */
export async function reconcilePartialSave(spreadsheetId, leadData, partialInfo, token) {
  const rowData = leadToRow(leadData);

  if (!partialInfo.categorySaved && leadData.category) {
    await appendValues(spreadsheetId, `'${leadData.category}'!A:M`, [rowData], token);
  }

  if (!partialInfo.masterSaved) {
    await appendValues(spreadsheetId, `'${MASTER_SHEET_NAME}'!A:M`, [rowData], token);
  }

  return true;
}
