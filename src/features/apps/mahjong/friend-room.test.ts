import assert from 'node:assert/strict';
import test from 'node:test';
import {
  addFriendRoomGuest,
  canStartFriendRoom,
  removeFriendRoomGuest,
  createFriendRoomSnapshot,
  setFriendRoomReady,
  startFriendRoom,
} from './friend-room.ts';

test('友人房最多容纳房主和三名成员', () => {
  let room = createFriendRoomSnapshot('1234', 'host');
  room = addFriendRoomGuest(room, 'guest-1')!;
  room = addFriendRoomGuest(room, 'guest-2')!;
  room = addFriendRoomGuest(room, 'guest-3')!;

  assert.equal(room.seats.length, 4);
  assert.equal(addFriendRoomGuest(room, 'guest-4'), null);
});

test('四席全部准备后才允许房主开始友人对局', () => {
  let room = createFriendRoomSnapshot('5678', 'host');
  room = addFriendRoomGuest(room, 'guest-1')!;
  room = addFriendRoomGuest(room, 'guest-2')!;
  room = addFriendRoomGuest(room, 'guest-3')!;

  assert.equal(canStartFriendRoom(room), false);
  for (const seat of room.seats) room = setFriendRoomReady(room, seat.id, true)!;

  assert.equal(canStartFriendRoom(room), true);
  assert.equal(startFriendRoom(room)?.phase, 'started');
});

test('未知成员不能修改房间准备状态', () => {
  const room = createFriendRoomSnapshot('9012', 'host');

  assert.equal(setFriendRoomReady(room, 'unknown', true), null);
});

test('成员离开等待房间后释放席位并重新编号', () => {
  let room = createFriendRoomSnapshot('3456', 'host');
  room = addFriendRoomGuest(room, 'guest-1')!;
  room = addFriendRoomGuest(room, 'guest-2')!;

  const updated = removeFriendRoomGuest(room, 'guest-1');

  assert.equal(updated?.seats.length, 2);
  assert.deepEqual(
    updated?.seats.map((seat) => seat.label),
    ['房主', '玩家 2'],
  );
  assert.equal(removeFriendRoomGuest(room, 'host'), null);
});
