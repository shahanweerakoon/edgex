/**
 * Facebook Lead Collector - Background Service Worker (Manifest V3)
 * Orchestrates extension lifecycle, message dispatching, and background operations.
 */

import { authenticate, disconnectGoogle, getStoredToken, getStoredUserInfo, isAuthenticated } from '../auth/google-auth.js';
import { initializeSpreadsheet, createCategory, renameCategory, getStoredCategories } from '../services/category-service.js';
import { saveLead, updateExistingLead, reconcilePartialSave } from '../services/lead-service.js';
import { getSpreadsheet, extractSpreadsheetId } from '../services/sheets-api.js';

// Default starter categories
const DEFAULT_CATEGORIES = [
  'General',
  'Software',
  'Printing',
  'Advertising',
  'Microfinance',
  'Retail',
  'Construction',
  'Automotive',
  'Other'
];

/**
 * Extension installation and update listener.
 */
chrome.runtime.onInstalled.addListener(async (details) => {
  if (details.reason === 'install') {
    // Initialize default local storage values
    const existing = await chrome.storage.local.get(['business_categories', 'default_business_category']);
    if (!existing.business_categories) {
      await chrome.storage.local.set({
        business_categories: DEFAULT_CATEGORIES,
        default_business_category: 'General'
      });
    }
    console.log('[Facebook Lead Collector] Extension installed successfully.');
  }
});

/**
 * Message handler for cross-component communication (Popup, Settings, Content Scripts).
 */
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  const handleAsyncMessage = async () => {
    switch (message.action) {
      case 'CHECK_AUTH': {
        const authed = await isAuthenticated();
        const user = await getStoredUserInfo();
        return { isAuthenticated: authed, user };
      }

      case 'LOGIN_GOOGLE': {
        const token = await authenticate({ interactive: true, forceConsent: Boolean(message.forceConsent) });
        const user = await getStoredUserInfo();
        return { success: true, token, user };
      }

      case 'LOGOUT_GOOGLE': {
        await disconnectGoogle();
        return { success: true };
      }

      case 'TEST_SPREADSHEET_CONNECTION': {
        const token = await authenticate({ interactive: false });
        const sheetId = extractSpreadsheetId(message.spreadsheetId);
        const meta = await getSpreadsheet(sheetId, token);
        return { success: true, title: meta.properties?.title || 'Spreadsheet', sheets: meta.sheets };
      }

      case 'INIT_SPREADSHEET': {
        const token = await authenticate({ interactive: true });
        const sheetId = extractSpreadsheetId(message.spreadsheetId);
        const result = await initializeSpreadsheet(sheetId, token);
        return { success: true, ...result };
      }

      case 'SAVE_LEAD_REQUEST': {
        const token = await authenticate({ interactive: true });
        const sheetId = extractSpreadsheetId(message.spreadsheetId);
        const result = await saveLead(sheetId, message.lead, token, {
          allowDuplicate: message.allowDuplicate || false,
          duplicateAction: message.duplicateAction || 'skip'
        });
        return result;
      }

      case 'UPDATE_LEAD_REQUEST': {
        const token = await authenticate({ interactive: true });
        const sheetId = extractSpreadsheetId(message.spreadsheetId);
        const result = await updateExistingLead(sheetId, message.lead, message.duplicateInfo, token);
        return result;
      }

      case 'RECONCILE_PARTIAL_SAVE': {
        const token = await authenticate({ interactive: true });
        const sheetId = extractSpreadsheetId(message.spreadsheetId);
        await reconcilePartialSave(sheetId, message.leadData, message.partialInfo, token);
        return { success: true };
      }

      case 'CREATE_CATEGORY': {
        const token = await authenticate({ interactive: true });
        const sheetId = extractSpreadsheetId(message.spreadsheetId);
        const existingCats = await getStoredCategories();
        const result = await createCategory(sheetId, message.categoryName, token, existingCats);
        return { success: true, ...result };
      }

      case 'RENAME_CATEGORY': {
        const token = await authenticate({ interactive: true });
        const sheetId = extractSpreadsheetId(message.spreadsheetId);
        const newName = await renameCategory(sheetId, message.oldName, message.newName, token);
        return { success: true, newName };
      }

      default:
        return { error: `Unknown action: ${message.action}` };
    }
  };

  handleAsyncMessage()
    .then((response) => sendResponse(response))
    .catch((err) => {
      sendResponse({
        success: false,
        error: err.message,
        code: err.code || 'UNKNOWN_ERROR',
        userMessage: err.userMessage || err.message,
        recoveryHint: err.recoveryHint || '',
        details: err.details || {}
      });
    });

  return true; // Keep asynchronous message port alive
});
