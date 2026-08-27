import assert from 'node:assert/strict';
import test from 'node:test';

import { shouldShowIosInstallGuide } from './pwa-install.ts';

test('shows the manual install guide on iPhone and iPad browsers', () => {
  assert.equal(
    shouldShowIosInstallGuide({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
      isStandalone: false,
    }),
    true,
  );
  assert.equal(
    shouldShowIosInstallGuide({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15)',
      platform: 'MacIntel',
      maxTouchPoints: 5,
      isStandalone: false,
    }),
    true,
  );
});

test('hides the manual install guide outside iOS and after installation', () => {
  assert.equal(
    shouldShowIosInstallGuide({
      userAgent: 'Mozilla/5.0 (Linux; Android 15)',
      platform: 'Linux armv81',
      maxTouchPoints: 5,
      isStandalone: false,
    }),
    false,
  );
  assert.equal(
    shouldShowIosInstallGuide({
      userAgent: 'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X)',
      platform: 'iPhone',
      maxTouchPoints: 5,
      isStandalone: true,
    }),
    false,
  );
});
