import { createServer } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';

const configuredPort = Number(process.env.MAHJONG_ROOM_PORT ?? 8787);
const PORT = Number.isInteger(configuredPort) && configuredPort > 0 ? configuredPort : 8787;
const ROOM_LIMIT = 4;
const configuredTtl = Number(process.env.MAHJONG_ROOM_TTL_MS ?? 2 * 60 * 60 * 1000);
const ROOM_TTL_MS = Number.isFinite(configuredTtl) && configuredTtl > 0 ? configuredTtl : 2 * 60 * 60 * 1000;
const rooms = new Map();

// 检查房间码是否为可分享的四位数字
function isRoomCode(value) {
  return /^\d{4}$/.test(value);
}

// 检查连接成员标识，避免把任意字符串写入房间目录
function isMemberId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{4,96}$/.test(value);
}

// 向仍然打开的 WebSocket 发送一帧 JSON
function sendFrame(socket, frame) {
  if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(frame));
}

// 拒绝连接并返回可展示给用户的错误原因
function rejectSocket(socket, code, detail) {
  sendFrame(socket, { kind: 'transport-error', code, detail });
  if (socket.readyState === WebSocket.OPEN || socket.readyState === WebSocket.CONNECTING) {
    socket.close(1008, code);
  }
}

// 解析升级请求中的房间码、成员标识和角色
function parseConnectionRequest(request) {
  try {
    const url = new URL(request.url ?? '/', 'http://mahjong.local');
    const match = url.pathname.match(/^\/rooms\/(\d{4})$/);
    const code = match?.[1] ?? '';
    const memberId = url.searchParams.get('memberId') ?? '';
    const role = url.searchParams.get('role');
    if (!isRoomCode(code) || !isMemberId(memberId) || (role !== 'host' && role !== 'guest')) return null;
    return { code, memberId, role };
  } catch {
    return null;
  }
}

// 校验服务端转发所需的最小牌局房间消息结构
function isFriendMessage(value) {
  if (!value || typeof value !== 'object') return false;
  const message = value;
  if (message.type === 'join-request' || message.type === 'leave-request') return isMemberId(message.memberId);
  if (message.type === 'set-ready') return isMemberId(message.memberId) && typeof message.ready === 'boolean';
  if (message.type === 'room-closed') return true;
  if (message.type === 'snapshot') return isFriendSnapshot(message.snapshot);
  return false;
}

// 校验服务端转发的完整房间快照
function isFriendSnapshot(value) {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value;
  const hostSeats = Array.isArray(snapshot.seats) ? snapshot.seats.filter((seat) => seat?.isHost) : [];
  const seatIds = Array.isArray(snapshot.seats) ? snapshot.seats.map((seat) => seat?.id) : [];
  return (
    isRoomCode(snapshot.code) &&
    isMemberId(snapshot.hostId) &&
    (snapshot.phase === 'waiting' || snapshot.phase === 'started') &&
    Number.isInteger(snapshot.revision) &&
    snapshot.revision >= 0 &&
    Number.isFinite(snapshot.updatedAt) &&
    Array.isArray(snapshot.seats) &&
    snapshot.seats.length > 0 &&
    snapshot.seats.length <= ROOM_LIMIT &&
    snapshot.seats.every(isFriendSeat) &&
    new Set(seatIds).size === snapshot.seats.length &&
    hostSeats.length === 1 &&
    hostSeats[0].id === snapshot.hostId &&
    (snapshot.phase === 'waiting' ||
      (snapshot.seats.length === ROOM_LIMIT && snapshot.seats.every((seat) => seat.connected && seat.ready)))
  );
}

// 校验单个席位，防止客户端消息注入额外字段结构
function isFriendSeat(value) {
  if (!value || typeof value !== 'object') return false;
  const seat = value;
  return (
    isMemberId(seat.id) &&
    typeof seat.label === 'string' &&
    typeof seat.ready === 'boolean' &&
    typeof seat.connected === 'boolean' &&
    typeof seat.isHost === 'boolean'
  );
}

// 解析客户端发送的控制帧或友人房消息帧
function parseClientFrame(raw) {
  try {
    const frame = JSON.parse(raw.toString());
    return frame && typeof frame === 'object' ? frame : null;
  } catch {
    return null;
  }
}

// 向房主转发成员请求，房主仍然是房间状态的唯一裁决者
function sendToHost(room, message) {
  const host = room.connections.get(room.hostId);
  if (host) sendFrame(host.socket, { kind: 'friend', message });
}

// 向房间内所有成员广播房主已经裁决的快照
function broadcastSnapshot(room, message) {
  for (const connection of room.connections.values()) {
    if (connection.role === 'guest') sendFrame(connection.socket, { kind: 'friend', message });
  }
}

// 通知并关闭房间内的所有连接，避免 TTL 后留下孤立房主
function closeRoom(room, message) {
  if (rooms.get(room.code) !== room) return;
  rooms.delete(room.code);
  for (const connection of room.connections.values()) {
    sendFrame(connection.socket, { kind: 'friend', message });
    connection.socket.close(1000, 'room-closed');
  }
}

