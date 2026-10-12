import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  validateCategoryName,
  sanitizeCategoryName,
  validateLead,
  MASTER_SHEET_NAME
} from '../../src/utils/validation.js';

describe('Validation Utilities', () => {
  describe('sanitizeCategoryName', () => {
    test('removes forbidden characters: * ? : / \\ [ ]', () => {
      assert.equal(sanitizeCategoryName('Tech/IT:Software [Sri Lanka] *?'), 'Tech-IT-Software -Sri Lanka');
    });

    test('strips leading and trailing apostrophes', () => {
      assert.equal(sanitizeCategoryName("'Automotive'"), 'Automotive');
    });

    test('truncates strings longer than 100 characters', () => {
      const longName = 'A'.repeat(120);
      assert.equal(sanitizeCategoryName(longName).length, 100);
    });
  });

  describe('validateCategoryName', () => {
    test('accepts clean category names', () => {
      const res = validateCategoryName('Software & IT');
      assert.equal(res.isValid, true);
      assert.equal(res.sanitizedName, 'Software & IT');
      assert.equal(res.error, null);
    });

    test('rejects empty or whitespace names', () => {
      const res = validateCategoryName('   ');
      assert.equal(res.isValid, false);
      assert.match(res.error, /cannot be empty/i);
    });

    test('rejects master sheet name "All Leads"', () => {
      const res = validateCategoryName('All Leads');
      assert.equal(res.isValid, false);
      assert.match(res.error, /reserved/i);

      const caseRes = validateCategoryName('all leads');
      assert.equal(caseRes.isValid, false);
    });

    test('detects case-insensitive collisions with existing categories', () => {
      const existing = ['Retail', 'Printing', 'Software'];
      const res = validateCategoryName('software', existing);
      assert.equal(res.isValid, false);
      assert.match(res.error, /already exists/i);
    });
  });

  describe('validateLead', () => {
    test('passes for valid complete lead', () => {
      const validPayload = {
        name: 'Acme Solutions',
        url: 'https://facebook.com/acmesolutions',
        category: 'Software',
        phone: '+94771234567',
        email: 'info@acme.lk',
        website: 'https://acme.lk'
      };
      const result = validateLead(validPayload);
      assert.equal(result.isValid, true);
      assert.equal(Object.keys(result.errors).length, 0);
      assert.equal(result.normalizedLead.name, 'Acme Solutions');
      assert.equal(result.normalizedLead.url, 'https://www.facebook.com/acmesolutions');
    });

    test('fails when required fields are missing', () => {
      const missingPayload = {
        name: '',
        url: '',
        category: ''
      };
      const result = validateLead(missingPayload);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.name);
      assert.ok(result.errors.url);
      assert.ok(result.errors.category);
    });

    test('validates email format when provided', () => {
      const payload = {
        name: 'Acme',
        url: 'https://facebook.com/acme',
        category: 'General',
        email: 'invalid-email-address'
      };
      const result = validateLead(payload);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.email);
    });

    test('validates website format when provided', () => {
      const payload = {
        name: 'Acme',
        url: 'https://facebook.com/acme',
        category: 'General',
        website: 'notaurl'
      };
      const result = validateLead(payload);
      assert.equal(result.isValid, false);
      assert.ok(result.errors.website);
    });
  });
});
