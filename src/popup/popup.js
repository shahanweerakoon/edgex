/**
 * Facebook Lead Collector - Popup Controller
 */

import { validateLead } from '../utils/validation.js';
import { isFacebookUrl } from '../utils/url-normalizer.js';

// DOM Elements
const connectionBadge = document.getElementById('connection-badge');
const connectionStatusText = document.getElementById('connection-status-text');
const btnOpenSettings = document.getElementById('btn-open-settings');

const pageStatusBanner = document.getElementById('page-status-banner');
const pageStatusMessage = document.getElementById('page-status-message');
const alertBox = document.getElementById('alert-box');
const alertContent = document.getElementById('alert-content');
const alertClose = document.getElementById('alert-close');

const leadForm = document.getElementById('lead-form');
const inputName = document.getElementById('lead-name');
const inputPhone = document.getElementById('lead-phone');
const inputUrl = document.getElementById('lead-url');
const selectCategory = document.getElementById('lead-category');
const selectPageType = document.getElementById('lead-page-type');
const inputEmail = document.getElementById('lead-email');
const inputWebsite = document.getElementById('lead-website');
const inputAdditionalPhone = document.getElementById('lead-additional-phone');
const textareaNotes = document.getElementById('lead-notes');
const whatsappIndicator = document.getElementById('whatsapp-indicator');

const btnToggleOptional = document.getElementById('btn-toggle-optional');
const optionalFieldsContainer = document.getElementById('optional-fields-container');
const accordionIcon = document.getElementById('accordion-icon');

const btnQuickNewCategory = document.getElementById('btn-quick-new-category');
const inlineCategoryBox = document.getElementById('inline-category-box');
const inputInlineCategory = document.getElementById('input-inline-category');
const btnSaveInlineCategory = document.getElementById('btn-save-inline-category');
const btnCancelInlineCategory = document.getElementById('btn-cancel-inline-category');

const btnSaveLead = document.getElementById('btn-save-lead');
const btnSaveText = document.getElementById('btn-save-text');
const saveSpinner = document.getElementById('save-spinner');

const btnRefreshData = document.getElementById('btn-refresh-data');
const btnClearForm = document.getElementById('btn-clear-form');
const btnManageCategories = document.getElementById('btn-manage-categories');

// Duplicate Modal
const duplicateModal = document.getElementById('duplicate-modal');
const duplicateExplanation = document.getElementById('duplicate-explanation');
const dupExistingSummary = document.getElementById('dup-existing-summary');
const dupNewSummary = document.getElementById('dup-new-summary');
const btnDupUpdate = document.getElementById('btn-dup-update');
const btnDupSaveNew = document.getElementById('btn-dup-save-new');
const btnDupSkip = document.getElementById('btn-dup-skip');

// Partial Save Banner
const partialSaveBox = document.getElementById('partial-save-box');
const partialSaveText = document.getElementById('partial-save-text');
const btnRetrySync = document.getElementById('btn-retry-sync');

// State
let currentTab = null;
let currentDuplicateInfo = null;
let pendingPartialSave = null;
let isSaving = false;
let configuredSpreadsheetId = '';

/**
 * Initializes popup on DOM ready.
 */
document.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await checkConnectionStatus();
  await loadCategories();
  await inspectActiveTab();
});

/**
 * Attaches event listeners.
 */
function setupEventListeners() {
  btnOpenSettings.addEventListener('click', openSettings);
  connectionBadge.addEventListener('click', openSettings);

  btnToggleOptional.addEventListener('click', toggleOptionalFields);

  btnQuickNewCategory.addEventListener('click', () => {
    inlineCategoryBox.classList.remove('hidden');
    inputInlineCategory.focus();
  });

  btnCancelInlineCategory.addEventListener('click', () => {
    inlineCategoryBox.classList.add('hidden');
    inputInlineCategory.value = '';
  });

  btnSaveInlineCategory.addEventListener('click', handleCreateInlineCategory);

  leadForm.addEventListener('submit', handleFormSubmit);
  btnRefreshData.addEventListener('click', inspectActiveTab);
  btnClearForm.addEventListener('click', resetForm);
  btnManageCategories.addEventListener('click', openCategoriesManager);

  alertClose.addEventListener('click', () => alertBox.classList.add('hidden'));

  // Duplicate modal actions
  btnDupSkip.addEventListener('click', () => {
    duplicateModal.classList.add('hidden');
    currentDuplicateInfo = null;
  });

  btnDupUpdate.addEventListener('click', () => handleDuplicateResolution('update'));
  btnDupSaveNew.addEventListener('click', () => handleDuplicateResolution('save_anyway'));

  // Partial save retry
  btnRetrySync.addEventListener('click', handleRetryPartialSave);
}

