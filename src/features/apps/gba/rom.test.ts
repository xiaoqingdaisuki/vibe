import assert from 'node:assert/strict';
import test from 'node:test';
import { getRomFileName } from './rom.ts';

test('getRomFileName creates a filesystem-safe, hash-scoped name', () => {
  assert.equal(getRomFileName('My Pokémon.gba', '1234567890abcdef1234'), 'My-Pok-mon-1234567890abcdef.gba');
  assert.equal(getRomFileName('.gba', '1234567890abcdef'), 'game-1234567890abcdef.gba');
});
