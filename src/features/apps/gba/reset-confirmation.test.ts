import assert from 'node:assert/strict';
import test from 'node:test';
import { confirmGbaReset, RESET_CONFIRMATION_MESSAGES } from './reset-confirmation.ts';

test('requires both reset confirmations in order', () => {
  const messages: string[] = [];
  const confirmed = confirmGbaReset((message) => {
    messages.push(message);
    return true;
  });

  assert.equal(confirmed, true);
  assert.deepEqual(messages, RESET_CONFIRMATION_MESSAGES);
});

test('stops reset confirmation after the first rejection', () => {
  const messages: string[] = [];
  const confirmed = confirmGbaReset((message) => {
    messages.push(message);
    return false;
  });

  assert.equal(confirmed, false);
  assert.deepEqual(messages, [RESET_CONFIRMATION_MESSAGES[0]]);
});