/**
 * Checks Google OAuth and Google Sheets connection state.
 */
async function checkConnectionStatus() {
  try {
    const authStatus = await chrome.runtime.sendMessage({ action: 'CHECK_AUTH' });
    const storage = await chrome.storage.local.get(['google_spreadsheet_id', 'google_spreadsheet_title']);

    configuredSpreadsheetId = storage.google_spreadsheet_id || '';
    const sheetTitle = storage.google_spreadsheet_title || 'Sheets';

    if (authStatus.isAuthenticated && configuredSpreadsheetId) {
      connectionBadge.className = 'connection-pill connected';
      connectionStatusText.textContent = `Connected: ${sheetTitle.length > 14 ? sheetTitle.slice(0, 12) + '...' : sheetTitle}`;
      connectionBadge.title = `Google Account connected. Target sheet: ${sheetTitle} (${configuredSpreadsheetId})`;
    } else if (authStatus.isAuthenticated) {
      connectionBadge.className = 'connection-pill disconnected';
      connectionStatusText.textContent = 'Sheet Not Selected';
      connectionBadge.title = 'Google Account connected, but no Spreadsheet is selected. Click to configure in Settings.';
    } else {
      connectionBadge.className = 'connection-pill disconnected';
      connectionStatusText.textContent = 'Not Connected';
      connectionBadge.title = 'Not connected to Google Sheets. Click to sign in.';
    }
  } catch (err) {
    connectionBadge.className = 'connection-pill disconnected';
    connectionStatusText.textContent = 'Error';
  }
}

/**
 * Loads available business categories from storage into dropdown.
 */
async function loadCategories() {
  try {
    const data = await chrome.storage.local.get(['business_categories', 'default_business_category']);
    const categories = data.business_categories || ['General', 'Software', 'Printing', 'Retail'];
    const defaultCat = data.default_business_category || 'General';

    selectCategory.innerHTML = '';
    categories.forEach((cat) => {
      const opt = document.createElement('option');
      opt.value = cat;
      opt.textContent = cat;
      if (cat === defaultCat) opt.selected = true;
      selectCategory.appendChild(opt);
    });
  } catch {
    // Keep fallback
  }
}

/**
 * Inspects active browser tab and triggers extraction if on Facebook.
 */
async function inspectActiveTab() {
  setPageStatus('detecting', 'Inspecting active tab...');

  try {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tabs || tabs.length === 0) {
      setPageStatus('warning', 'Unable to detect active tab. You can enter details manually.');
      return;
    }

    currentTab = tabs[0];
    const tabUrl = currentTab.url || '';

    if (!isFacebookUrl(tabUrl)) {
      setPageStatus('warning', 'Not a Facebook page. You can still enter lead info manually.');
      inputUrl.value = tabUrl;
      return;
    }

    // Attempt sending extraction message to content script
    try {
      const response = await chrome.tabs.sendMessage(currentTab.id, { action: 'EXTRACT_PAGE_DATA' });
      if (response && response.success && response.lead) {
        populateExtractedData(response.lead);
        setPageStatus('ready', 'Facebook lead data extracted and ready to review.');
        return;
      }
    } catch {
      // Content script may not have injected yet (e.g. freshly opened tab), inject manually
      try {
        await chrome.scripting.executeScript({
          target: { tabId: currentTab.id },
          files: ['src/content/facebook-extractor.js']
        });
        // Retry message
        const retryRes = await chrome.tabs.sendMessage(currentTab.id, { action: 'EXTRACT_PAGE_DATA' });
        if (retryRes && retryRes.success && retryRes.lead) {
          populateExtractedData(retryRes.lead);
          setPageStatus('ready', 'Facebook lead data extracted and ready to review.');
          return;
        }
      } catch (injectErr) {
        // Fallback: populate URL from tab
        inputUrl.value = tabUrl;
        setPageStatus('warning', 'Unable to inspect page DOM automatically. Please verify fields manually.');
        return;
      }
    }

    inputUrl.value = tabUrl;
    setPageStatus('warning', 'No lead info detected automatically. Please fill in fields.');
  } catch (err) {
    setPageStatus('warning', 'Extraction error. Please enter lead information manually.');
  }
}

