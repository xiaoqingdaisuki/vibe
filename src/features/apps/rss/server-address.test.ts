import assert from 'node:assert/strict';
import test from 'node:test';

import { isPrivateAddress, selectPublicAddress } from './server-address.ts';

test('blocks private, benchmark relay, and embedded private addresses', () => {
  assert.equal(isPrivateAddress('127.0.0.1'), true);
  assert.equal(isPrivateAddress('198.18.0.1'), true);
  assert.equal(isPrivateAddress('::ffff:127.0.0.1'), true);
  assert.equal(isPrivateAddress('93.184.216.34'), false);
});

test('does not trust an attacker hostname merely because it resolves to the relay range', () => {
  assert.equal(selectPublicAddress([{ address: '198.18.12.34', family: 4 }]), undefined);
  assert.deepEqual(
    selectPublicAddress([
      { address: '10.0.0.1', family: 4 },
      { address: '93.184.216.34', family: 4 },
    ]),
    { address: '93.184.216.34', family: 4 },
  );
});
