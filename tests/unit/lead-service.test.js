import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { PartialSaveError, ValidationError, SheetsError } from '../../src/utils/errors.js';
import { validateLead } from '../../src/utils/validation.js';
import { leadToRow, rowToLead } from '../../src/services/lead-model.js';

describe('Lead Service Logic and Recovery', () => {
  test('validates and rejects incomplete lead payloads before network calls', () => {
    const invalid = { name: '', url: 'not a url' };
    const res = validateLead(invalid);
    assert.equal(res.isValid, false);
    assert.ok(res.errors.name);
    assert.ok(res.errors.category);
  });

  test('PartialSaveError captures failed state and diagnostic details', () => {
    const lead = {
      name: 'Test Business',
      url: 'https://facebook.com/testbiz',
      category: 'Software'
    };

    const err = new PartialSaveError('Failed to append to All Leads', {
      categorySaved: true,
      masterSaved: false,
      leadData: lead,
      originalError: new Error('Network timeout on master sheet')
    });

    assert.equal(err.code, 'PARTIAL_SAVE_ERROR');
    assert.equal(err.categorySaved, true);
    assert.equal(err.masterSaved, false);
    assert.equal(err.leadData.name, 'Test Business');
    assert.match(err.recoveryHint, /Retry/i);
  });

  test('update lead merges fields while preserving existing information', () => {
    const existingLead = {
      rowIndex: 4,
      name: 'Original Name',
      phone: '+94771234567',
      url: 'https://www.facebook.com/original',
      id: 'LEAD_ORIGINAL_ID',
      category: 'Retail',
      notes: 'First interaction note',
      dateAdded: '2026-09-01T10:00:00Z'
    };

    const updates = {
      name: 'Updated Business Name',
      phone: '', // user left phone blank, existing should be preserved
      url: 'https://www.facebook.com/original',
      category: 'Retail',
      notes: 'Second meeting done'
    };

    const merged = {
      ...existingLead,
      ...updates,
      phone: updates.phone || existingLead.phone,
      notes: existingLead.notes ? `${existingLead.notes} | ${updates.notes}` : updates.notes,
      lastUpdated: '2026-10-12T00:00:00Z'
    };

    assert.equal(merged.id, 'LEAD_ORIGINAL_ID'); // Stable ID preserved
    assert.equal(merged.name, 'Updated Business Name');
    assert.equal(merged.phone, '+94771234567'); // Preserved
    assert.equal(merged.notes, 'First interaction note | Second meeting done');
  });
});
