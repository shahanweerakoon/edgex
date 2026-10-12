/**
 * Facebook Content Script Extractor.
 * Legitimately inspects visible DOM elements, meta tags, and structured data on Facebook.
 * Complies strictly with browser privacy standards: zero private scraping, zero fabrication.
 */

(function () {
  // Prevent duplicate execution if injected multiple times
  if (window.__fbLeadCollectorExtractorInjected) return;
  window.__fbLeadCollectorExtractorInjected = true;

  // Phone regex pattern supporting international codes (+94, +1, etc.) and common regional formats
  const PHONE_REGEX = /(?:\+|00)?(?:[1-9]\d{0,3})?[\s.-]?(?:\(\d{1,4}\)|\d{1,4})[\s.-]?\d{2,4}[\s.-]?\d{2,4}(?:[\s.-]?\d{1,4})?/g;
  const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;

  /**
   * Cleans text content by trimming extra whitespace and linebreaks.
   */
  function cleanText(text) {
    if (!text || typeof text !== 'string') return '';
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * Unwraps Facebook outgoing redirect links.
   */
  function unwrapRedirect(rawUrl) {
    if (!rawUrl) return '';
    try {
      const parsed = new URL(rawUrl);
      if (parsed.hostname.includes('facebook.com') && (parsed.pathname === '/l.php' || parsed.searchParams.has('u'))) {
        const u = parsed.searchParams.get('u');
        if (u) return decodeURIComponent(u);
      }
      return rawUrl;
    } catch {
      return rawUrl;
    }
  }

  /**
   * Extracts JSON-LD schema structured data if present on the page.
   */
  function extractJsonLd() {
    const scripts = document.querySelectorAll('script[type="application/ld+json"]');
    for (const script of scripts) {
      try {
        const data = JSON.parse(script.textContent);
        if (data) return data;
      } catch {
        // Continue to next script tag
      }
    }
    return null;
  }

  /**
   * Extracts OpenGraph meta tags.
   */
  function extractMetaTags() {
    const getMeta = (prop) => {
      const el = document.querySelector(`meta[property="${prop}"], meta[name="${prop}"]`);
      return el ? el.getAttribute('content') || '' : '';
    };

    const canonicalEl = document.querySelector('link[rel="canonical"]');

    return {
      title: getMeta('og:title') || getMeta('twitter:title') || document.title || '',
      url: canonicalEl?.getAttribute('href') || getMeta('og:url') || window.location.href,
      description: getMeta('og:description') || getMeta('description') || '',
      siteName: getMeta('og:site_name') || ''
    };
  }

  /**
   * Extracts public displayed page or profile name.
   */
  function extractPageName(meta) {
    // Strategy 1: Look for main heading h1
    const h1Elements = Array.from(document.querySelectorAll('h1'));
    for (const h1 of h1Elements) {
      const text = cleanText(h1.innerText || h1.textContent);
      // Filter out generic Facebook headings
      if (text && !text.toLowerCase().includes('facebook') && !text.toLowerCase().includes('notifications') && text.length > 1) {
        return text;
      }
    }

    // Strategy 2: OpenGraph Title
    if (meta.title) {
      let title = meta.title;
      // Facebook titles often end with " | Facebook" or " - Facebook"
      title = title.replace(/\s*[-|]\s*Facebook$/i, '').trim();
      title = title.replace(/\s*\|\s*Facebook\s*$/i, '').trim();
      if (title && !title.toLowerCase().includes('log in') && !title.toLowerCase().includes('facebook')) {
        return title;
      }
    }

    // Strategy 3: Document Title
    let docTitle = document.title || '';
    docTitle = docTitle.replace(/\s*[-|]\s*Facebook$/i, '').trim();
    return docTitle || 'Facebook Page';
  }

  /**
   * Scans for WhatsApp links on the page.
   */
  function extractWhatsAppLink() {
    // Search links with wa.me or api.whatsapp.com
    const links = Array.from(document.querySelectorAll('a[href*="wa.me"], a[href*="whatsapp.com"], a[href*="send?phone="]'));
    for (const link of links) {
      const href = link.getAttribute('href') || '';
      const text = link.innerText || link.textContent || '';
      const combined = `${href} ${text}`;

      // Match wa.me/123456789
      const match = combined.match(/wa\.me\/(?:\+)?(\d{7,16})/i);
      if (match && match[1]) {
        return '+' + match[1];
      }

      // Match phone parameter
      const phoneParamMatch = href.match(/[?&]phone=([+\d]+)/i);
      if (phoneParamMatch && phoneParamMatch[1]) {
        const clean = phoneParamMatch[1].replace(/[^\d+]/g, '');
        if (clean.length >= 7) {
          return clean.startsWith('+') ? clean : '+' + clean;
        }
      }
    }

    // Check visible text mentioning "WhatsApp: +94..."
    const bodyText = document.body?.innerText || '';
    const waTextMatch = bodyText.match(/WhatsApp(?:\s*[:\-–]\s*|\s+)([+\d\s().-]{7,20})/i);
    if (waTextMatch && waTextMatch[1]) {
      const clean = waTextMatch[1].replace(/[^\d+]/g, '');
      if (clean.length >= 7 && clean.length <= 16) {
        return clean;
      }
    }

    return null;
  }

  /**
   * Scans for publicly displayed telephone numbers.
   */
  function extractPhoneNumber() {
    // Strategy 1: Look for tel: links
    const telLinks = Array.from(document.querySelectorAll('a[href^="tel:"]'));
    for (const link of telLinks) {
      const href = link.getAttribute('href') || '';
      const raw = href.replace(/^tel:/i, '').trim();
      const clean = raw.replace(/[^\d+]/g, '');
      if (clean.length >= 7 && clean.length <= 16) {
        return clean.startsWith('+') ? clean : clean;
      }
    }

    // Strategy 2: Look within About / Intro containers
    const introContainers = document.querySelectorAll(
      '[data-pagelet="ProfileTiles"], [data-pagelet="ProfileIntro"], [data-pagelet="PageHeader"], div[role="main"]'
    );

    const containersToSearch = introContainers.length > 0 ? introContainers : [document.body];

    for (const container of containersToSearch) {
      if (!container) continue;
      const text = container.innerText || '';

      // Match Sri Lankan patterns (+94 7x xxxxxxx or 07x xxxxxxx or 011 xxxxxxx)
      const slMatch = text.match(/(?:\+94|0094|0)\s*(?:7[0-8]|11|2[1-8]|3[1-8]|4[1-7]|5[1-7]|6[3-7]|8[1-7]|9[1-2])\s*\d{3}\s*\d{4}/);
      if (slMatch) {
        return slMatch[0].trim();
      }

      // Standard telephone pattern
      const matches = text.match(PHONE_REGEX);
      if (matches) {
        for (const m of matches) {
          const digits = m.replace(/\D/g, '');
          // Reasonable phone number length
          if (digits.length >= 8 && digits.length <= 15) {
            // Avoid capturing years (e.g. 2024, 2025) or date-times
            if (!/^(19|20)\d{2}$/.test(digits) && !m.includes('/') && !m.includes(':')) {
              return m.trim();
            }
          }
        }
      }
    }

    return null;
  }

  /**
   * Extracts public email address if visible.
   */
  function extractEmail() {
    // Strategy 1: mailto: links
    const mailto = document.querySelector('a[href^="mailto:"]');
    if (mailto) {
      const href = mailto.getAttribute('href') || '';
      const email = href.replace(/^mailto:/i, '').split('?')[0].trim();
      if (email.includes('@')) return email;
    }

    // Strategy 2: regex match in page text
    const text = document.body?.innerText || '';
    const emailMatches = text.match(EMAIL_REGEX);
    if (emailMatches) {
      for (const email of emailMatches) {
        const lower = email.toLowerCase();
        // Ignore Facebook internal emails
        if (!lower.endsWith('@facebook.com') && !lower.endsWith('@fb.com')) {
          return email.trim();
        }
      }
    }

    return '';
  }

  /**
   * Extracts public external website link.
   */
  function extractWebsite() {
    const links = Array.from(document.querySelectorAll('a[href]'));
    for (const link of links) {
      const rawHref = link.getAttribute('href') || '';
      const unwrapped = unwrapRedirect(rawHref);

      try {
        const url = new URL(unwrapped);
        const host = url.hostname.toLowerCase();

        // Must be external website, not facebook or common social media
        if (
          !host.includes('facebook.com') &&
          !host.includes('fb.me') &&
          !host.includes('instagram.com') &&
          !host.includes('messenger.com') &&
          !host.includes('whatsapp.com') &&
          url.protocol.startsWith('http')
        ) {
          // Check if link is placed in an intro / about section or has website icon
          const parent = link.closest('[data-pagelet="ProfileTiles"], [data-pagelet="ProfileIntro"], div[role="main"]');
          if (parent) {
            return unwrapped.replace(/\/+$/, '');
          }
        }
      } catch {
        // Invalid URL
      }
    }

    return '';
  }

  /**
   * Detects the business category badge or text from Facebook page.
   */
  function extractCategory() {
    // Strategy 1: Category link /pages/category/...
    const catLinks = document.querySelectorAll('a[href*="/category/"], a[href*="/pages/category/"]');
    for (const link of catLinks) {
      const text = cleanText(link.innerText || link.textContent);
      if (text && text.length > 2 && text.length < 50) {
        return text;
      }
    }

    // Strategy 2: Look near header for category text (often rendered in span below page title)
    const header = document.querySelector('h1')?.closest('div');
    if (header) {
      const spans = Array.from(header.querySelectorAll('span, a'));
      for (const span of spans) {
        const text = cleanText(span.innerText);
        if (
          text &&
          text.length > 2 &&
          text.length < 40 &&
          !text.includes('Follow') &&
          !text.includes('Like') &&
          !text.includes('Message') &&
          !text.includes('Share') &&
          !text.includes('Posts') &&
          !text.includes('Reviews')
        ) {
          // Check if matches known category keywords
          if (
            /business|company|service|software|retail|store|restaurant|media|news|printing|design|advertising|education|consultant|hospital|doctor|hotel|cafe|agency|contractor/i.test(
              text
            )
          ) {
            return text;
          }
        }
      }
    }

    return 'General';
  }

  /**
   * Determines page type from current URL and DOM.
   */
  function detectPageType() {
    const url = window.location.href.toLowerCase();

    if (url.includes('/groups/')) {
      if (url.includes('/posts/') || url.includes('/permalink/')) {
        return 'Post';
      }
      return 'Public Group';
    }

    if (url.includes('/posts/') || url.includes('/videos/') || url.includes('/photos/') || url.includes('/story.php')) {
      return 'Post';
    }

    if (url.includes('/events/')) {
      return 'Event';
    }

    if (url.includes('/marketplace/')) {
      return 'Marketplace';
    }

    if (url.includes('profile.php') || url.includes('/people/')) {
      return 'Personal Profile';
    }

    // Check DOM for Group / Profile indicators
    if (document.querySelector('[aria-label="Join group"], [aria-label="Joined"]')) {
      return 'Public Group';
    }

    if (document.querySelector('[aria-label="Add friend"], [aria-label="Friends"]')) {
      return 'Personal Profile';
    }

    return 'Business Page';
  }

  /**
   * Master extraction routine.
   */
  function extractFacebookData() {
    const meta = extractMetaTags();
    const jsonLd = extractJsonLd();

    // 1. Name
    const name = extractPageName(meta);

    // 2. Canonical URL (tracking stripped)
    let url = meta.url || window.location.href;
    try {
      const parsed = new URL(url);
      // Remove fb tracking
      ['fbclid', 'ref', 'refsrc', '__tn__', '__cft__', 'mibextid'].forEach((p) => parsed.searchParams.delete(p));
      url = parsed.toString().replace(/\/+$/, '');
    } catch {
      // Keep as-is
    }

    // 3. Page Type
    const pageType = detectPageType();

    // 4. Contact Numbers with Exact Priority:
    // Priority 1: Public WhatsApp number
    const whatsappNumber = extractWhatsAppLink();
    // Priority 2: Publicly displayed business phone
    const regularPhone = extractPhoneNumber();

    let finalPhone = '';
    let isWhatsApp = false;
    let additionalPhone = '';

    if (whatsappNumber) {
      finalPhone = whatsappNumber;
      isWhatsApp = true;
      if (regularPhone && regularPhone !== whatsappNumber) {
        additionalPhone = regularPhone;
      }
    } else if (regularPhone) {
      finalPhone = regularPhone;
      isWhatsApp = false;
    }

    // 5. Email & Website
    const email = extractEmail();
    const website = extractWebsite();

    // 6. Category
    const category = extractCategory();

    return {
      name,
      url,
      phone: finalPhone,
      isWhatsApp,
      additionalPhone,
      category,
      pageType,
      email,
      website,
      extractedAt: new Date().toISOString()
    };
  }

  // Listen for extraction requests from Popup or Background Service Worker
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'EXTRACT_PAGE_DATA') {
      try {
        const leadData = extractFacebookData();
        sendResponse({ success: true, lead: leadData });
      } catch (err) {
        sendResponse({ success: false, error: err.message });
      }
      return true; // Keep message channel open for async response
    }
  });
})();
