/**
 * Google OAuth 2.0 authentication service for Microsoft Edge & Chromium Manifest V3 extensions.
 * Uses chrome.identity.launchWebAuthFlow with OAuth 2.0 Web Client standards.
 */

import { AuthError, NetworkError } from '../utils/errors.js';

// Required Google OAuth Scopes
export const OAUTH_SCOPES = [
  'https://www.googleapis.com/auth/spreadsheets',
  'https://www.googleapis.com/auth/drive.file',
  'https://www.googleapis.com/auth/userinfo.email',
  'https://www.googleapis.com/auth/userinfo.profile'
];

const STORAGE_KEYS = {
  ACCESS_TOKEN: 'google_access_token',
  TOKEN_EXPIRY: 'google_token_expiry',
  CLIENT_ID: 'google_client_id',
  USER_INFO: 'google_user_info'
};

/**
 * Gets the standard Chromium/Edge redirect URI for this extension.
 * e.g. https://<extension-id>.chromiumapp.org/
 *
 * @returns {string}
 */
export function getRedirectUri() {
  if (typeof chrome !== 'undefined' && chrome.identity && chrome.identity.getRedirectURL) {
    return chrome.identity.getRedirectURL();
  }
  // Fallback if running outside extension context
  const extensionId = typeof chrome !== 'undefined' && chrome.runtime?.id ? chrome.runtime.id : 'extension-id';
  return `https://${extensionId}.chromiumapp.org/`;
}

/**
 * Retrieves the configured Google OAuth Client ID from storage or environment.
 *
 * @returns {Promise<string>}
 */
export async function getClientId() {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    const data = await chrome.storage.local.get(STORAGE_KEYS.CLIENT_ID);
    if (data[STORAGE_KEYS.CLIENT_ID]) {
      return data[STORAGE_KEYS.CLIENT_ID].trim();
    }
  }
  return '';
}

/**
 * Persists the Google OAuth Client ID in storage.
 *
 * @param {string} clientId
 * @returns {Promise<void>}
 */
export async function setClientId(clientId) {
  if (typeof chrome !== 'undefined' && chrome.storage?.local) {
    await chrome.storage.local.set({
      [STORAGE_KEYS.CLIENT_ID]: clientId ? clientId.trim() : ''
    });
  }
}

/**
 * Retrieves the cached token from storage if not expired.
 *
 * @returns {Promise<string|null>}
 */
export async function getStoredToken() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;

  const data = await chrome.storage.local.get([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.TOKEN_EXPIRY
  ]);

  const token = data[STORAGE_KEYS.ACCESS_TOKEN];
  const expiry = data[STORAGE_KEYS.TOKEN_EXPIRY];

  // Check if token exists and is valid for at least 60 seconds
  if (token && expiry && Date.now() < expiry - 60000) {
    return token;
  }

  return null;
}

/**
 * Stores the OAuth access token and expiration time.
 *
 * @param {string} token
 * @param {number} expiresInSeconds
 * @returns {Promise<void>}
 */
export async function storeToken(token, expiresInSeconds = 3600) {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

  const expiry = Date.now() + expiresInSeconds * 1000;
  await chrome.storage.local.set({
    [STORAGE_KEYS.ACCESS_TOKEN]: token,
    [STORAGE_KEYS.TOKEN_EXPIRY]: expiry
  });
}

/**
 * Clears stored OAuth tokens and user info from storage.
 *
 * @returns {Promise<void>}
 */
export async function clearStoredToken() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return;

  await chrome.storage.local.remove([
    STORAGE_KEYS.ACCESS_TOKEN,
    STORAGE_KEYS.TOKEN_EXPIRY,
    STORAGE_KEYS.USER_INFO
  ]);
}

/**
 * Launches the OAuth 2.0 Web Authentication flow.
 *
 * @param {object} [options={}]
 * @param {boolean} [options.interactive=true] - Whether to show prompt to user
 * @param {boolean} [options.forceConsent=false] - Whether to force consent dialog
 * @returns {Promise<string>} - The valid access token
 */
