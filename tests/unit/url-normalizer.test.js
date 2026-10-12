import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  isFacebookUrl,
  normalizeFacebookUrl,
  unwrapFacebookRedirect,
  extractFacebookPageType
} from '../../src/utils/url-normalizer.js';

describe('URL Normalizer', () => {
  describe('isFacebookUrl', () => {
    test('identifies standard facebook domains', () => {
      assert.equal(isFacebookUrl('https://www.facebook.com/Nike'), true);
      assert.equal(isFacebookUrl('https://facebook.com/Nike'), true);
      assert.equal(isFacebookUrl('https://m.facebook.com/Nike'), true);
      assert.equal(isFacebookUrl('https://web.facebook.com/Nike'), true);
      assert.equal(isFacebookUrl('https://fb.me/Nike'), true);
      assert.equal(isFacebookUrl('https://fb.watch/12345'), true);
    });

    test('rejects non-facebook domains', () => {
      assert.equal(isFacebookUrl('https://google.com'), false);
      assert.equal(isFacebookUrl('https://notfacebook.com'), false);
      assert.equal(isFacebookUrl(''), false);
      assert.equal(isFacebookUrl(null), false);
    });
  });

  describe('normalizeFacebookUrl', () => {
    test('strips tracking query parameters while preserving path', () => {
      const dirty = 'https://m.facebook.com/Nike?fbclid=IwAR2...&ref=bookmarks&__tn__=C-R';
      const clean = normalizeFacebookUrl(dirty);
      assert.equal(clean, 'https://www.facebook.com/Nike');
    });

    test('preserves profile.php ID parameter', () => {
      const dirty = 'https://web.facebook.com/profile.php?id=1000123456789&sk=about&ref=page_internal';
      const clean = normalizeFacebookUrl(dirty);
      assert.equal(clean, 'https://www.facebook.com/profile.php?id=1000123456789');
    });

    test('handles trailing slashes consistently', () => {
      const withSlash = 'https://www.facebook.com/Nike/';
      assert.equal(normalizeFacebookUrl(withSlash), 'https://www.facebook.com/Nike');
    });

    test('unwraps l.facebook.com redirects within normalize', () => {
      const redirect = 'https://l.facebook.com/l.php?u=https%3A%2F%2Fwww.facebook.com%2FBrandName%3Fref%3Dshare';
      const clean = normalizeFacebookUrl(redirect);
      assert.equal(clean, 'https://www.facebook.com/BrandName');
    });

    test('handles missing protocol cleanly', () => {
      assert.equal(normalizeFacebookUrl('facebook.com/mybrand/'), 'https://www.facebook.com/mybrand');
    });
  });

  describe('unwrapFacebookRedirect', () => {
    test('extracts direct external target from l.php link', () => {
      const redirect = 'https://l.facebook.com/l.php?u=https%3A%2F%2Fexample.com%2Fshop%3Fitem%3D123&h=AT1...';
      const destination = unwrapFacebookRedirect(redirect);
      assert.equal(destination, 'https://example.com/shop?item=123');
    });

    test('returns untouched URL if not a redirect', () => {
      assert.equal(unwrapFacebookRedirect('https://example.com/shop'), 'https://example.com/shop');
    });
  });

  describe('extractFacebookPageType', () => {
    test('classifies groups and posts', () => {
      assert.equal(extractFacebookPageType('https://www.facebook.com/groups/123456/'), 'Public Group');
      assert.equal(extractFacebookPageType('https://www.facebook.com/groups/123456/posts/789/'), 'Post');
      assert.equal(extractFacebookPageType('https://www.facebook.com/Nike/posts/10101010/'), 'Post');
    });

    test('classifies profiles and pages', () => {
      assert.equal(extractFacebookPageType('https://www.facebook.com/profile.php?id=1000123'), 'Personal Profile');
      assert.equal(extractFacebookPageType('https://www.facebook.com/people/John-Doe/1000/'), 'Personal Profile');
      assert.equal(extractFacebookPageType('https://www.facebook.com/Nike/'), 'Business Page');
    });
  });
});
