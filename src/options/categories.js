/**
 * Facebook Lead Collector - Categories Management Controller
 */

import { validateCategoryName, sanitizeCategoryName } from '../utils/validation.js';

// DOM Elements
const alertBox = document.getElementById('category-alert');
const alertText = document.getElementById('category-alert-text');
const btnCloseAlert = document.getElementById('btn-close-alert');

const activeSheetLabel = document.getElementById('active-sheet-label');
const btnSyncSheets = document.getElementById('btn-sync-sheets');

const createForm = document.getElementById('create-category-form');
const inputNewCategory = document.getElementById('new-category-name');
const btnCreateCategory = document.getElementById('btn-create-category');
const createSpinner = document.getElementById('create-spinner');

const sanitizedPreviewBox = document.getElementById('sanitized-preview-box');
const sanitizedPreviewText = document.getElementById('sanitized-preview-text');

const categoriesList = document.getElementById('categories-list');
const categoryCount = document.getElementById('category-count');

// Rename Modal
const renameModal = document.getElementById('rename-modal');
const renameOldName = document.getElementById('rename-old-name');
const inputRenameCategory = document.getElementById('input-rename-category');
const btnConfirmRename = document.getElementById('btn-confirm-rename');
const btnCancelRename = document.getElementById('btn-cancel-rename');

// State
let configuredSpreadsheetId = '';
let currentCategories = [];
let defaultCategory = 'General';
let targetRenameCategory = null;

/**
 * Initializes categories management page.
 */
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await loadSpreadsheetInfo();
  await refreshCategoriesList();
});

/**
 * Attaches event listeners.
 */
function setupEventListeners() {
  btnCloseAlert.addEventListener('click', () => alertBox.classList.add('hidden'));

  createForm.addEventListener('submit', handleCreateCategory);
  btnSyncSheets.addEventListener('click', handleSyncFromSheets);

  inputNewCategory.addEventListener('input', handleNameInputPreview);

  btnCancelRename.addEventListener('click', () => {
    renameModal.classList.add('hidden');
    targetRenameCategory = null;
  });

  btnConfirmRename.addEventListener('click', handleConfirmRename);
}

/**
 * Loads current spreadsheet information.
 */
async function loadSpreadsheetInfo() {
  const data = await chrome.storage.local.get(['google_spreadsheet_id', 'google_spreadsheet_title']);
  configuredSpreadsheetId = data.google_spreadsheet_id || '';
  const title = data.google_spreadsheet_title || 'No sheet connected';

  if (configuredSpreadsheetId) {
    activeSheetLabel.textContent = `Connected Spreadsheet: ${title} (${configuredSpreadsheetId})`;
  } else {
    activeSheetLabel.textContent = 'No Google Spreadsheet connected. Please configure in Settings.';
  }
}

/**
 * Live sanitization preview as user types.
 */
function handleNameInputPreview() {
  const raw = inputNewCategory.value;
  if (!raw.trim()) {
    sanitizedPreviewBox.classList.add('hidden');
    return;
  }

  const sanitized = sanitizeCategoryName(raw);
  if (sanitized && sanitized !== raw) {
    sanitizedPreviewText.textContent = sanitized;
    sanitizedPreviewBox.classList.remove('hidden');
  } else {
    sanitizedPreviewBox.classList.add('hidden');
  }
}

/**
 * Refreshes and renders categories list from storage.
 */
async function refreshCategoriesList() {
  const data = await chrome.storage.local.get(['business_categories', 'default_business_category']);
  currentCategories = data.business_categories || ['General', 'Software', 'Printing', 'Retail'];
  defaultCategory = data.default_business_category || 'General';

  categoryCount.textContent = currentCategories.length;
  renderCategories();
}

/**
 * Renders categories list in DOM.
 */
function renderCategories() {
  categoriesList.innerHTML = '';

  if (currentCategories.length === 0) {
    categoriesList.innerHTML = '<div class="category-row text-subtle">No categories defined yet.</div>';
    return;
  }

  currentCategories.forEach((cat) => {
    const isDefault = cat.toLowerCase() === defaultCategory.toLowerCase();

    const row = document.createElement('div');
    row.className = 'category-row';

    const info = document.createElement('div');
    info.className = 'category-info';

    const name = document.createElement('span');
    name.className = 'category-name';
    name.textContent = cat;
    info.appendChild(name);

    if (isDefault) {
      const defaultBadge = document.createElement('span');
      defaultBadge.className = 'badge-default';
      defaultBadge.textContent = 'DEFAULT';
      info.appendChild(defaultBadge);
    }

    const actions = document.createElement('div');
    actions.className = 'category-actions';

    if (!isDefault) {
      const btnSetDefault = document.createElement('button');
      btnSetDefault.type = 'button';
      btnSetDefault.className = 'btn-subtle';
      btnSetDefault.textContent = 'Make Default';
      btnSetDefault.addEventListener('click', () => handleSetDefault(cat));
      actions.appendChild(btnSetDefault);
    }

    const btnRename = document.createElement('button');
    btnRename.type = 'button';
    btnRename.className = 'btn-secondary btn-sm';
    btnRename.textContent = 'Rename';
    btnRename.addEventListener('click', () => openRenameModal(cat));
    actions.appendChild(btnRename);

    row.appendChild(info);
    row.appendChild(actions);
    categoriesList.appendChild(row);
  });
}

