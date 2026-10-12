# Facebook Lead Collector — Microsoft Edge Extension

An enterprise-ready Microsoft Edge / Chromium Manifest V3 extension that extracts publicly displayed business lead information directly from Facebook pages, profiles, groups, and posts, prioritizing WhatsApp contact numbers, and syncs records seamlessly to Google Sheets categorized tabs and a master `All Leads` sheet.

---

## Table of Contents

1. [A. Project Overview](#a-project-overview)
2. [B. Prerequisites](#b-prerequisites)
3. [C. Install Dependencies](#c-install-dependencies)
4. [D. Google Cloud Project Setup](#d-google-cloud-project-setup)
5. [E. Microsoft Edge Extension Configuration](#e-microsoft-edge-extension-configuration)
6. [F. Connect Google Sheets](#f-connect-google-sheets)
7. [G. Configuration Reference](#g-configuration-reference)
8. [H. API Permissions](#h-api-permissions)
9. [I. Development and Build Commands](#i-development-and-build-commands)
10. [J. Troubleshooting](#j-troubleshooting)
11. [K. Security and Privacy](#k-security-and-privacy)
12. [L. Publishing to Microsoft Edge Add-ons](#l-publishing-to-microsoft-edge-add-ons)
13. [M. Complete Setup Checklist](#m-complete-setup-checklist)

---

## A. Project Overview

### What the Extension Does

**Facebook Lead Collector** simplifies prospective client research and lead generation on Facebook. When visiting a business page, public profile, group, or post:

1. **Intelligent On-Page Extraction**: Inspects rendered DOM headers, JSON-LD schemas, OpenGraph metadata, contact containers, and contact links.
2. **WhatsApp Prioritization**: Detects WhatsApp click-to-chat links (`wa.me`, `api.whatsapp.com`) and prioritizes them over generic phone numbers.
3. **Structured Lead Preview**: Displays the core required fields (`Business / Personal Name`, `WhatsApp / Contact Number`, `Facebook Page / Profile Link`) and optional metadata (`Email`, `Website`, `Additional Phone`, `Notes`, `Page Type`).
4. **Category Routing**: Appends leads to a dedicated category sheet tab (e.g. `Software`, `Printing`, `Retail`) AND synchronizes them to a master `All Leads` tab.
5. **Duplicate Prevention**: Detects existing records using normalized Facebook URLs (primary) and normalized phone numbers (secondary), offering the user options to **Update Existing**, **Save as New**, or **Skip**.
6. **Recovery for Partial Saves**: Detects and recovers if a write succeeds on one tab but encounters a network interruption on another.

### Supported Page Types

- Business Pages (`/brand-name`, `/pages/category/...`)
- Public Personal Profiles (`/profile.php?id=...`, `/people/...`)
- Public Facebook Groups (`/groups/...`)
- Facebook Posts & Shared Content (`/posts/...`, `/permalink/...`)
- Marketplace & Event pages

### Security and Ethical Extraction Model

- **Zero Scraping of Private Data**: Only inspects text and links legitimately rendered in the browser viewport for the user.
- **No Login Automation or Credential Interception**: Does not bypass Facebook permissions, evade CAPTCHAs, or access private messages.
- **Zero Token Leakage**: Google OAuth access tokens are stored strictly in `chrome.storage.local` and never logged or transmitted to third-party servers.
- **No Client Secrets in Browser**: Uses OAuth 2.0 Web Client flow (`response_type=token` with `chrome.identity.launchWebAuthFlow`), eliminating the need to expose client secrets in client-side extension code.

---

## B. Prerequisites

Verify that your system meets the following requirements before installation:

| Requirement | Supported Version | Verification Command / URL |
| :--- | :--- | :--- |
| **Microsoft Edge** | Version 110+ (Chromium-based) | `edge://settings/help` |
| **Node.js** | `>= 18.0.0` (Tested on Node 24) | `node -v` |
| **npm** | `>= 9.0.0` | `npm -v` |
| **Google Account** | Active Google Workspace or Personal | [myaccount.google.com](https://myaccount.google.com/) |
| **Google Cloud Console Access** | Free or Paid GCP Project | [console.cloud.google.com](https://console.cloud.google.com/) |
| **Google Spreadsheet** | Any spreadsheet owned or editable by you | [sheets.google.com](https://sheets.google.com/) |

---

## C. Install Dependencies

Clone or open the project folder in your terminal:

```bash
cd c:\Users\Asipiya Designer\Documents\Development\edgex
```

This extension is built with vanilla modern JavaScript (ES Modules) and has **zero third-party runtime production dependencies**, guaranteeing maximum speed, security, and low memory footprint.

To install development packages (if any) or verify the Node environment:

```bash
npm install
```

Verify your Node version:

```bash
node -v
# Output should be v18.0.0 or higher (e.g. v24.16.0)
```

---

## D. Google Cloud Project Setup

To enable genuine Google OAuth 2.0 authentication and Google Sheets API v4 integration, complete this one-time Google Cloud setup.

> [!IMPORTANT]
> **Client Secrets:** Never store a client secret or private service account key in browser extension code. Client-side browser extensions use **Public OAuth Clients** (Web application type) with redirect URI validation.

### Step 1: Open Google Cloud Console
1. Navigate to [Google Cloud Console](https://console.cloud.google.com/).
2. Log in with your Google account.

### Step 2: Create or Select a Project
1. In the top navigation bar, click the **Project Selector** dropdown.
2. Click **New Project**.
3. Name your project (e.g., `FB-Lead-Collector`) and click **Create**.

### Step 3: Enable the Google Sheets API
1. In the left navigation menu, go to **APIs & Services** &rarr; **Library** ([console.cloud.google.com/apis/library](https://console.cloud.google.com/apis/library)).
2. In the search box, type **Google Sheets API**.
3. Select **Google Sheets API** and click **Enable**.
4. *(Optional for picking files)*: Search for **Google Drive API** and click **Enable**.

### Step 4: Configure the OAuth Consent Screen
1. Go to **APIs & Services** &rarr; **OAuth consent screen** ([console.cloud.google.com/apis/credentials/consent](https://console.cloud.google.com/apis/credentials/consent)).
2. Select User Type:
   - For personal `@gmail.com` accounts: Choose **External**.
   - For Google Workspace organizations: Choose **Internal** (if testing within your domain).
3. Click **Create**.
4. Fill in the required fields:
   - **App name**: `Facebook Lead Collector`
   - **User support email**: Your email address
   - **Developer contact information**: Your email address
5. Click **Save and Continue**.

### Step 5: Configure OAuth Scopes
1. On the **Scopes** step, click **Add or Remove Scopes**.
2. Select or manually add the following scopes:
   - `https://www.googleapis.com/auth/spreadsheets` (Required: view, edit, create Google Sheets spreadsheets)
   - `https://www.googleapis.com/auth/drive.file` (Required: see and edit only spreadsheets created/opened by this app)
   - `https://www.googleapis.com/auth/userinfo.email` (Optional: displays your logged-in email in settings)
   - `https://www.googleapis.com/auth/userinfo.profile` (Optional: displays your profile name)
3. Click **Update** and then **Save and Continue**.

### Step 6: Add Test Users (Required for "External" User Type in Testing status)
1. On the **Test users** step, click **Add Users**.
2. Enter your Google email address (and any colleagues' emails who will test the extension).
3. Click **Save and Continue**.

### Step 7: Create OAuth 2.0 Client ID
1. In the left sidebar, click **Credentials** ([console.cloud.google.com/apis/credentials](https://console.cloud.google.com/apis/credentials)).
2. Click **+ Create Credentials** &rarr; **OAuth client ID**.
3. Under **Application type**, select **Web application**.
4. Set **Name**: `Facebook Lead Collector Edge Extension`.
5. Under **Authorized redirect URIs**, click **+ Add URI**.
6. Enter the redirect URI for your extension:
   ```text
   https://<extension-id>.chromiumapp.org/
   ```
   *(To find your exact extension ID, follow Section E below to load the extension into Edge. The Settings page in the extension also displays your exact Redirect URI and provides a "Copy URI" button!)*
7. Click **Create**.
8. A modal will appear showing **Your Client ID**. Copy this Client ID (it ends with `.apps.googleusercontent.com`). You will paste this into the extension's Settings page.

---

## E. Microsoft Edge Extension Configuration

### 1. Build the Extension
Run the build script to generate the distribution package:

```bash
npm run build
```

This validates `manifest.json`, confirms all icons and scripts exist, and generates a clean `dist/` directory.

### 2. Open Microsoft Edge Extensions
1. Launch Microsoft Edge.
2. In the URL address bar, enter:
   ```text
   edge://extensions
   ```
   and press **Enter**.

### 3. Enable Developer Mode
1. In the left sidebar of `edge://extensions`, switch the **Developer mode** toggle to **ON**.

### 4. Load the Extension
1. Click the **Load unpacked** button at the top of the page.
2. In the folder picker dialog, select either:
   - The `dist` folder: `C:\Users\Asipiya Designer\Documents\Development\edgex\dist`
   - Or the project root: `C:\Users\Asipiya Designer\Documents\Development\edgex`
3. Click **Select Folder**.

### 5. Find Your Stable Extension ID
1. On the `edge://extensions` card for **Facebook Lead Collector**, notice the **ID** string (a 32-character lowercase string, e.g. `abcdefghijklmnopqrstuvwxyz123456`).
2. Your OAuth Redirect URI is:
   `https://<your-extension-id>.chromiumapp.org/`

*(If you ever need to pin the extension ID permanently during development, you can add a `"key"` field in `manifest.json` derived from a private key, but for development simply registering `https://<extension-id>.chromiumapp.org/` in Google Cloud Console is standard).*

### 6. Inspecting and Debugging
- **Popup Console**: Right-click the extension icon in Edge's toolbar and select **Inspect popup**.
- **Service Worker Console**: On `edge://extensions`, find Facebook Lead Collector and click the link next to **Inspect views: service worker**.
- **Content Script Console**: On any Facebook page, press `F12` or `Ctrl+Shift+I` to open Developer Tools and select the **Console** tab.

---

## F. Connect Google Sheets

### Step 1: Open Extension Settings
1. Click the **Facebook Lead Collector** icon in your browser toolbar.
2. In the top right of the popup, click the **Gear** icon to open **Settings** (or right-click icon &rarr; **Extension options**).

### Step 2: Paste Your Google OAuth Client ID
1. In the **Google Account Authentication** card, paste your Google OAuth Client ID into the **Google OAuth 2.0 Client ID** input field.
2. Click **Save Client ID**.

### Step 3: Connect Google Account
1. Click **Connect Google Account**.
2. A Google sign-in window will open.
3. Choose your Google account (ensure it was added to Test Users in Google Cloud Console).
4. Review the requested permissions (Google Sheets & Google Drive files) and click **Allow**.
5. The window will close automatically, and the Settings screen will update to display **Connected to Google** with your email!

### Step 4: Connect Your Google Spreadsheet
1. Create a new Google Spreadsheet at [sheets.new](https://sheets.new) (e.g. named `Facebook Business Leads`).
2. Copy the URL from your address bar (or just copy the ID between `/d/` and `/edit`):
   ```text
   https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit
   ```
3. In the extension Settings under **Target Google Spreadsheet**, paste the URL into the input field and click **Connect Sheet**.
4. The extension verifies edit access, retrieves the title, and displays **Connected to [Sheet Title]**!

### Step 5: Initialize the Master "All Leads" Tab
1. Click **Initialize "All Leads"** (this is also done automatically when connecting).
2. The extension creates the master sheet tab named `All Leads` with frozen header row and the standard 13 column schema.

### Standard Column Schema

Every category sheet and the master `All Leads` sheet follow this exact column structure:

| Col | Header Name | Type | Notes |
| :---: | :--- | :--- | :--- |
| **A** | `Business / Personal Name` | Text | **Core Primary Field** (Required) |
| **B** | `WhatsApp / Contact Number` | Text | **Core Primary Field** (WhatsApp prioritized) |
| **C** | `Facebook Page / Profile Link` | URL | **Core Primary Field** (Canonical URL) |
| **D** | `Lead ID` | ID | Stable unique identifier (`LEAD_...`) |
| **E** | `Business Category` | Text | Category tab name (e.g. Software, Retail) |
| **F** | `Facebook Page Type` | Text | Business Page, Public Group, Profile, etc. |
| **G** | `Email` | Email | Publicly visible email address |
| **H** | `Website` | URL | Unwrapped canonical company website |
| **I** | `Additional Contact Number` | Text | Secondary phone if WhatsApp was primary |
| **J** | `Lead Notes` | Text | Custom notes entered by the user |
| **K** | `Date Added` | ISO String | Creation timestamp |
| **L** | `Lead Source` | Text | `Facebook Lead Collector` |
| **M** | `Last Updated` | ISO String | Revision timestamp |

---

## G. Configuration Reference

Configuration can be customized via `.env` or set directly via the extension Settings user interface:

| Setting Key | Storage Location | Example Value | Description |
| :--- | :--- | :--- | :--- |
| `google_client_id` | `chrome.storage.local` | `123456...apps.googleusercontent.com` | Google Cloud OAuth Client ID (Public configuration) |
| `google_spreadsheet_id`| `chrome.storage.local` | `1BxiMVs0XRA5nFMdKv...` | Target Google Spreadsheet ID |
| `google_spreadsheet_title`| `chrome.storage.local` | `My Facebook Leads 2026` | Cached spreadsheet name |
| `default_business_category`| `chrome.storage.local` | `General` | Default category selected in lead capture popup |
| `business_categories` | `chrome.storage.local` | `["General", "Software", ...]` | Array of available business category tabs |

> [!NOTE]
> All settings are stored locally on your machine in `chrome.storage.local`. No passwords, tokens, or personal data are ever uploaded to any intermediary servers.

---

## H. API Permissions

The extension declares only the minimum necessary permissions in `manifest.json`:

### Extension Permissions
- `storage`: Persists local preferences, Client ID, and spreadsheet selection.
- `identity`: Launches Google's OAuth consent dialog via `chrome.identity.launchWebAuthFlow`.
- `activeTab` & `scripting`: Allows inspecting the current tab's visible DOM when you click the extension popup.

### Host Permissions
- `*://*.facebook.com/*`, `*://*.fb.com/*`: Enables the content extractor on Facebook pages.
- `https://sheets.googleapis.com/*`: Google Sheets REST API v4 (reading sheets, appending rows, batchUpdates).
- `https://www.googleapis.com/*`, `https://accounts.google.com/*`, `https://oauth2.googleapis.com/*`: Google OAuth token exchange and user profile display.

### Google OAuth Scopes
- `https://www.googleapis.com/auth/spreadsheets`: Required for reading sheet metadata, creating category tabs (`addSheet`), checking duplicate rows, and appending lead records (`values.append`).
- `https://www.googleapis.com/auth/drive.file`: Allows the extension to access and manage spreadsheets you connect.
- `https://www.googleapis.com/auth/userinfo.email`: Reads only your email address to show "Signed in as user@domain.com" in Settings.

---

## I. Development and Build Commands

Run these commands from the project root:

```bash
# Run all automated tests (unit + integration)
npm test

# Run unit tests only
npm run test:unit

# Run end-to-end integration tests only
npm run test:integration

# Validate code syntax and modules
npm run lint

# Build clean distribution package to /dist
npm run build
```

---

## J. Troubleshooting

### 1. `redirect_uri_mismatch`
- **Cause**: The redirect URI in Google Cloud Console does not match your Edge extension's URI.
- **Solution**: Open the extension **Settings** page, click **Copy URI** under the Redirect URI section (it looks like `https://<extension-id>.chromiumapp.org/`), go to [Google Cloud Console Credentials](https://console.cloud.google.com/apis/credentials), edit your OAuth Client ID, and paste the URI under **Authorized redirect URIs**. Click **Save**.

### 2. `Access blocked: App has not completed the Google verification process`
- **Cause**: Your OAuth consent screen is set to **External** and in **Testing** status.
- **Solution**: Go to [Google Cloud OAuth Consent Screen](https://console.cloud.google.com/apis/credentials/consent) &rarr; **Test users** and add your Google email address. Only added test users can sign in while the app is in Testing mode.

### 3. Google Sheets API Disabled (`403 API has not been enabled`)
- **Cause**: Google Sheets API is not turned on in your GCP project.
- **Solution**: Visit [Google Cloud Library: Sheets API](https://console.cloud.google.com/apis/library/sheets.googleapis.com) and click **Enable**.

### 4. `403 Permission Denied` on Spreadsheet
- **Cause**: The signed-in Google account does not have "Editor" permissions on the selected Google Sheet.
- **Solution**: Open the Google Sheet in your browser, click **Share**, and ensure your Google account is added as an **Editor**.

### 5. `404 Spreadsheet Not Found`
- **Cause**: Typo in the spreadsheet ID or the sheet was deleted in Google Drive.
- **Solution**: Copy the full URL directly from your browser's address bar and paste it into the extension Settings.

### 6. Facebook Extraction Returns Blank Fields
- **Cause**: Page is still loading, or Facebook opened in a restricted internal frame.
- **Solution**: Wait for the page to finish rendering and click **Refresh Data** in the extension popup. You can also manually type or correct any field directly.

### 7. Duplicate Lead Warning
- **Cause**: A lead with the same canonical Facebook URL or contact number already exists in `All Leads`.
- **Options**:
  - Click **Update Existing**: Updates the existing row without creating a duplicate.
  - Click **Save as New**: Appends a new row anyway.
  - Click **Skip**: Cancels the save operation.

### 8. Partial Save Warning
- **Cause**: Lead was appended to the category sheet, but the second write to `All Leads` failed due to a network interruption.
- **Solution**: Click **Retry Sync** on the banner. The extension will automatically synchronize the missing record.

---

## K. Security and Privacy

- **Local Storage Only**: Your leads, tokens, and settings are never transmitted to any third-party analytics, tracking, or proxy servers.
- **No Private Data Mining**: The extension does not collect hidden data, private messages, friend lists, or non-public personal information.
- **Disconnect Anytime**: In Settings, you can click **Disconnect** at any time to revoke your Google session and clear local storage.
- **Independent Application**: This extension has not been audited by Facebook or Google and operates via standard public APIs.

---

## L. Publishing to Microsoft Edge Add-ons

To publish this extension to the Microsoft Edge Add-ons store for public distribution:

1. **Register Developer Account**: Sign up at [Microsoft Partner Center](https://partner.microsoft.com/dashboard/microsoftedge).
2. **Package the Extension**:
   ```bash
   npm run build
   cd dist
   # Zip contents of dist folder (manifest.json must be in the root of the zip)
   ```
3. **Submit Extension**:
   - In Partner Center, click **Create new extension**.
   - Upload the `.zip` file generated from the `dist` directory.
   - Provide a store description, privacy policy link, and icon screenshots.
4. **Google Verification**:
   - For public distribution, if requesting the sensitive scope `https://www.googleapis.com/auth/spreadsheets`, submit your Google Cloud OAuth app for Google Verification in Google Cloud Console.
   - Alternatively, you can use the more restrictive scope `https://www.googleapis.com/auth/drive.file` which accesses only files created or opened by the app.

---

## M. Complete Setup Checklist

Follow this checklist to go from clean environment to fully operational lead capture:

- [ ] Node.js v18+ installed (`node -v`).
- [ ] Dependencies verified (`npm test` passes 54 tests).
- [ ] Google Cloud Project created.
- [ ] Google Sheets API enabled in Google Cloud Console.
- [ ] OAuth Consent Screen configured with test user added.
- [ ] OAuth Client ID created (Web application type).
- [ ] Extension built (`npm run build`).
- [ ] Extension loaded unpacked in Edge (`edge://extensions`).
- [ ] Extension Redirect URI added to Google Cloud Authorized Redirect URIs.
- [ ] Google OAuth Client ID saved in extension Settings.
- [ ] Google Account signed in successfully.
- [ ] Destination Google Spreadsheet connected and initialized.
- [ ] Navigate to a Facebook page and test capture!
- [ ] Verify new row in Google Sheets under the Category tab and `All Leads` tab.
