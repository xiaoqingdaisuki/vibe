import assert from 'node:assert/strict';
import test from 'node:test';
import dayjs from 'dayjs';
import { formatCopyValue, formatUtcOffset, formatWorldClock } from './timezone-utils.ts';

const sampleTime = dayjs('2026-08-13T12:34:56.789+08:00');

test('formats world clocks using the selected IANA timezone', () => {
  assert.equal(formatWorldClock(sampleTime, 'Asia/Shanghai'), '12:34:56');
  assert.equal(formatWorldClock(sampleTime, 'America/New_York'), '00:34:56');
  assert.equal(formatUtcOffset(sampleTime, 'America/New_York'), 'UTC-04:00');
});

test('formats standard copy values with dayjs', () => {
  assert.equal(
    formatCopyValue(sampleTime, { id: 'iso-utc', label: 'ISO 8601（UTC）', pattern: 'YYYY-MM-DDTHH:mm:ss[Z]' }),
    '2026-08-13T04:34:56Z',
  );
  assert.equal(
    formatCopyValue(sampleTime, { id: 'unix-seconds', label: 'Unix 时间戳（秒）', pattern: 'X' }),
    '1786595696',
  );
});
