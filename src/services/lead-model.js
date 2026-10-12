/**
 * Lead Data Model definitions, column headers, and conversion helpers.
 */

// Required core columns appear first, followed by optional metadata
export const LEAD_HEADERS = [
  'Business / Personal Name',
  'WhatsApp / Contact Number',
  'Facebook Page / Profile Link',
  'Lead ID',
  'Business Category',
  'Facebook Page Type',
  'Email',
  'Website',
  'Additional Contact Number',
  'Lead Notes',
  'Date Added',
  'Lead Source',
  'Last Updated'
];

/**
 * Generates a unique, collision-resistant Lead ID.
 *
 * @returns {string} - e.g. "LEAD_1712918234567_a1b2c3"
 */
export function generateLeadId() {
  const timestamp = Date.now();
  const randomPart = Math.random().toString(36).substring(2, 8);
  return `LEAD_${timestamp}_${randomPart}`;
}

/**
 * Creates an empty or default lead object structure.
 *
 * @param {Partial<object>} [overrides={}]
 * @returns {object}
 */
export function createDefaultLead(overrides = {}) {
  const now = new Date().toISOString();
  return {
    id: generateLeadId(),
    name: '',
    phone: '',
    url: '',
    category: 'General',
    pageType: 'Business Page',
    email: '',
    website: '',
    additionalPhone: '',
    notes: '',
    dateAdded: now,
    source: 'Facebook Extension',
    lastUpdated: now,
    isWhatsApp: false,
    ...overrides
  };
}

/**
 * Converts a lead object to an array of cell values matching LEAD_HEADERS order.
 *
 * @param {object} lead
 * @returns {string[]}
 */
export function leadToRow(lead) {
  return [
    lead.name || '',
    lead.phone || '',
    lead.url || '',
    lead.id || generateLeadId(),
    lead.category || '',
    lead.pageType || 'Business Page',
    lead.email || '',
    lead.website || '',
    lead.additionalPhone || '',
    lead.notes || '',
    lead.dateAdded || new Date().toISOString(),
    lead.source || 'Facebook Extension',
    lead.lastUpdated || new Date().toISOString()
  ];
}

/**
 * Converts a spreadsheet row array back into a lead object.
 *
 * @param {string[]} row
 * @param {number} [rowIndex=-1] - 1-based row index in the sheet
 * @returns {object}
 */
export function rowToLead(row = [], rowIndex = -1) {
  return {
    rowIndex,
    name: row[0] || '',
    phone: row[1] || '',
    url: row[2] || '',
    id: row[3] || '',
    category: row[4] || '',
    pageType: row[5] || '',
    email: row[6] || '',
    website: row[7] || '',
    additionalPhone: row[8] || '',
    notes: row[9] || '',
    dateAdded: row[10] || '',
    source: row[11] || '',
    lastUpdated: row[12] || ''
  };
}
