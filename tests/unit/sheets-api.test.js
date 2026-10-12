import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { extractSpreadsheetId } from '../../src/services/sheets-api.js';

describe('Google Sheets API Helpers', () => {
  describe('extractSpreadsheetId', () => {
    test('extracts ID from full standard Google Sheets URL', () => {
      const url = 'https://docs.google.com/spreadsheets/d/1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms/edit#gid=0';
      assert.equal(extractSpreadsheetId(url), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    });

    test('extracts ID from URL with query parameters and sharing links', () => {
      const url = 'https://docs.google.com/spreadsheets/d/1a2b3c4d5e6f7g8h9i0j-klmnopqrstuvwxyz_12345/edit?usp=sharing';
      assert.equal(extractSpreadsheetId(url), '1a2b3c4d5e6f7g8h9i0j-klmnopqrstuvwxyz_12345');
    });

    test('accepts raw spreadsheet ID directly without modification', () => {
      const rawId = '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms';
      assert.equal(extractSpreadsheetId(rawId), rawId);
    });

    test('handles leading and trailing whitespace', () => {
      const rawId = '  1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms  ';
      assert.equal(extractSpreadsheetId(rawId), '1BxiMVs0XRA5nFMdKvBdBZjgmUUqptlbs74OgvE2upms');
    });

    test('handles empty and null inputs', () => {
      assert.equal(extractSpreadsheetId(''), '');
      assert.equal(extractSpreadsheetId(null), '');
    });
  });
});