/**
 * Handles creating a new category tab in Google Sheets.
 */
async function handleCreateCategory(e) {
  e.preventDefault();
  const rawName = inputNewCategory.value.trim();

  const validation = validateCategoryName(rawName, currentCategories);
  if (!validation.isValid) {
    showAlert('error', validation.error);
    return;
  }

  if (!configuredSpreadsheetId) {
    showAlert('error', 'Please connect a Google Spreadsheet in Settings first.');
    return;
  }

  setCreatingState(true);

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'CREATE_CATEGORY',
      spreadsheetId: configuredSpreadsheetId,
      categoryName: validation.sanitizedName
    });

    if (res.success) {
      showAlert('success', `Category tab "${res.category}" created in your Google Spreadsheet!`);
      inputNewCategory.value = '';
      sanitizedPreviewBox.classList.add('hidden');
      await refreshCategoriesList();
    } else {
      showAlert('error', res.userMessage || res.error || 'Failed to create category sheet tab.');
    }
  } catch (err) {
    showAlert('error', err.message);
  } finally {
    setCreatingState(false);
  }
}

/**
 * Syncs categories directly from the connected Google Sheet tabs.
 */
async function handleSyncFromSheets() {
  if (!configuredSpreadsheetId) {
    showAlert('error', 'Please connect a Google Spreadsheet in Settings first.');
    return;
  }

  btnSyncSheets.disabled = true;
  btnSyncSheets.textContent = 'Syncing...';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'INIT_SPREADSHEET',
      spreadsheetId: configuredSpreadsheetId
    });

    if (res.success && res.categories) {
      showAlert('success', `Synchronized ${res.categories.length} category tabs from Google Sheets!`);
      await refreshCategoriesList();
    } else {
      showAlert('error', res.userMessage || res.error || 'Failed to sync categories.');
    }
  } catch (err) {
    showAlert('error', err.message);
  } finally {
    btnSyncSheets.disabled = false;
    btnSyncSheets.textContent = 'Sync from Google Sheets';
  }
}

/**
 * Opens rename dialog.
 */
function openRenameModal(categoryName) {
  targetRenameCategory = categoryName;
  renameOldName.textContent = categoryName;
  inputRenameCategory.value = categoryName;
  renameModal.classList.remove('hidden');
  inputRenameCategory.focus();
}

/**
 * Confirms renaming category in Google Sheets and local storage.
 */
async function handleConfirmRename() {
  if (!targetRenameCategory) return;
  const newName = inputRenameCategory.value.trim();

  const otherCats = currentCategories.filter((c) => c !== targetRenameCategory);
  const validation = validateCategoryName(newName, otherCats);

  if (!validation.isValid) {
    showAlert('error', validation.error);
    return;
  }

  btnConfirmRename.disabled = true;
  btnConfirmRename.textContent = 'Renaming...';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'RENAME_CATEGORY',
      spreadsheetId: configuredSpreadsheetId,
      oldName: targetRenameCategory,
      newName: validation.sanitizedName
    });

    if (res.success) {
      renameModal.classList.add('hidden');
      showAlert('success', `Category renamed to "${res.newName}" in Google Sheets!`);
      await refreshCategoriesList();
    } else {
      showAlert('error', res.userMessage || res.error || 'Failed to rename sheet tab.');
    }
  } catch (err) {
    showAlert('error', err.message);
  } finally {
    btnConfirmRename.disabled = false;
    btnConfirmRename.textContent = 'Confirm Rename';
    targetRenameCategory = null;
  }
}

/**
 * Sets a category as default.
 */
async function handleSetDefault(cat) {
  defaultCategory = cat;
  await chrome.storage.local.set({ default_business_category: cat });
  renderCategories();
  showAlert('success', `Default category updated to "${cat}".`);
}

function setCreatingState(creating) {
  btnCreateCategory.disabled = creating;
  if (creating) {
    createSpinner.classList.remove('hidden');
    btnCreateCategory.textContent = 'Creating Sheet Tab...';
  } else {
    createSpinner.classList.add('hidden');
    btnCreateCategory.textContent = 'Create Category Tab';
  }
}

function showAlert(type, msg) {
  alertBox.className = `alert ${type}`;
  alertText.textContent = msg;
  alertBox.classList.remove('hidden');
}
