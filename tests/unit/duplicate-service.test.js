import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeFacebookUrl } from '../../src/utils/url-normalizer.js';
import { getPhoneMatchKey } from '../../src/utils/phone-normalizer.js';
import { rowToLead } from '../../src/services/lead-model.js';

describe('Duplicate Detection Logic', () => {
  const existingMasterRows = [
    [
      'Colombo Software Hub',
      '+94 77 123 4567',
      'https://www.facebook.com/ColomboSoftwareHub',
      'LEAD_101',
      'Software',
      'Business Page',
      'info@colombosoftware.lk',
      'https://colombosoftware.lk',
      '',
      'VIP client',
      '2026-10-01',
      'Facebook Extension',
      '2026-10-01'
    ],
    [
      'Kandy Printing Press',
      '0812233445',
      'https://www.facebook.com/kandyprints',
      'LEAD_102',
      'Printing',
      'Business Page',
      'kandy@prints.lk',
      '',
      '+94 71 555 6677',
      '',
      '2026-10-02',
      'Facebook Extension',
      '2026-10-02'
    ]
  ];

  function simulateDuplicateCheck(lead, rows) {
    const normUrl = normalizeFacebookUrl(lead.url);
    const phoneKey = lead.phone ? getPhoneMatchKey(lead.phone) : '';

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const actualRowIndex = i + 2;
      const rowUrl = row[2] ? normalizeFacebookUrl(row[2]) : '';
      const rowPhone = row[1] ? getPhoneMatchKey(row[1]) : '';
      const rowAddPhone = row[8] ? getPhoneMatchKey(row[8]) : '';

      if (normUrl && rowUrl && normUrl === rowUrl) {
        return {
          isDuplicate: true,
          matchType: 'url',
          matchedValue: row[2],
          existingLead: rowToLead(row, actualRowIndex),
          rowIndex: actualRowIndex
        };
      }

      if (phoneKey && (phoneKey === rowPhone || phoneKey === rowAddPhone)) {
        return {
          isDuplicate: true,
          matchType: 'phone',
          matchedValue: row[1] || row[8],
          existingLead: rowToLead(row, actualRowIndex),
          rowIndex: actualRowIndex
        };
      }
    }

    return { isDuplicate: false, existingLead: null };
  }

  test('detects primary duplicate via Facebook URL even with tracking parameters', () => {
    const newLead = {
      name: 'Colombo Software',
      url: 'https://m.facebook.com/ColomboSoftwareHub?fbclid=XYZ123&ref=share',
      phone: '+94 70 999 8888',
      category: 'Software'
    };

    const result = simulateDuplicateCheck(newLead, existingMasterRows);
    assert.equal(result.isDuplicate, true);
    assert.equal(result.matchType, 'url');
    assert.equal(result.existingLead.id, 'LEAD_101');
    assert.equal(result.rowIndex, 2);
  });

  test('detects secondary duplicate via Phone Number when URL differs', () => {
    const newLead = {
      name: 'Kandy Press Alternate Link',
      url: 'https://facebook.com/kandy-press-new-page',
      phone: '+94 71 555 6677', // matches secondary phone in row 2
      category: 'Printing'
    };

    const result = simulateDuplicateCheck(newLead, existingMasterRows);
    assert.equal(result.isDuplicate, true);
    assert.equal(result.matchType, 'phone');
    assert.equal(result.existingLead.id, 'LEAD_102');
    assert.equal(result.rowIndex, 3);
  });

  test('does not flag unique lead as duplicate', () => {
    const uniqueLead = {
      name: 'Galle Marine Services',
      url: 'https://facebook.com/gallemarine',
      phone: '+94 91 222 3344',
      category: 'Automotive'
    };

    const result = simulateDuplicateCheck(uniqueLead, existingMasterRows);
    assert.equal(result.isDuplicate, false);
    assert.equal(result.existingLead, null);
  });
});