export async function authenticate({ interactive = true, forceConsent = false } = {}) {
  // 1. Check if existing stored token is still valid
  if (!forceConsent) {
    const existingToken = await getStoredToken();
    if (existingToken) {
      return existingToken;
    }
  }

  // 2. Retrieve configured Client ID
  const clientId = await getClientId();
  if (!clientId) {
    throw new AuthError(
      'Google OAuth Client ID is not configured.',
      'Google OAuth Client ID is missing. Please enter your Client ID in Settings.',
      'MISSING_CLIENT_ID',
      {},
      'Open the Extension Settings page and enter your Google OAuth 2.0 Client ID.'
    );
  }

  // 3. Construct OAuth URL
  const redirectUri = getRedirectUri();
  const authUrl = new URL('https://accounts.google.com/o/oauth2/v2/auth');
  authUrl.searchParams.set('client_id', clientId);
  authUrl.searchParams.set('response_type', 'token');
  authUrl.searchParams.set('redirect_uri', redirectUri);
  authUrl.searchParams.set('scope', OAUTH_SCOPES.join(' '));

  if (forceConsent) {
    authUrl.searchParams.set('prompt', 'consent');
  }

  // 4. Launch WebAuthFlow
  if (typeof chrome === 'undefined' || !chrome.identity?.launchWebAuthFlow) {
    throw new AuthError(
      'chrome.identity API is unavailable in this environment.',
      'Identity service unavailable. Ensure the extension is loaded with proper permissions.',
      'IDENTITY_API_UNAVAILABLE'
    );
  }

  let responseUrl;
  try {
    responseUrl = await new Promise((resolve, reject) => {
      chrome.identity.launchWebAuthFlow(
        {
          url: authUrl.toString(),
          interactive
        },
        (redirectResult) => {
          if (chrome.runtime.lastError) {
            return reject(new Error(chrome.runtime.lastError.message));
          }
          if (!redirectResult) {
            return reject(new Error('Authentication was cancelled or failed with empty response.'));
          }
          resolve(redirectResult);
        }
      );
    });
  } catch (err) {
    const msg = err.message || '';
    if (msg.includes('user cancelled') || msg.includes('User cancelled')) {
      throw new AuthError('Sign-in cancelled by user.', 'Sign-in cancelled.', 'AUTH_CANCELLED');
    }
    if (msg.includes('redirect_uri_mismatch')) {
      throw new AuthError(
        `Redirect URI mismatch. Google Cloud expected: ${redirectUri}`,
        `Redirect URI mismatch. Please add "${redirectUri}" to Authorized Redirect URIs in your Google Cloud Console.`,
        'REDIRECT_URI_MISMATCH',
        { redirectUri },
        `Add "${redirectUri}" to your Google Cloud OAuth Client configuration.`
      );
    }
    throw new AuthError(
      `Authentication flow error: ${msg}`,
      'Google Sign-in failed. Check your network connection and OAuth setup.',
      'AUTH_FLOW_ERROR',
      { originalError: msg }
    );
  }

  // 5. Parse token and expiry from redirect URL hash
  const hash = responseUrl.split('#')[1];
  if (!hash) {
    throw new AuthError('OAuth response did not contain access token.', 'Failed to receive access token.', 'NO_TOKEN_IN_RESPONSE');
  }

  const params = new URLSearchParams(hash);
  const error = params.get('error');
  if (error) {
    const errorDescription = params.get('error_description') || error;
    throw new AuthError(
      `OAuth error: ${errorDescription}`,
      `Google Sign-in was denied: ${errorDescription}`,
      'OAUTH_DENIED'
    );
  }

  const accessToken = params.get('access_token');
  const expiresIn = parseInt(params.get('expires_in') || '3600', 10);

  if (!accessToken) {
    throw new AuthError('Access token missing from OAuth redirect response.', 'No access token received.', 'EMPTY_ACCESS_TOKEN');
  }

  // 6. Cache token
  await storeToken(accessToken, expiresIn);

  // 7. Fetch user profile in background to store email/name
  try {
    await fetchAndStoreUserInfo(accessToken);
  } catch {
    // Non-fatal if user info fetch fails
  }

  return accessToken;
}

/**
 * Fetches the user profile from Google and stores it in storage.
 *
 * @param {string} token
 * @returns {Promise<object>}
 */
export async function fetchAndStoreUserInfo(token) {
  try {
    const res = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
      headers: { Authorization: `Bearer ${token}` }
    });
    if (!res.ok) return null;
    const info = await res.json();
    if (typeof chrome !== 'undefined' && chrome.storage?.local) {
      await chrome.storage.local.set({
        [STORAGE_KEYS.USER_INFO]: {
          email: info.email || '',
          name: info.name || '',
          picture: info.picture || ''
        }
      });
    }
    return info;
  } catch {
    return null;
  }
}

/**
 * Retrieves the stored user info.
 *
 * @returns {Promise<{ email: string, name: string, picture: string }|null>}
 */
export async function getStoredUserInfo() {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
  const data = await chrome.storage.local.get(STORAGE_KEYS.USER_INFO);
  return data[STORAGE_KEYS.USER_INFO] || null;
}

/**
 * Revokes Google OAuth token and clears local session.
 *
 * @returns {Promise<void>}
 */
export async function disconnectGoogle() {
  const token = await getStoredToken();
  if (token) {
    try {
      await fetch(`https://oauth2.googleapis.com/revoke?token=${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
      });
    } catch {
      // Ignore network errors on revoke
    }
  }
  await clearStoredToken();
}

/**
 * Checks whether the extension currently has a valid Google session.
 *
 * @returns {Promise<boolean>}
 */
export async function isAuthenticated() {
  const token = await getStoredToken();
  return Boolean(token);
}