/**
 * Populates form fields with extracted data.
 */
function populateExtractedData(lead) {
  if (lead.name) inputName.value = lead.name;
  if (lead.url) inputUrl.value = lead.url;
  if (lead.phone) inputPhone.value = lead.phone;
  if (lead.email) inputEmail.value = lead.email;
  if (lead.website) inputWebsite.value = lead.website;
  if (lead.additionalPhone) inputAdditionalPhone.value = lead.additionalPhone;

  // Page type selector
  if (lead.pageType) {
    const pageTypeOptions = Array.from(selectPageType.options).map((o) => o.value);
    if (pageTypeOptions.includes(lead.pageType)) {
      selectPageType.value = lead.pageType;
    }
  }

  // Category matching
  if (lead.category && lead.category !== 'General') {
    const existingCats = Array.from(selectCategory.options).map((o) => o.value.toLowerCase());
    const matchIdx = existingCats.indexOf(lead.category.toLowerCase());
    if (matchIdx >= 0) {
      selectCategory.selectedIndex = matchIdx;
    } else {
      // Add detected category to dropdown
      const newOpt = document.createElement('option');
      newOpt.value = lead.category;
      newOpt.textContent = lead.category;
      newOpt.selected = true;
      selectCategory.appendChild(newOpt);
    }
  }

  // WhatsApp Indicator Badge
  if (lead.isWhatsApp) {
    whatsappIndicator.classList.remove('hidden');
  } else {
    whatsappIndicator.classList.add('hidden');
  }

  // Expand optional fields if email or website was extracted
  if (lead.email || lead.website) {
    showOptionalFields();
  }
}

/**
 * Handles creating a new category inline from the popup.
 */
async function handleCreateInlineCategory() {
  const name = inputInlineCategory.value.trim();
  if (!name) return;

  if (!configuredSpreadsheetId) {
    showAlert('error', 'Please configure and connect a Google Spreadsheet in Settings first.');
    return;
  }

  btnSaveInlineCategory.disabled = true;
  btnSaveInlineCategory.textContent = '...';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'CREATE_CATEGORY',
      spreadsheetId: configuredSpreadsheetId,
      categoryName: name
    });

    if (res.success && res.category) {
      await loadCategories();
      selectCategory.value = res.category;
      inlineCategoryBox.classList.add('hidden');
      inputInlineCategory.value = '';
      showAlert('success', `Category tab "${res.category}" created in Google Sheets.`);
    } else {
      showAlert('error', res.userMessage || res.error || 'Failed to create category.');
    }
  } catch (err) {
    showAlert('error', err.message);
  } finally {
    btnSaveInlineCategory.disabled = false;
    btnSaveInlineCategory.textContent = 'Create';
  }
}

/**
 * Form submission handler.
 */
