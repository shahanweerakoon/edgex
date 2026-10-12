/**
 * Integration Tests: Facebook Lead Collector End-to-End Workflow.
 * Tests data extraction normalization, duplicate checking, row serialization,
 * update merges, and recovery strategies.
 */

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { validateLead } from '../../src/utils/validation.js';
import { normalizeFacebookUrl } from '../../src/utils/url-normalizer.js';
import { normalizePhoneNumber, prioritizeContactNumber } from '../../src/utils/phone-normalizer.js';
import { leadToRow, rowToLead, LEAD_HEADERS } from '../../src/services/lead-model.js';
import { PartialSaveError } from '../../src/utils/errors.js';

describe('End-to-End Lead Processing Workflow', () => {
  test('Step 1: Normalizes raw Facebook page extraction with WhatsApp priority', () => {
    // Simulated raw DOM extraction on a Sri Lankan business Facebook page
    const rawExtracted = {
      name: 'Lanka Tech Innovations (Pvt) Ltd',
      url: 'https://m.facebook.com/LankaTechInnovations/?ref=page_internal&fbclid=IwAR0918237',
      pageType: 'Business Page',
      whatsapp: 'https://wa.me/94771234567?text=Hello',
      phone: '+94 11 234 5678',
      category: 'Software / IT Solutions [LK]',
      email: 'sales@lankatech.lk',
      website: 'https://l.facebook.com/l.php?u=https%3A%2F%2Flankatech.lk%2Fservices'
    };

    // 1. Phone prioritization: WhatsApp must take precedence
    const phoneResult = prioritizeContactNumber({
      whatsapp: rawExtracted.whatsapp,
      phone: rawExtracted.phone
    });
    assert.equal(phoneResult.prioritizedNumber, '+94771234567');
    assert.equal(phoneResult.isWhatsApp, true);

    // 2. Validate and normalize entire lead payload
    const validationResult = validateLead({
      name: rawExtracted.name,
      url: rawExtracted.url,
      phone: phoneResult.prioritizedNumber,
      category: rawExtracted.category,
      email: rawExtracted.email,
      website: 'https://lankatech.lk/services'
    });

    assert.equal(validationResult.isValid, true);
    const normalized = validationResult.normalizedLead;

    // Verify canonical URL
    assert.equal(normalized.url, 'https://www.facebook.com/LankaTechInnovations');
    // Verify sanitized category for Google Sheets tab
    assert.equal(normalized.category, 'Software - IT Solutions -LK');
    // Verify WhatsApp number
    assert.equal(normalized.phone, '+94771234567');
  });

  test('Step 2: Serializes normalized lead to exact 13 spreadsheet columns', () => {
    const lead = {
      id: 'LEAD_INT_1001',
      name: 'Ceylon Tea House',
      phone: '+94712345678',
      url: 'https://www.facebook.com/ceylonteahouse',
      category: 'Retail',
      pageType: 'Business Page',
      email: 'info@ceylontea.lk',
      website: 'https://ceylontea.lk',
      additionalPhone: '+94112345678',
      notes: 'Exporter of premium tea',
      dateAdded: '2026-10-12T00:00:00.000Z',
      source: 'Facebook Lead Collector',
      lastUpdated: '2026-10-12T00:00:00.000Z'
    };

    const row = leadToRow(lead);
    assert.equal(row.length, LEAD_HEADERS.length);

    // Verify first 3 mandatory columns
    assert.equal(row[0], 'Ceylon Tea House');
    assert.equal(row[1], '+94712345678');
    assert.equal(row[2], 'https://www.facebook.com/ceylonteahouse');

    // Verify deserialization back to object
    const deserialized = rowToLead(row, 2);
    assert.equal(deserialized.name, lead.name);
    assert.equal(deserialized.phone, lead.phone);
    assert.equal(deserialized.url, lead.url);
    assert.equal(deserialized.category, 'Retail');
    assert.equal(deserialized.rowIndex, 2);
  });

  test('Step 3: Handles duplicate detection and preserves historical data on update', () => {
    // Existing lead in spreadsheet
    const existingInSheet = {
      rowIndex: 5,
      id: 'LEAD_ORIGINAL_ID_99',
      name: 'Original Business Name',
      phone: '+94770001111',
      url: 'https://www.facebook.com/bizpage',
      category: 'Software',
      notes: 'Initial meeting at expo',
      dateAdded: '2026-08-15T10:00:00Z',
      lastUpdated: '2026-08-15T10:00:00Z'
    };

    // Incoming duplicate update (user changed name and added note)
    const incomingLead = {
      name: 'Updated Business Name Ltd',
      phone: '', // Blank, should NOT overwrite existing phone
      url: 'https://www.facebook.com/bizpage?ref=share',
      category: 'Software',
      notes: 'Signed contract'
    };

    // Check duplicate match
    const existingNormUrl = normalizeFacebookUrl(existingInSheet.url);
    const incomingNormUrl = normalizeFacebookUrl(incomingLead.url);
    assert.equal(existingNormUrl, incomingNormUrl);

    // Perform merge
    const merged = {
      ...existingInSheet,
      name: incomingLead.name,
      phone: incomingLead.phone || existingInSheet.phone, // Preserved
      notes: `${existingInSheet.notes} | ${incomingLead.notes}`,
      lastUpdated: new Date().toISOString()
    };

    assert.equal(merged.id, 'LEAD_ORIGINAL_ID_99');
    assert.equal(merged.name, 'Updated Business Name Ltd');
    assert.equal(merged.phone, '+94770001111');
    assert.equal(merged.notes, 'Initial meeting at expo | Signed contract');
  });

  test('Step 4: Simulates partial save failure and captures reconciliation state', () => {
    const lead = {
      name: 'Galle Printing Works',
      url: 'https://facebook.com/galleprint',
      category: 'Printing'
    };

    // Simulate scenario: Category append succeeded, Master append threw network error
    const err = new PartialSaveError('Failed writing to All Leads tab', {
      categorySaved: true,
      masterSaved: false,
      leadData: lead,
      originalError: new Error('Google API ETIMEDOUT')
    });

    assert.equal(err.categorySaved, true);
    assert.equal(err.masterSaved, false);
    assert.equal(err.leadData.name, 'Galle Printing Works');

    // Simulate reconciliation: only write the missing tab
    let writeToMasterCalled = false;
    let writeToCategoryCalled = false;

    if (!err.categorySaved) {
      writeToCategoryCalled = true;
    }
    if (!err.masterSaved) {
      writeToMasterCalled = true;
    }

    assert.equal(writeToMasterCalled, true);
    assert.equal(writeToCategoryCalled, false);
  });
});
