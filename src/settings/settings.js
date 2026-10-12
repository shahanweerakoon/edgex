/**
 * Facebook Lead Collector - Settings Page Controller
 */

import { getRedirectUri, getClientId, setClientId } from '../auth/google-auth.js';
import { extractSpreadsheetId } from '../services/sheets-api.js';

// DOM Elements
const alertBox = document.getElementById('settings-alert');
const alertText = document.getElementById('settings-alert-text');
const btnCloseAlert = document.getElementById('btn-close-alert');

const authStatusDot = document.getElementById('auth-status-dot');
const authStatusLabel = document.getElementById('auth-status-label');
const authStatusEmail = document.getElementById('auth-status-email');
const btnConnectGoogle = document.getElementById('btn-connect-google');
const btnDisconnectGoogle = document.getElementById('btn-disconnect-google');

const inputClientId = document.getElementById('input-client-id');
const btnSaveClientId = document.getElementById('btn-save-client-id');
const redirectUriText = document.getElementById('redirect-uri-text');
const btnCopyRedirect = document.getElementById('btn-copy-redirect');

const inputSpreadsheet = document.getElementById('input-spreadsheet');
const btnSaveSpreadsheet = document.getElementById('btn-save-spreadsheet');
const activeSheetCard = document.getElementById('active-sheet-card');
const activeSheetTitle = document.getElementById('active-sheet-title');
const activeSheetId = document.getElementById('active-sheet-id');
const btnTestConnection = document.getElementById('btn-test-connection');
const btnInitSheet = document.getElementById('btn-init-sheet');
const btnDisconnectSheet = document.getElementById('btn-disconnect-sheet');
const testConnectionOutput = document.getElementById('test-connection-output');

const selectDefaultCategory = document.getElementById('select-default-category');
const btnClearStorage = document.getElementById('btn-clear-storage');

/**
 * Initializes settings page.
 */
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  loadRedirectUri();
  await loadClientId();
  await refreshAuthStatus();
  await loadSpreadsheetConfig();
  await loadCategories();
});

/**
 * Attaches event listeners.
 */
function setupEventListeners() {
  btnCloseAlert.addEventListener('click', () => alertBox.classList.add('hidden'));

  btnConnectGoogle.addEventListener('click', handleConnectGoogle);
  btnDisconnectGoogle.addEventListener('click', handleDisconnectGoogle);

  btnSaveClientId.addEventListener('click', handleSaveClientId);
  btnCopyRedirect.addEventListener('click', handleCopyRedirectUri);

  btnSaveSpreadsheet.addEventListener('click', handleConnectSpreadsheet);
  btnTestConnection.addEventListener('click', handleTestConnection);
  btnInitSheet.addEventListener('click', handleInitializeSheet);
  btnDisconnectSheet.addEventListener('click', handleDisconnectSheet);

  selectDefaultCategory.addEventListener('change', handleDefaultCategoryChange);
  btnClearStorage.addEventListener('click', handleClearStorage);
}

/**
 * Loads extension's OAuth redirect URI.
 */
function loadRedirectUri() {
  const uri = getRedirectUri();
  redirectUriText.textContent = uri;
}

/**
 * Copies redirect URI to clipboard.
 */
async function handleCopyRedirectUri() {
  const uri = redirectUriText.textContent;
  try {
    await navigator.clipboard.writeText(uri);
    btnCopyRedirect.textContent = 'Copied!';
    setTimeout(() => {
      btnCopyRedirect.textContent = 'Copy URI';
    }, 2000);
  } catch {
    showAlert('error', 'Unable to copy. Please manually highlight and copy the URI text.');
  }
}

/**
 * Loads configured Client ID into input field.
 */
async function loadClientId() {
  const clientId = await getClientId();
  if (clientId) {
    inputClientId.value = clientId;
  }
}

/**
 * Saves Google OAuth Client ID to storage.
 */
async function handleSaveClientId() {
  const id = inputClientId.value.trim();
  await setClientId(id);
  showAlert('success', 'Google OAuth Client ID saved successfully.');
}

/**
 * Checks and updates authentication UI state.
 */
