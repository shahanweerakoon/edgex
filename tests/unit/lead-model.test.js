import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  LEAD_HEADERS,
  leadToRow,
  rowToLead,
  generateLeadId,
  createDefaultLead
} from '../../src/services/lead-model.js';

describe('Lead Model', () => {
  test('primary 3 columns are in the exact required position', () => {
    assert.equal(LEAD_HEADERS[0], 'Business / Personal Name');
    assert.equal(LEAD_HEADERS[1], 'WhatsApp / Contact Number');
    assert.equal(LEAD_HEADERS[2], 'Facebook Page / Profile Link');
    assert.equal(LEAD_HEADERS.length, 13);
  });

  test('generateLeadId generates unique formatted IDs', () => {
    const id1 = generateLeadId();
    const id2 = generateLeadId();
    assert.match(id1, /^LEAD_\d+_[a-z0-9]+$/);
    assert.notEqual(id1, id2);
  });

  test('leadToRow serializes lead properties according to LEAD_HEADERS order', () => {
    const lead = {
      name: 'Acme Digital',
      phone: '+94771234567',
      url: 'https://www.facebook.com/acmedigital',
      id: 'LEAD_TEST_123',
      category: 'Software',
      pageType: 'Business Page',
      email: 'contact@acme.lk',
      website: 'https://acme.lk',
      additionalPhone: '+94112223333',
      notes: 'Interested in web dev services',
      dateAdded: '2026-10-12T00:00:00.000Z',
      source: 'Facebook Extension',
      lastUpdated: '2026-10-12T00:00:00.000Z'
    };

    const row = leadToRow(lead);
    assert.equal(row.length, 13);
    assert.equal(row[0], 'Acme Digital');
    assert.equal(row[1], '+94771234567');
    assert.equal(row[2], 'https://www.facebook.com/acmedigital');
    assert.equal(row[3], 'LEAD_TEST_123');
    assert.equal(row[4], 'Software');
    assert.equal(row[5], 'Business Page');
    assert.equal(row[6], 'contact@acme.lk');
    assert.equal(row[7], 'https://acme.lk');
    assert.equal(row[8], '+94112223333');
    assert.equal(row[9], 'Interested in web dev services');
    assert.equal(row[10], '2026-10-12T00:00:00.000Z');
    assert.equal(row[11], 'Facebook Extension');
    assert.equal(row[12], '2026-10-12T00:00:00.000Z');
  });

  test('rowToLead parses row array back to lead object', () => {
    const row = [
      'Royal Prints',
      '+94719876543',
      'https://www.facebook.com/royalprints',
      'LEAD_999',
      'Printing',
      'Business Page',
      'royal@prints.lk',
      'https://royalprints.lk',
      '',
      'Needs 10,000 brochures',
      '2026-10-10T12:00:00Z',
      'Facebook Extension',
      '2026-10-11T12:00:00Z'
    ];

    const lead = rowToLead(row, 5);
    assert.equal(lead.rowIndex, 5);
    assert.equal(lead.name, 'Royal Prints');
    assert.equal(lead.phone, '+94719876543');
    assert.equal(lead.url, 'https://www.facebook.com/royalprints');
    assert.equal(lead.id, 'LEAD_999');
    assert.equal(lead.category, 'Printing');
    assert.equal(lead.notes, 'Needs 10,000 brochures');
  });
});
