/**
 * Category Management Service.
 * Coordinates spreadsheet tab creation, validation, renaming, and synchronization.
 */

import { getSpreadsheet, batchUpdate, appendValues, getValues } from './sheets-api.js';
import { LEAD_HEADERS } from './lead-model.js';
import { validateCategoryName, sanitizeCategoryName, MASTER_SHEET_NAME } from '../utils/validation.js';
import { SheetsError } from '../utils/errors.js';

const STORAGE_KEYS = {
  CATEGORIES: 'business_categories',
  DEFAULT_CATEGORY: 'default_business_category',
  SPREADSHEET_ID: 'google_spreadsheet_id',
  SPREADSHEET_TITLE: 'google_spreadsheet_title'
};

/**
 * Initializes or verifies the connected spreadsheet.
 * - Ensures 'All Leads' master sheet exists with standard headers.
 * - Detects and caches all existing category sheet tabs.
 * - Does not overwrite existing rows.
 *
 * @param {string} spreadsheetId
 * @param {string} token
 * @returns {Promise<{ categories: string[], masterCreated: boolean, spreadsheetTitle: string }>}
 */
export async function initializeSpreadsheet(spreadsheetId, token) {
  const meta = await getSpreadsheet(spreadsheetId, token);
  const spreadsheetTitle = meta.properties?.title || 'Spreadsheet';
  const existingSheets = meta.sheets || [];

  const sheetTitles = existingSheets.map((s) => s.properties?.title).filter(Boolean);
  const masterSheetExists = sheetTitles.some(
    (title) => title.toLowerCase() === MASTER_SHEET_NAME.toLowerCase()
  );

  let masterCreated = false;

  // 1. Create master sheet 'All Leads' if missing
  if (!masterSheetExists) {
    await batchUpdate(
      spreadsheetId,
      [
        {
          addSheet: {
            properties: {
              title: MASTER_SHEET_NAME,
              gridProperties: {
                frozenRowCount: 1
              }
            }
          }
        }
      ],
      token
    );
    masterCreated = true;

    // Add headers to All Leads
    await appendValues(
      spreadsheetId,
      `'${MASTER_SHEET_NAME}'!A1:M1`,
      [LEAD_HEADERS],
      token,
      { insertDataOption: 'OVERWRITE' }
    );
  } else {
    // If master sheet exists, check if headers exist in row 1
    try {
      const headerRow = await getValues(spreadsheetId, `'${MASTER_SHEET_NAME}'!A1:M1`, token);
      if (!headerRow || headerRow.length === 0 || !headerRow[0] || headerRow[0].length === 0) {
        await appendValues(
          spreadsheetId,
          `'${MASTER_SHEET_NAME}'!A1:M1`,
          [LEAD_HEADERS],
          token,
          { insertDataOption: 'OVERWRITE' }
        );
      }
    } catch {
      // Non-fatal if header verification fails
    }
  }

  // 2. Extract category sheet tabs (exclude 'All Leads' and blank generic tabs like 'Sheet1' if desired, but keep actual user sheets)
  const categoryTabs = sheetTitles.filter(
    (title) => title.toLowerCase() !== MASTER_SHEET_NAME.toLowerCase()
  );

  // If no categories exist yet, create a default 'General' category
  if (categoryTabs.length === 0) {
    try {
      await createCategory(spreadsheetId, 'General', token, categoryTabs);
      categoryTabs.push('General');
    } catch {
      // Ignore if General cannot be created
    }
  }

  // 3. Cache categories and spreadsheet metadata
  await saveCategoriesToStorage(categoryTabs);
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.SPREADSHEET_ID]: spreadsheetId,
      [STORAGE_KEYS.SPREADSHEET_TITLE]: spreadsheetTitle
    });
  }

  return {
    categories: categoryTabs,
    masterCreated,
    spreadsheetTitle
  };
}

/**
 * Creates a new category tab in the spreadsheet and adds column headers.
 *
 * @param {string} spreadsheetId
 * @param {string} rawCategoryName
 * @param {string} token
 * @param {string[]} [existingCategories=[]]
 * @returns {Promise<{ category: string, sheetId: number }>}
 */
