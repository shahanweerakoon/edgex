import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  extractWhatsAppNumberFromUrl,
  normalizePhoneNumber,
  isPossiblePhoneNumber,
  prioritizeContactNumber,
  getPhoneMatchKey
} from '../../src/utils/phone-normalizer.js';

describe('Phone Normalizer', () => {
  describe('extractWhatsAppNumberFromUrl', () => {
    test('extracts phone from wa.me shortlinks', () => {
      assert.equal(extractWhatsAppNumberFromUrl('https://wa.me/94771234567'), '+94771234567');
      assert.equal(extractWhatsAppNumberFromUrl('https://wa.me/+94771234567'), '+94771234567');
    });

    test('extracts phone from api.whatsapp.com URLs', () => {
      assert.equal(
        extractWhatsAppNumberFromUrl('https://api.whatsapp.com/send?phone=94771234567&text=Hello'),
        '+94771234567'
      );
      assert.equal(
        extractWhatsAppNumberFromUrl('https://api.whatsapp.com/send/?phone=+14155552671'),
        '+14155552671'
      );
    });

    test('ignores non-phone WhatsApp links like group invites', () => {
      assert.equal(extractWhatsAppNumberFromUrl('https://chat.whatsapp.com/INVITECODE'), null);
    });
  });

  describe('normalizePhoneNumber', () => {
    test('preserves Sri Lankan country code (+94)', () => {
      assert.equal(normalizePhoneNumber('+94 77 123 4567'), '+94771234567');
      assert.equal(normalizePhoneNumber('+94 (11) 234-5678'), '+94112345678');
    });

    test('converts 00 international prefix to +', () => {
      assert.equal(normalizePhoneNumber('0094771234567'), '+94771234567');
    });

    test('preserves local Sri Lankan format without guessing country code', () => {
      assert.equal(normalizePhoneNumber('077 123 4567'), '0771234567');
      assert.equal(normalizePhoneNumber('011-2345678'), '0112345678');
    });

    test('preserves US and international formats', () => {
      assert.equal(normalizePhoneNumber('+1 (555) 234-5678'), '+15552345678');
      assert.equal(normalizePhoneNumber('+44 20 7946 0958'), '+442079460958');
    });

    test('handles empty or non-string inputs gracefully', () => {
      assert.equal(normalizePhoneNumber(''), '');
      assert.equal(normalizePhoneNumber(null), '');
      assert.equal(normalizePhoneNumber('abc'), '');
    });
  });

  describe('isPossiblePhoneNumber', () => {
    test('validates numbers with sufficient digits', () => {
      assert.equal(isPossiblePhoneNumber('+94771234567'), true);
      assert.equal(isPossiblePhoneNumber('0771234567'), true);
      assert.equal(isPossiblePhoneNumber('12345'), false); // too short
      assert.equal(isPossiblePhoneNumber('not a number'), false);
    });
  });

  describe('prioritizeContactNumber', () => {
    test('prioritizes WhatsApp number over regular phone number', () => {
      const result = prioritizeContactNumber({
        whatsapp: '+94 77 111 2222',
        phone: '+94 11 222 3333'
      });
      assert.equal(result.prioritizedNumber, '+94771112222');
      assert.equal(result.isWhatsApp, true);
    });

    test('falls back to business phone number if WhatsApp is absent', () => {
      const result = prioritizeContactNumber({
        whatsapp: null,
        phone: '+94 11 222 3333'
      });
      assert.equal(result.prioritizedNumber, '+94112223333');
      assert.equal(result.isWhatsApp, false);
    });

    test('returns blank if neither is available', () => {
      const result = prioritizeContactNumber({});
      assert.equal(result.prioritizedNumber, '');
      assert.equal(result.isWhatsApp, false);
    });
  });

  describe('getPhoneMatchKey', () => {
    test('matches local and international versions using suffix digits', () => {
      const localKey = getPhoneMatchKey('0771234567');
      const intlKey = getPhoneMatchKey('+94771234567');
      assert.equal(localKey, intlKey);
    });
  });
});
