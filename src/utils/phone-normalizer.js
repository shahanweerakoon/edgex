/**
 * Contact Number and WhatsApp Normalizer & Parser.
 * Strictly adheres to non-fabrication principles, preserving country codes and Sri Lankan (+94) numbers.
 */

/**
 * Extracts a phone number from common WhatsApp link formats.
 * Supported patterns:
 * - https://wa.me/94771234567
 * - https://wa.me/+94771234567
 * - https://api.whatsapp.com/send?phone=94771234567
 * - https://api.whatsapp.com/send/?phone=+94771234567&text=...
 * - whatsapp://send?phone=94771234567
 *
 * @param {string} rawUrl
 * @returns {string|null} - Extracted phone number with '+' prefix if international, or null
 */
export function extractWhatsAppNumberFromUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return null;
  const trimmed = rawUrl.trim();

  try {
    // Direct regex check for wa.me/NUMBER
    const waMeMatch = trimmed.match(/wa\.me\/(?:\+)?(\d{7,16})/i);
    if (waMeMatch) {
      return '+' + waMeMatch[1].replace(/^\+/, '');
    }

    // URL parameter check for phone=
    if (trimmed.includes('whatsapp.com') || trimmed.startsWith('whatsapp:')) {
      const parsed = new URL(trimmed.startsWith('whatsapp:') ? trimmed.replace('whatsapp:', 'https://whatsapp.com/') : trimmed);
      const phoneParam = parsed.searchParams.get('phone');
      if (phoneParam) {
        const cleanDigits = phoneParam.replace(/[^\d+]/g, '');
        if (cleanDigits.length >= 7) {
          return cleanDigits.startsWith('+') ? cleanDigits : '+' + cleanDigits;
        }
      }
    }
  } catch {
    // Fallback regex if URL parsing fails
    const fallbackMatch = trimmed.match(/phone=([+\d]+)/i);
    if (fallbackMatch) {
      const clean = fallbackMatch[1].replace(/[^\d+]/g, '');
      if (clean.length >= 7) {
        return clean.startsWith('+') ? clean : '+' + clean;
      }
    }
  }

  return null;
}

/**
 * Normalizes a raw contact phone number.
 * - Preserves leading '+' for international numbers.
 * - Handles Sri Lankan numbers cleanly (e.g. +94771234567 or local 0771234567).
 * - Removes noise characters (spaces, dashes, parens, dots).
 * - Never invents country codes when not present.
 *
 * @param {string} raw
 * @returns {string} - Cleaned phone number string or empty string
 */
export function normalizePhoneNumber(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const trimmed = raw.trim();

  // Check if international '+' prefix exists
  const hasPlus = trimmed.startsWith('+');

  // Strip all non-digits
  const digitsOnly = trimmed.replace(/\D/g, '');

  if (!digitsOnly) return '';

  // If number starts with 00 (international call prefix), normalize to +
  if (digitsOnly.startsWith('00') && digitsOnly.length > 9) {
    return '+' + digitsOnly.slice(2);
  }

  // If original had +, retain it
  if (hasPlus) {
    return '+' + digitsOnly;
  }

  // Preserve local formatting as entered (e.g., 0771234567 or 0112345678)
  return digitsOnly;
}

/**
 * Checks if a string looks like a valid phone number.
 * Requires at least 7 digits and at most 16 digits.
 *
 * @param {string} raw
 * @returns {boolean}
 */
export function isPossiblePhoneNumber(raw) {
  if (!raw || typeof raw !== 'string') return false;
  const digits = raw.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 16;
}

/**
 * Prioritizes contact number between WhatsApp and standard business phone:
 * Priority:
 * 1. Public WhatsApp number explicitly found
 * 2. Publicly displayed business phone number
 * 3. Empty string
 *
 * @param {object} contacts
 * @param {string|null} contacts.whatsapp
 * @param {string|null} contacts.phone
 * @returns {{ prioritizedNumber: string, isWhatsApp: boolean }}
 */
export function prioritizeContactNumber(contacts = {}) {
  let { whatsapp, phone } = contacts;

  // If whatsapp field contains a URL, extract the phone number from it
  if (whatsapp && (whatsapp.includes('wa.me') || whatsapp.includes('whatsapp.com') || whatsapp.startsWith('whatsapp:'))) {
    const extracted = extractWhatsAppNumberFromUrl(whatsapp);
    if (extracted) whatsapp = extracted;
  }

  // If phone field contains a tel: link, extract it
  if (phone && phone.toLowerCase().startsWith('tel:')) {
    phone = phone.replace(/^tel:/i, '');
  }

  if (whatsapp && isPossiblePhoneNumber(whatsapp)) {
    return {
      prioritizedNumber: normalizePhoneNumber(whatsapp),
      isWhatsApp: true
    };
  }

  if (phone && isPossiblePhoneNumber(phone)) {
    return {
      prioritizedNumber: normalizePhoneNumber(phone),
      isWhatsApp: false
    };
  }

  return {
    prioritizedNumber: '',
    isWhatsApp: false
  };
}

/**
 * Creates a normalized comparison key for duplicate phone matching.
 * Compares the last 9 digits of numbers to avoid country code mismatch
 * (e.g. comparing local 0771234567 with +94771234567 safely).
 *
 * @param {string} phone
 * @returns {string}
 */
export function getPhoneMatchKey(phone) {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7) return digits;
  // Return last 9 digits for matching
  return digits.slice(-9);
}