export async function createCategory(spreadsheetId, rawCategoryName, token, existingCategories = []) {
  // Validate name
  const validation = validateCategoryName(rawCategoryName, existingCategories);
  if (!validation.isValid) {
    throw new SheetsError(
      `Invalid category name: ${validation.error}`,
      validation.error,
      'INVALID_CATEGORY_NAME'
    );
  }

  const categoryName = validation.sanitizedName;

  // Add sheet to spreadsheet
  const batchRes = await batchUpdate(
    spreadsheetId,
    [
      {
        addSheet: {
          properties: {
            title: categoryName,
            gridProperties: {
              frozenRowCount: 1
            }
          }
        }
      }
    ],
    token
  );

  const newSheetId = batchRes.replies?.[0]?.addSheet?.properties?.sheetId || 0;

  // Add standard header row to the newly created tab
  await appendValues(
    spreadsheetId,
    `'${categoryName}'!A1:M1`,
    [LEAD_HEADERS],
    token,
    { insertDataOption: 'OVERWRITE' }
  );

  // Update local storage
  const current = await getStoredCategories();
  if (!current.includes(categoryName)) {
    const updated = [...current, categoryName];
    await saveCategoriesToStorage(updated);
  }

  return {
    category: categoryName,
    sheetId: newSheetId
  };
}

/**
 * Renames an existing category sheet tab.
 *
 * @param {string} spreadsheetId
 * @param {string} oldCategoryName
 * @param {string} newCategoryName
 * @param {string} token
 * @returns {Promise<string>} - The sanitized new name
 */
export async function renameCategory(spreadsheetId, oldCategoryName, newCategoryName, token) {
  const currentCategories = await getStoredCategories();
  const otherCategories = currentCategories.filter((c) => c !== oldCategoryName);

  const validation = validateCategoryName(newCategoryName, otherCategories);
  if (!validation.isValid) {
    throw new SheetsError(
      `Cannot rename category: ${validation.error}`,
      validation.error,
      'INVALID_CATEGORY_NAME'
    );
  }

  const cleanNewName = validation.sanitizedName;

  // Find sheetId for oldCategoryName
  const meta = await getSpreadsheet(spreadsheetId, token);
  const targetSheet = (meta.sheets || []).find(
    (s) => s.properties?.title === oldCategoryName
  );

  if (!targetSheet) {
    throw new SheetsError(
      `Category sheet "${oldCategoryName}" not found in spreadsheet.`,
      `The tab "${oldCategoryName}" was not found in your Google Sheet.`,
      'SHEET_NOT_FOUND'
    );
  }

  const sheetId = targetSheet.properties.sheetId;

  // Perform rename batch update
  await batchUpdate(
    spreadsheetId,
    [
      {
        updateSheetProperties: {
          properties: {
            sheetId,
            title: cleanNewName
          },
          fields: 'title'
        }
      }
    ],
    token
  );

  // Update categories in storage
  const updatedCategories = currentCategories.map((c) => (c === oldCategoryName ? cleanNewName : c));
  await saveCategoriesToStorage(updatedCategories);

  // If default category was old name, update it too
  const defaultCat = await getDefaultCategory();
  if (defaultCat === oldCategoryName) {
    await setDefaultCategory(cleanNewName);
  }

  return cleanNewName;
}

/**
 * Retrieves the cached categories list from extension storage.
 *
 * @returns {Promise<string[]>}
 */
export async function getStoredCategories() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const data = await chrome.storage.local.get(STORAGE_KEYS.CATEGORIES);
    if (Array.isArray(data[STORAGE_KEYS.CATEGORIES]) && data[STORAGE_KEYS.CATEGORIES].length > 0) {
      return data[STORAGE_KEYS.CATEGORIES];
    }
  }
  return ['General'];
}

/**
 * Saves categories list to storage.
 *
 * @param {string[]} categories
 * @returns {Promise<void>}
 */
export async function saveCategoriesToStorage(categories) {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.CATEGORIES]: categories
    });
  }
}

/**
 * Gets the configured default category.
 *
 * @returns {Promise<string>}
 */
export async function getDefaultCategory() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const data = await chrome.storage.local.get(STORAGE_KEYS.DEFAULT_CATEGORY);
    if (data[STORAGE_KEYS.DEFAULT_CATEGORY]) {
      return data[STORAGE_KEYS.DEFAULT_CATEGORY];
    }
  }
  return 'General';
}

/**
 * Sets the default category.
 *
 * @param {string} category
 * @returns {Promise<void>}
 */
export async function setDefaultCategory(category) {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.DEFAULT_CATEGORY]: category
    });
  }
}