async function handleFormSubmit(e) {
  e.preventDefault();
  if (isSaving) return;

  // Clear previous errors
  clearFieldErrors();
  alertBox.classList.add('hidden');

  // Build payload
  const leadPayload = {
    name: inputName.value.trim(),
    phone: inputPhone.value.trim(),
    url: inputUrl.value.trim(),
    category: selectCategory.value,
    pageType: selectPageType.value,
    email: inputEmail.value.trim(),
    website: inputWebsite.value.trim(),
    additionalPhone: inputAdditionalPhone.value.trim(),
    notes: textareaNotes.value.trim(),
    source: 'Facebook Lead Collector'
  };

  // Client-side validation
  const validation = validateLead(leadPayload);
  if (!validation.isValid) {
    showFieldErrors(validation.errors);
    showAlert('error', 'Please correct the highlighted fields before saving.');
    return;
  }

  // Check spreadsheet configuration
  if (!configuredSpreadsheetId) {
    showAlert(
      'error',
      'No Google Spreadsheet connected! Please open Settings, connect your Google account, and select a spreadsheet.'
    );
    return;
  }

  // Save Lead
  await executeSave(leadPayload, false, 'skip');
}

/**
 * Sends save request to background service worker.
 */
async function executeSave(lead, allowDuplicate = false, duplicateAction = 'skip') {
  setSavingState(true);

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'SAVE_LEAD_REQUEST',
      spreadsheetId: configuredSpreadsheetId,
      lead,
      allowDuplicate,
      duplicateAction
    });

    if (res.status === 'duplicate_detected') {
      currentDuplicateInfo = res.duplicateInfo;
      showDuplicateModal(res.lead, res.duplicateInfo);
      setSavingState(false);
      return;
    }

    if (res.success) {
      showAlert('success', `Lead "${res.lead.name}" saved successfully to "${res.lead.category}" and "All Leads"!`);
      setPageStatus('ready', 'Lead successfully saved to Google Sheets.');
      // Keep form intact for user confirmation
    } else {
      showAlert('error', res.userMessage || res.error || 'Could not save lead to Google Sheets.');
    }
  } catch (err) {
    if (err.code === 'PARTIAL_SAVE_ERROR' || err.message?.includes('PARTIAL_SAVE_ERROR')) {
      showPartialSaveWarning(err);
    } else {
      showAlert('error', err.userMessage || err.message || 'An error occurred while saving.');
    }
  } finally {
    setSavingState(false);
  }
}

/**
 * Handles duplicate modal resolution (Update or Save As New).
 */
async function handleDuplicateResolution(action) {
  duplicateModal.classList.add('hidden');
  const leadPayload = {
    name: inputName.value.trim(),
    phone: inputPhone.value.trim(),
    url: inputUrl.value.trim(),
    category: selectCategory.value,
    pageType: selectPageType.value,
    email: inputEmail.value.trim(),
    website: inputWebsite.value.trim(),
    additionalPhone: inputAdditionalPhone.value.trim(),
    notes: textareaNotes.value.trim(),
    source: 'Facebook Lead Collector'
  };

  if (action === 'update' && currentDuplicateInfo) {
    setSavingState(true);
    try {
      const res = await chrome.runtime.sendMessage({
        action: 'UPDATE_LEAD_REQUEST',
        spreadsheetId: configuredSpreadsheetId,
        lead: leadPayload,
        duplicateInfo: currentDuplicateInfo
      });
      if (res.success) {
        showAlert('success', `Existing lead "${res.lead.name}" updated successfully.`);
      } else {
        showAlert('error', res.userMessage || res.error || 'Failed to update lead.');
      }
    } catch (err) {
      showAlert('error', err.message);
    } finally {
      setSavingState(false);
      currentDuplicateInfo = null;
    }
  } else if (action === 'save_anyway') {
    await executeSave(leadPayload, true, 'save_anyway');
    currentDuplicateInfo = null;
  }
}

/**
 * Displays duplicate warning modal.
 */
function showDuplicateModal(newLead, dupInfo) {
  const matchType = dupInfo.matchType === 'phone' ? 'Phone Number' : 'Facebook Page / Profile Link';
  duplicateExplanation.textContent = `A lead with matching ${matchType} ("${dupInfo.matchedValue}") already exists.`;

  const existing = dupInfo.existingLead || {};
  dupExistingSummary.textContent = `${existing.name || 'Unknown'} (${existing.category || 'General'}) - ${existing.phone || 'No phone'}`;
  dupNewSummary.textContent = `${newLead.name} (${newLead.category}) - ${newLead.phone || 'No phone'}`;

  duplicateModal.classList.remove('hidden');
}