async function refreshAuthStatus() {
  try {
    const res = await chrome.runtime.sendMessage({ action: 'CHECK_AUTH' });
    if (res.isAuthenticated) {
      authStatusDot.className = 'dot connected';
      authStatusLabel.textContent = 'Connected to Google';
      const email = res.user?.email || 'Authenticated User';
      authStatusEmail.textContent = email;
      btnConnectGoogle.classList.add('hidden');
      btnDisconnectGoogle.classList.remove('hidden');
    } else {
      authStatusDot.className = 'dot disconnected';
      authStatusLabel.textContent = 'Not Connected';
      authStatusEmail.textContent = 'No Google account linked.';
      btnConnectGoogle.classList.remove('hidden');
      btnDisconnectGoogle.classList.add('hidden');
    }
  } catch (err) {
    authStatusDot.className = 'dot disconnected';
    authStatusLabel.textContent = 'Authentication Check Failed';
  }
}

/**
 * Connects Google account via OAuth flow.
 */
async function handleConnectGoogle() {
  const clientId = inputClientId.value.trim();
  if (!clientId) {
    showAlert('error', 'Please enter your Google OAuth 2.0 Client ID before signing in.');
    inputClientId.focus();
    return;
  }
  await setClientId(clientId);

  btnConnectGoogle.disabled = true;
  btnConnectGoogle.textContent = 'Signing in...';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'LOGIN_GOOGLE',
      forceConsent: true
    });

    if (res.success) {
      await refreshAuthStatus();
      showAlert('success', `Signed in successfully${res.user?.email ? ' as ' + res.user.email : ''}!`);
    } else {
      showAlert('error', res.userMessage || res.error || 'Google sign-in failed.');
      if (res.recoveryHint) {
        testConnectionOutput.textContent = res.recoveryHint;
        testConnectionOutput.className = 'test-output error';
        testConnectionOutput.classList.remove('hidden');
      }
    }
  } catch (err) {
    showAlert('error', err.message);
  } finally {
    btnConnectGoogle.disabled = false;
    btnConnectGoogle.textContent = 'Connect Google Account';
  }
}

/**
 * Disconnects Google account.
 */
async function handleDisconnectGoogle() {
  try {
    await chrome.runtime.sendMessage({ action: 'LOGOUT_GOOGLE' });
    await refreshAuthStatus();
    showAlert('success', 'Disconnected from Google account.');
  } catch (err) {
    showAlert('error', err.message);
  }
}

/**
 * Loads current spreadsheet settings into UI.
 */
async function loadSpreadsheetConfig() {
  const data = await chrome.storage.local.get(['google_spreadsheet_id', 'google_spreadsheet_title']);
  const id = data.google_spreadsheet_id;
  const title = data.google_spreadsheet_title;

  if (id) {
    activeSheetTitle.textContent = title || 'Google Spreadsheet';
    activeSheetId.textContent = `ID: ${id}`;
    activeSheetCard.classList.remove('hidden');
    inputSpreadsheet.value = `https://docs.google.com/spreadsheets/d/${id}/edit`;
  } else {
    activeSheetCard.classList.add('hidden');
  }
}

/**
 * Connects and verifies a spreadsheet URL/ID.
 */
async function handleConnectSpreadsheet() {
  const raw = inputSpreadsheet.value.trim();
  if (!raw) {
    showAlert('error', 'Please enter a Google Spreadsheet URL or ID.');
    return;
  }

  const cleanId = extractSpreadsheetId(raw);
  if (!cleanId || cleanId.length < 20) {
    showAlert('error', 'Invalid Google Spreadsheet ID format.');
    return;
  }

  btnSaveSpreadsheet.disabled = true;
  btnSaveSpreadsheet.textContent = 'Verifying...';

  try {
    // Test connection to Google Sheets API
    const res = await chrome.runtime.sendMessage({
      action: 'TEST_SPREADSHEET_CONNECTION',
      spreadsheetId: cleanId
    });

    if (res.success) {
      const title = res.title || 'Google Spreadsheet';
      await chrome.storage.local.set({
        google_spreadsheet_id: cleanId,
        google_spreadsheet_title: title
      });

      await loadSpreadsheetConfig();
      showAlert('success', `Connected to "${title}"!`);

      // Automatically offer or initialize All Leads
      await handleInitializeSheet();
    } else {
      showAlert('error', res.userMessage || res.error || 'Failed to connect to spreadsheet.');
    }
  } catch (err) {
    showAlert('error', err.message);
  } finally {
    btnSaveSpreadsheet.disabled = false;
    btnSaveSpreadsheet.textContent = 'Connect Sheet';
  }
}

