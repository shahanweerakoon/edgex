/**
 * Utility functions for Facebook URL parsing, sanitization, and normalization.
 */

// Tracking and noise query parameters that Facebook appends
const FB_TRACKING_PARAMS = new Set([
  'fbclid',
  'ref',
  'refsrc',
  'ref_component',
  'ref_page',
  'fref',
  'hc_ref',
  'hc_location',
  '__tn__',
  '__cft__',
  '__cft__[0]',
  'eid',
  'notif_t',
  'notif_id',
  'paipv',
  'rdid',
  'extid',
  'mibextid',
  'locale',
  '_rdr',
  'show_switched_toast',
  'show_switched_tooltip',
  'is_tour_dismissed',
  'sk', // e.g. ?sk=about, will be handled specifically
  'source'
]);

/**
 * Validates if a string is a valid Facebook URL.
 * @param {string} rawUrl
 * @returns {boolean}
 */
export function isFacebookUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return false;
  try {
    const url = new URL(rawUrl.trim());
    const host = url.hostname.toLowerCase();
    return (
      host === 'facebook.com' ||
      host.endsWith('.facebook.com') ||
      host === 'fb.me' ||
      host.endsWith('.fb.me') ||
      host === 'fb.watch'
    );
  } catch {
    return false;
  }
}

/**
 * Normalizes a Facebook URL to a canonical, tracking-free format suitable for deduplication.
 * Preserves essential identifiers like user/page handles, group IDs, profile IDs, and post IDs.
 *
 * @param {string} rawUrl - Raw URL string
 * @returns {string} - Clean canonical URL string
 */
export function normalizeFacebookUrl(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  let trimmed = rawUrl.trim();

  // If scheme is missing, prepend https://
  if (!/^https?:\/\//i.test(trimmed)) {
    trimmed = 'https://' + trimmed;
  }

  try {
    const parsed = new URL(trimmed);

    // Standardize domain to www.facebook.com for consistency
    const host = parsed.hostname.toLowerCase();
    if (host === 'facebook.com' || host.endsWith('.facebook.com')) {
      parsed.hostname = 'www.facebook.com';
      parsed.protocol = 'https:';
    } else {
      // Return cleaned non-facebook URL if passed
      return parsed.href.replace(/\/+$/, '');
    }

    // Handle Facebook redirect links (l.facebook.com/l.php?u=...)
    if (host === 'l.facebook.com' || parsed.pathname === '/l.php') {
      const target = parsed.searchParams.get('u');
      if (target) {
        return normalizeFacebookUrl(decodeURIComponent(target));
      }
    }

    // Clean tracking query parameters
    const paramsToKeep = new URLSearchParams();
    for (const [key, val] of parsed.searchParams.entries()) {
      const lowerKey = key.toLowerCase();
      // Keep 'id' for profile.php or group.php
      if (lowerKey === 'id' || lowerKey === 'story_fbid' || lowerKey === 'fbid' || lowerKey === 'v') {
        paramsToKeep.set(key, val);
      } else if (!FB_TRACKING_PARAMS.has(lowerKey) && !lowerKey.startsWith('__')) {
        // Keep unknown but potentially structural params, unless it's known tracking
        paramsToKeep.set(key, val);
      }
    }

    // Handle special path conventions
    let pathname = parsed.pathname;

    // Remove language or mobile prefixes if any in path
    pathname = pathname.replace(/\/+$/, ''); // remove trailing slashes

    // Build the canonical URL
    const search = paramsToKeep.toString() ? `?${paramsToKeep.toString()}` : '';
    const cleanUrl = `https://www.facebook.com${pathname}${search}`;

    return cleanUrl;
  } catch {
    // If URL parsing fails, return trimmed stripped string
    return trimmed.replace(/[?#].*$/, '').replace(/\/+$/, '');
  }
}

/**
 * Unwraps Facebook outbound redirect links (e.g. l.facebook.com/l.php?u=...).
 *
 * @param {string} rawUrl
 * @returns {string} - Unwrapped direct destination URL or original URL
 */
export function unwrapFacebookRedirect(rawUrl) {
  if (!rawUrl || typeof rawUrl !== 'string') return '';
  try {
    const url = new URL(rawUrl.trim());
    if (url.hostname.includes('facebook.com') && (url.pathname === '/l.php' || url.searchParams.has('u'))) {
      const destination = url.searchParams.get('u');
      if (destination) {
        return decodeURIComponent(destination);
      }
    }
    return rawUrl.trim();
  } catch {
    return rawUrl.trim();
  }
}

/**
 * Categorizes a Facebook URL into page type.
 *
 * @param {string} rawUrl
 * @returns {'Business Page'|'Public Group'|'Personal Profile'|'Post'|'Event'|'Marketplace'|'Other Facebook Page'}
 */
export function extractFacebookPageType(rawUrl) {
  if (!isFacebookUrl(rawUrl)) return 'Other Facebook Page';
  try {
    const url = new URL(rawUrl.trim());
    const path = url.pathname.toLowerCase();

    if (path.includes('/groups/')) {
      if (path.includes('/posts/') || path.includes('/permalink/')) {
        return 'Post';
      }
      return 'Public Group';
    }

    if (path.includes('/posts/') || path.includes('/videos/') || path.includes('/photos/') || path.includes('/story.php')) {
      return 'Post';
    }

    if (path.includes('/events/')) {
      return 'Event';
    }

    if (path.includes('/marketplace/')) {
      return 'Marketplace';
    }

    if (path === '/profile.php' || path.startsWith('/profile.php')) {
      return 'Personal Profile';
    }

    if (path.includes('/people/')) {
      return 'Personal Profile';
    }

    // Default top-level paths like /company-name or /brand are usually Pages
    const segments = path.split('/').filter(Boolean);
    if (segments.length === 1) {
      return 'Business Page';
    }

    return 'Business Page';
  } catch {
    return 'Other Facebook Page';
  }
}