/**
 * Displays partial save banner.
 */
function showPartialSaveWarning(err) {
  pendingPartialSave = err.details || {};
  partialSaveText.textContent = err.userMessage || 'Lead saved to one sheet, but writing to second sheet failed.';
  partialSaveBox.classList.remove('hidden');
}

/**
 * Retries partial save reconciliation.
 */
async function handleRetryPartialSave() {
  if (!pendingPartialSave || !pendingPartialSave.leadData) return;

  btnRetrySync.disabled = true;
  btnRetrySync.textContent = 'Retrying...';

  try {
    const res = await chrome.runtime.sendMessage({
      action: 'RECONCILE_PARTIAL_SAVE',
      spreadsheetId: configuredSpreadsheetId,
      leadData: pendingPartialSave.leadData,
      partialInfo: pendingPartialSave
    });

    if (res.success) {
      partialSaveBox.classList.add('hidden');
      pendingPartialSave = null;
      showAlert('success', 'Synchronization completed! Both sheets are now updated.');
    } else {
      showAlert('error', 'Retry failed. Check your spreadsheet permissions.');
    }
  } catch (err) {
    showAlert('error', err.message);
  } finally {
    btnRetrySync.disabled = false;
    btnRetrySync.textContent = 'Retry Sync';
  }
}

/**
 * Helpers
 */
function setSavingState(saving) {
  isSaving = saving;
  btnSaveLead.disabled = saving;
  if (saving) {
    saveSpinner.classList.remove('hidden');
    btnSaveText.textContent = 'Saving to Google Sheets...';
  } else {
    saveSpinner.classList.add('hidden');
    btnSaveText.textContent = 'Save Lead to Google Sheets';
  }
}

function setPageStatus(type, msg) {
  pageStatusBanner.className = `status-banner ${type}`;
  pageStatusMessage.textContent = msg;
}

function showAlert(type, message) {
  alertBox.className = `alert ${type}`;
  alertContent.textContent = message;
  alertBox.classList.remove('hidden');
}

function clearFieldErrors() {
  ['lead-name', 'lead-phone', 'lead-url', 'lead-category', 'lead-email', 'lead-website'].forEach((id) => {
    const input = document.getElementById(id);
    const err = document.getElementById(`error-${id}`);
    if (input) input.classList.remove('is-invalid');
    if (err) {
      err.textContent = '';
      err.classList.add('hidden');
    }
  });
}

function showFieldErrors(errors) {
  const map = {
    name: 'lead-name',
    phone: 'lead-phone',
    url: 'lead-url',
    category: 'lead-category',
    email: 'lead-email',
    website: 'lead-website'
  };

  Object.entries(errors).forEach(([field, msg]) => {
    const id = map[field];
    if (!id) return;
    const input = document.getElementById(id);
    const err = document.getElementById(`error-${id}`);
    if (input) input.classList.add('is-invalid');
    if (err) {
      err.textContent = msg;
      err.classList.remove('hidden');
    }
  });
}

function toggleOptionalFields() {
  const isHidden = optionalFieldsContainer.classList.contains('hidden');
  if (isHidden) {
    showOptionalFields();
  } else {
    optionalFieldsContainer.classList.add('hidden');
    btnToggleOptional.setAttribute('aria-expanded', 'false');
    accordionIcon.style.transform = 'rotate(0deg)';
  }
}

function showOptionalFields() {
  optionalFieldsContainer.classList.remove('hidden');
  btnToggleOptional.setAttribute('aria-expanded', 'true');
  accordionIcon.style.transform = 'rotate(90deg)';
}

function resetForm() {
  leadForm.reset();
  whatsappIndicator.classList.add('hidden');
  clearFieldErrors();
  alertBox.classList.add('hidden');
}

function openSettings() {
  if (chrome.runtime.openOptionsPage) {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/settings/settings.html') });
  } else {
    window.open(chrome.runtime.getURL('src/settings/settings.html'));
  }
}

function openCategoriesManager() {
  chrome.tabs.create({ url: chrome.runtime.getURL('src/options/categories.html') });
}