// 处理房主和成员发送的业务消息，拒绝越权转发
function handleFriendFrame(connection, message) {
  const { room } = connection;
  if (!isFriendMessage(message)) return;
  room.updatedAt = Date.now();
  if (connection.role === 'guest') {
    if (
      (message.type === 'join-request' || message.type === 'leave-request' || message.type === 'set-ready') &&
      message.memberId === connection.memberId
    ) {
      sendToHost(room, message);
    }
    return;
  }
  if (
    message.type === 'snapshot' &&
    message.snapshot.code === room.code &&
    message.snapshot.hostId === connection.memberId &&
    message.snapshot.revision > room.revision &&
    !(room.phase === 'started' && message.snapshot.phase === 'waiting')
  ) {
    room.phase = message.snapshot.phase;
    room.revision = message.snapshot.revision;
    broadcastSnapshot(room, message);
    return;
  }
  if (message.type === 'room-closed') {
    closeRoom(room, message);
  }
}

// 清理断开的房间成员，并在访客离开时通知房主释放席位
function handleSocketClose(connection) {
  const { room } = connection;
  if (rooms.get(room.code) !== room) return;
  if (room.connections.get(connection.memberId) !== connection) return;
  room.connections.delete(connection.memberId);
  room.updatedAt = Date.now();
  if (connection.role === 'host') {
    closeRoom(room, { type: 'room-closed' });
    return;
  }
  sendToHost(room, { type: 'leave-request', memberId: connection.memberId });
}

// 为新的 WebSocket 连接注册房间、握手和消息生命周期
function handleSocketConnection(socket, request) {
  const identity = parseConnectionRequest(request);
  if (!identity) {
    rejectSocket(socket, 'INVALID_REQUEST', '房间连接参数无效。');
    return;
  }
  let room = rooms.get(identity.code);
  if (identity.role === 'host') {
    if (room && room.hostId !== identity.memberId) {
      rejectSocket(socket, 'ROOM_EXISTS', '房间码已被占用，请重新创建房间。');
      return;
    }
    if (!room) {
      room = {
        code: identity.code,
        hostId: identity.memberId,
        phase: 'waiting',
        revision: 0,
        updatedAt: Date.now(),
        connections: new Map(),
      };
      rooms.set(identity.code, room);
    }
  } else {
    if (!room) {
      rejectSocket(socket, 'ROOM_NOT_FOUND', '没有找到这个房间，请确认房间码。');
      return;
    }
    if (room.phase === 'started') {
      rejectSocket(socket, 'ROOM_STARTED', '这个房间已经开始对局。');
      return;
    }
    if (identity.memberId === room.hostId) {
      rejectSocket(socket, 'MEMBER_ROLE_CONFLICT', '房主成员标识不能以访客身份加入。');
      return;
    }
    if (room.connections.size >= ROOM_LIMIT && !room.connections.has(identity.memberId)) {
      rejectSocket(socket, 'ROOM_FULL', '房间已满。');
      return;
    }
  }
  const previous = room.connections.get(identity.memberId);
  previous?.socket.close(1000, 'reconnected');
  const connection = { socket, room, memberId: identity.memberId, role: identity.role };
  room.connections.set(identity.memberId, connection);
  room.updatedAt = Date.now();

  // 接收客户端控制握手和业务消息
  function handleMessage(raw) {
    const frame = parseClientFrame(raw);
    if (!frame) return;
    if (frame.kind === 'hello') return;
    if (frame.kind === 'friend') handleFriendFrame(connection, frame.message);
  }
  // 连接关闭时释放席位并通知房主
  function handleClose() {
    handleSocketClose(connection);
  }
  socket.on('message', handleMessage);
  socket.on('close', handleClose);
  socket.on('error', handleClose);
  if (identity.role === 'guest') sendToHost(room, { type: 'join-request', memberId: identity.memberId });
}

// 提供健康检查，方便部署平台判断临时房间服务是否在线
function handleHttpRequest(request, response) {
  if (request.url === '/healthz') {
    response.writeHead(200, { 'content-type': 'application/json; charset=utf-8' });
    response.end(JSON.stringify({ ok: true, rooms: rooms.size }));
    return;
  }
  response.writeHead(404, { 'content-type': 'application/json; charset=utf-8' });
  response.end(JSON.stringify({ error: 'not_found' }));
}

// 定期清理过期房间并探测失联的 WebSocket
function sweepRooms() {
  const now = Date.now();
  for (const room of rooms.values()) {
    if (now - room.updatedAt > ROOM_TTL_MS) {
      closeRoom(room, { type: 'room-closed' });
      continue;
    }
    for (const connection of room.connections.values()) {
      if (connection.socket.readyState === WebSocket.OPEN) connection.socket.ping();
    }
  }
}

const httpServer = createServer(handleHttpRequest);
const webSocketServer = new WebSocketServer({ maxPayload: 64 * 1024, server: httpServer });
webSocketServer.on('connection', handleSocketConnection);
const sweepTimer = setInterval(sweepRooms, 30_000);

// 优雅关闭服务，避免部署滚动更新时遗留半开的房间连接
function shutdown() {
  clearInterval(sweepTimer);
  for (const room of rooms.values()) closeRoom(room, { type: 'room-closed' });
  webSocketServer.close();
  httpServer.close(() => process.exit(0));
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
httpServer.listen(PORT, () => {
  console.log(`Mahjong room signal server listening on :${PORT}`);
});
