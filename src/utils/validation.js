/**
 * Validation and sanitization utilities for leads and categories.
 */

import { isFacebookUrl, normalizeFacebookUrl } from './url-normalizer.js';
import { isPossiblePhoneNumber } from './phone-normalizer.js';

// Reserved master sheet name
export const MASTER_SHEET_NAME = 'All Leads';

// Invalid characters in Google Sheets tab names: * ? : / \ [ ] ' (at start/end)
const FORBIDDEN_SHEET_CHARS_REGEX = /[*?:/\\\[\]]/g;

/**
 * Validates a business category name for Google Sheets compatibility.
 *
 * @param {string} name
 * @param {string[]} [existingCategories=[]] - List of current category names
 * @returns {{ isValid: boolean, error: string|null, sanitizedName: string, changed: boolean }}
 */
export function validateCategoryName(name, existingCategories = []) {
  if (!name || typeof name !== 'string' || !name.trim()) {
    return {
      isValid: false,
      error: 'Category name cannot be empty.',
      sanitizedName: '',
      changed: false
    };
  }

  const trimmed = name.trim();
  const sanitized = sanitizeCategoryName(trimmed);
  const changed = trimmed !== sanitized;

  if (!sanitized) {
    return {
      isValid: false,
      error: 'Category name contains only invalid characters.',
      sanitizedName: '',
      changed: true
    };
  }

  if (sanitized.length > 100) {
    return {
      isValid: false,
      error: 'Category name cannot exceed 100 characters.',
      sanitizedName: sanitized.slice(0, 100),
      changed: true
    };
  }

  // Reserved sheet name check
  if (sanitized.toLowerCase() === MASTER_SHEET_NAME.toLowerCase()) {
    return {
      isValid: false,
      error: `"${MASTER_SHEET_NAME}" is reserved for the master tab and cannot be used as a category name.`,
      sanitizedName: sanitized,
      changed
    };
  }

  // Duplicate / case-insensitive collision check
  const collision = existingCategories.find(
    (cat) => cat.trim().toLowerCase() === sanitized.toLowerCase()
  );

  if (collision) {
    return {
      isValid: false,
      error: `A category named "${collision}" already exists.`,
      sanitizedName: sanitized,
      changed
    };
  }

  return {
    isValid: true,
    error: null,
    sanitizedName: sanitized,
    changed
  };
}

/**
 * Sanitizes a category name by removing characters forbidden by Google Sheets.
 *
 * @param {string} name
 * @returns {string}
 */
export function sanitizeCategoryName(name) {
  if (!name || typeof name !== 'string') return '';
  let clean = name.trim();

  // Replace forbidden characters (*, ?, :, /, \, [, ]) with hyphens
  clean = clean.replace(FORBIDDEN_SHEET_CHARS_REGEX, '-');

  // Remove leading and trailing apostrophes (') which Sheets disallows
  clean = clean.replace(/^'+|'+$/g, '');

  // Collapse consecutive spaces and hyphens
  clean = clean.replace(/\s+/g, ' ').replace(/-+/g, '-').trim();

  // Strip leading and trailing hyphens and whitespace
  clean = clean.replace(/^[\s-]+|[\s-]+$/g, '');

  // Truncate to 100 characters
  if (clean.length > 100) {
    clean = clean.slice(0, 100).trim().replace(/^[\s-]+|[\s-]+$/g, '');
  }

  return clean;
}

/**
 * Validates a lead payload before attempting to save to Google Sheets.
 *
 * @param {object} lead
 * @param {string} lead.name - Business / Personal Name
 * @param {string} lead.url - Facebook URL
 * @param {string} lead.category - Business Category
 * @param {string} [lead.phone] - WhatsApp / Contact Number
 * @param {string} [lead.email] - Optional Email
 * @param {string} [lead.website] - Optional Website
 * @returns {{ isValid: boolean, errors: Record<string, string>, normalizedLead: object }}
 */
export function validateLead(lead = {}) {
  const errors = {};

  // 1. Required: Name
  const name = typeof lead.name === 'string' ? lead.name.trim() : '';
  if (!name) {
    errors.name = 'Business / Personal Name is required.';
  } else if (name.length > 255) {
    errors.name = 'Name must not exceed 255 characters.';
  }

  // 2. Required: Facebook URL
  const rawUrl = typeof lead.url === 'string' ? lead.url.trim() : '';
  let normalizedUrl = '';
  if (!rawUrl) {
    errors.url = 'Facebook Page or Profile Link is required.';
  } else {
    try {
      normalizedUrl = normalizeFacebookUrl(rawUrl);
      if (!normalizedUrl) {
        errors.url = 'Please enter a valid URL.';
      }
    } catch {
      errors.url = 'Invalid URL format.';
    }
  }

  // 3. Required: Category
  const rawCategory = typeof lead.category === 'string' ? lead.category.trim() : '';
  const categoryValidation = validateCategoryName(rawCategory);
  if (!rawCategory) {
    errors.category = 'Business Category is required.';
  } else if (!categoryValidation.isValid && rawCategory.toLowerCase() === MASTER_SHEET_NAME.toLowerCase()) {
    errors.category = categoryValidation.error;
  }

  // 4. Contact Phone (Optional but must be valid if provided)
  const phone = typeof lead.phone === 'string' ? lead.phone.trim() : '';
  if (phone && !isPossiblePhoneNumber(phone)) {
    errors.phone = 'Please enter a valid phone number (7-16 digits) with optional country code.';
  }

  // 5. Email (Optional)
  const email = typeof lead.email === 'string' ? lead.email.trim() : '';
  if (email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      errors.email = 'Please enter a valid email address.';
    }
  }

  // 6. Website (Optional)
  const website = typeof lead.website === 'string' ? lead.website.trim() : '';
  if (website) {
    try {
      const parsedWeb = new URL(website.startsWith('http') ? website : `https://${website}`);
      if (!parsedWeb.hostname.includes('.')) {
        errors.website = 'Please enter a valid website URL.';
      }
    } catch {
      errors.website = 'Please enter a valid website URL.';
    }
  }

  const isValid = Object.keys(errors).length === 0;

  return {
    isValid,
    errors,
    normalizedLead: {
      ...lead,
      name,
      url: normalizedUrl || rawUrl,
      category: categoryValidation.sanitizedName || rawCategory,
      phone,
      email,
      website
    }
  };
}