/**
 * Tests live connection to the active spreadsheet.
 */
async function handleTestConnection() {
  const data = await chrome.storage.local.get('google_spreadsheet_id');
  const sheetId = data.google_spreadsheet_id;
  if (!sheetId) return;

  btnTestConnection.disabled = true;
  btnTestConnection.textContent = 'Testing...';
  testConnectionOutput.classList.add('hidden');

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'TEST_SPREADSHEET_CONNECTION',
      spreadsheetId: sheetId
    });

    if (res.success) {
      const sheetsList = (res.sheets || []).map((s) => `• ${s.properties?.title || 'Untitled'}`).join('\n');
      testConnectionOutput.textContent = `Connection verified successfully!\n\nSpreadsheet: ${res.title}\nExisting Tabs (${res.sheets?.length || 0}):\n${sheetsList}`;
      testConnectionOutput.className = 'test-output success';
      testConnectionOutput.classList.remove('hidden');
    } else {
      testConnectionOutput.textContent = `Connection Test Failed:\n${res.userMessage || res.error}\n${res.recoveryHint || ''}`;
      testConnectionOutput.className = 'test-output error';
      testConnectionOutput.classList.remove('hidden');
    }
  } catch (err) {
    testConnectionOutput.textContent = `Error: ${err.message}`;
    testConnectionOutput.className = 'test-output error';
    testConnectionOutput.classList.remove('hidden');
  } finally {
    btnTestConnection.disabled = false;
    btnTestConnection.textContent = 'Test Connection';
  }
}

/**
 * Initializes 'All Leads' master sheet and standard column headers.
 */
async function handleInitializeSheet() {
  const data = await chrome.storage.local.get('google_spreadsheet_id');
  const sheetId = data.google_spreadsheet_id;
  if (!sheetId) return;

  btnInitSheet.disabled = true;
  btnInitSheet.textContent = 'Initializing...';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'INIT_SPREADSHEET',
      spreadsheetId: sheetId
    });

    if (res.success) {
      showAlert('success', 'Spreadsheet initialized! "All Leads" master tab and headers are ready.');
      await loadCategories();
      await handleTestConnection();
    } else {
      showAlert('error', res.userMessage || res.error || 'Failed to initialize spreadsheet.');
    }
  } catch (err) {
    showAlert('error', err.message);
  } finally {
    btnInitSheet.disabled = false;
    btnInitSheet.textContent = 'Initialize "All Leads"';
  }
}

/**
 * Disconnects the current spreadsheet.
 */
async function handleDisconnectSheet() {
  await chrome.storage.local.remove(['google_spreadsheet_id', 'google_spreadsheet_title']);
  inputSpreadsheet.value = '';
  activeSheetCard.classList.add('hidden');
  testConnectionOutput.classList.add('hidden');
  showAlert('success', 'Spreadsheet disconnected. Your Google Sheets data is intact.');
}

/**
 * Loads categories into default selector.
 */
async function loadCategories() {
  const data = await chrome.storage.local.get(['business_categories', 'default_business_category']);
  const categories = data.business_categories || ['General', 'Software', 'Printing', 'Retail'];
  const defaultCat = data.default_business_category || 'General';

  selectDefaultCategory.innerHTML = '';
  categories.forEach((cat) => {
    const opt = document.createElement('option');
    opt.value = cat;
    opt.textContent = cat;
    if (cat === defaultCat) opt.selected = true;
    selectDefaultCategory.appendChild(opt);
  });
}

/**
 * Handles default category change.
 */
async function handleDefaultCategoryChange() {
  const cat = selectDefaultCategory.value;
  await chrome.storage.local.set({ default_business_category: cat });
  showAlert('success', `Default category set to "${cat}".`);
}

/**
 * Resets local extension storage.
 */
async function handleClearStorage() {
  const confirmed = confirm(
    'Are you sure you want to clear your local extension settings? This will clear stored tokens, Client ID, and sheet selection from this browser. Your Google Sheets documents will NOT be affected.'
  );

  if (confirmed) {
    await chrome.storage.local.clear();
    await refreshAuthStatus();
    await loadSpreadsheetConfig();
    inputClientId.value = '';
    showAlert('success', 'Local extension settings cleared.');
  }
}

function showAlert(type, msg) {
  alertBox.className = `alert ${type}`;
  alertText.textContent = msg;
  alertBox.classList.remove('hidden');
}
