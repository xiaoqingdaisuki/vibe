export const FRIEND_ROOM_LIMIT = 4;
export const FRIEND_ROOM_STORAGE_PREFIX = 'mahjong:friend-room:';
export const FRIEND_ROOM_MESSAGE_PREFIX = 'mahjong:friend-message:';

export type FriendRoomPhase = 'waiting' | 'started';

export interface FriendRoomSeat {
  id: string;
  label: string;
  ready: boolean;
  connected: boolean;
  isHost: boolean;
}

export interface FriendRoomSnapshot {
  code: string;
  hostId: string;
  phase: FriendRoomPhase;
  revision: number;
  updatedAt: number;
  seats: FriendRoomSeat[];
}

export type FriendRoomMessage =
  | { type: 'join-request'; memberId: string }
  | { type: 'leave-request'; memberId: string }
  | { type: 'set-ready'; memberId: string; ready: boolean }
  | { type: 'snapshot'; snapshot: FriendRoomSnapshot }
  | { type: 'room-closed' };

export interface FriendRoomTransport {
  post(message: FriendRoomMessage): void;
  close(): void;
}

export type FriendRoomTransportStatus = 'connecting' | 'connected' | 'closed' | 'error';

export interface NetworkFriendRoomTransportOptions {
  url: string;
  code: string;
  memberId: string;
  role: 'host' | 'guest';
  onMessage: (message: FriendRoomMessage) => void;
  onStatus?: (status: FriendRoomTransportStatus, detail?: string) => void;
}

// 读取部署时注入的临时房间服务地址
export function getFriendRoomSignalUrl(): string {
  if (typeof process === 'undefined') return '';
  return process.env.NEXT_PUBLIC_MAHJONG_SIGNAL_URL?.trim() ?? '';
}

// 创建等待远程房间快照，收到房主同步后再填充四个席位
export function createFriendRoomPlaceholder(code: string): FriendRoomSnapshot {
  return {
    code,
    hostId: '',
    phase: 'waiting',
    revision: 0,
    updatedAt: Date.now(),
    seats: [],
  };
}

// 生成只在当前浏览器会话内使用的稳定成员标识
export function createFriendSessionId(): string {
  const random = new Uint32Array(2);
  if (typeof crypto !== 'undefined' && typeof crypto.getRandomValues === 'function') {
    crypto.getRandomValues(random);
  } else {
    random[0] = Math.floor(Math.random() * 0xffffffff);
    random[1] = Math.floor(Math.random() * 0xffffffff);
  }
  return `m${random[0].toString(36).padStart(7, '0')}${random[1].toString(36).padStart(7, '0')}`;
}

// 生成便于口头分享的四位数字房间码
export function createFriendRoomCode(): string {
  return String(1000 + Math.floor(Math.random() * 9000));
}

// 创建房主占用首席的等待中房间快照
export function createFriendRoomSnapshot(code: string, hostId: string): FriendRoomSnapshot {
  return {
    code,
    hostId,
    phase: 'waiting',
    revision: 1,
    updatedAt: Date.now(),
    seats: [
      {
        id: hostId,
        label: '房主',
        ready: false,
        connected: true,
        isHost: true,
      },
    ],
  };
}

// 将一名新成员加入首个空席，并返回递增版本的快照
export function addFriendRoomGuest(snapshot: FriendRoomSnapshot, memberId: string): FriendRoomSnapshot | null {
  if (snapshot.phase !== 'waiting') return null;
  if (snapshot.seats.some((seat) => seat.id === memberId)) return snapshot;
  if (snapshot.seats.length >= FRIEND_ROOM_LIMIT) return null;
  const nextSeat = snapshot.seats.length + 1;
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    updatedAt: Date.now(),
    seats: [
      ...snapshot.seats,
      {
        id: memberId,
        label: `玩家 ${nextSeat}`,
        ready: false,
        connected: true,
        isHost: false,
      },
    ],
  };
}

// 移除主动离开的成员并释放席位，避免房间被旧连接永久占用
export function removeFriendRoomGuest(snapshot: FriendRoomSnapshot, memberId: string): FriendRoomSnapshot | null {
  if (snapshot.phase !== 'waiting' || memberId === snapshot.hostId) return null;
  if (!snapshot.seats.some((seat) => seat.id === memberId)) return null;
  let guestLabel = 2;
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    updatedAt: Date.now(),
    seats: snapshot.seats
      .filter((seat) => seat.id !== memberId)
      .map((seat) => (seat.isHost ? seat : { ...seat, label: `玩家 ${guestLabel++}` })),
  };
}

// 更新成员准备状态，防止未知成员直接修改房间
export function setFriendRoomReady(
  snapshot: FriendRoomSnapshot,
  memberId: string,
  ready: boolean,
): FriendRoomSnapshot | null {
  if (snapshot.phase !== 'waiting') return null;
  if (!snapshot.seats.some((seat) => seat.id === memberId)) return null;
  return {
    ...snapshot,
    revision: snapshot.revision + 1,
    updatedAt: Date.now(),
    seats: snapshot.seats.map((seat) => (seat.id === memberId ? { ...seat, ready, connected: true } : seat)),
  };
}

// 只有四席全部连接且准备后，房主才可以开始牌局
export function canStartFriendRoom(snapshot: FriendRoomSnapshot): boolean {
  return (
    snapshot.phase === 'waiting' &&
    snapshot.seats.length === FRIEND_ROOM_LIMIT &&
    snapshot.seats.every((seat) => seat.connected && seat.ready)
  );
}

// 将等待中的完整房间切换到友人对局阶段
export function startFriendRoom(snapshot: FriendRoomSnapshot): FriendRoomSnapshot | null {
  if (!canStartFriendRoom(snapshot)) return null;
  return {
    ...snapshot,
    phase: 'started',
    revision: snapshot.revision + 1,
    updatedAt: Date.now(),
  };
}

// 读取本地房间目录，供无服务器的同源标签页加入房间
export function readFriendRoom(code: string): FriendRoomSnapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(`${FRIEND_ROOM_STORAGE_PREFIX}${code}`);
    if (!raw) return null;
    const parsed: unknown = JSON.parse(raw);
    if (!isFriendRoomSnapshot(parsed) || parsed.code !== code) return null;
    return parsed;
  } catch {
    return null;
  }
}

// 写入本地房间目录并忽略浏览器隐私模式下的存储异常
export function writeFriendRoom(snapshot: FriendRoomSnapshot): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(`${FRIEND_ROOM_STORAGE_PREFIX}${snapshot.code}`, JSON.stringify(snapshot));
  } catch {
    // 无法持久化时仍允许当前标签页继续使用 BroadcastChannel。
  }
}

// 删除房间目录，离开房间时避免旧房间码继续可加入
export function removeFriendRoom(code: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(`${FRIEND_ROOM_STORAGE_PREFIX}${code}`);
  } catch {
    // 存储不可用时无需额外处理。
  }
}

// 打开同源标签页之间的本地通信通道，不依赖服务器或信令服务
export function openFriendRoomTransport(
  code: string,
  onMessage: (message: FriendRoomMessage) => void,
): FriendRoomTransport {
  const channel =
    typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(`${FRIEND_ROOM_MESSAGE_PREFIX}${code}`) : null;
  const storagePrefix = `${FRIEND_ROOM_MESSAGE_PREFIX}${code}:`;
  // 分发经结构校验的本地通信消息
  const dispatch = (value: unknown) => {
    if (isFriendRoomMessage(value)) onMessage(value);
  };
  // 处理 BroadcastChannel 的同源消息事件
  const onChannelMessage = (event: MessageEvent<unknown>) => dispatch(event.data);
  // 处理 BroadcastChannel 不可用时的 storage 事件回退
  const onStorageMessage = (event: StorageEvent) => {
    if (!event.key?.startsWith(storagePrefix) || !event.newValue) return;
    try {
      dispatch(JSON.parse(event.newValue));
    } catch {
      // 忽略其他标签页写入的不完整消息。
    }
  };
  let closed = false;
  channel?.addEventListener('message', onChannelMessage);
  window.addEventListener('storage', onStorageMessage);
  return {
    post(message) {
      if (closed) return;
      if (channel) {
        try {
          channel.postMessage(message);
        } catch {
          // 通道在标签页关闭竞态中失效时，安静地交给当前 UI 处理。
        }
        return;
      }
      try {
        window.localStorage.setItem(`${storagePrefix}${createFriendSessionId()}`, JSON.stringify(message));
      } catch {
        // 浏览器不支持通信时由上层显示当前标签页限制提示。
      }
    },
    close() {
      if (closed) return;
      closed = true;
      channel?.removeEventListener('message', onChannelMessage);
      channel?.close();
      window.removeEventListener('storage', onStorageMessage);
    },
  };
}

// 打开跨设备 WebSocket 房间通道，服务端只转发临时房间消息
export function openNetworkFriendRoomTransport(options: NetworkFriendRoomTransportOptions): FriendRoomTransport {
  const { url, code, memberId, role, onMessage, onStatus } = options;
  let closed = false;
  let opened = false;
  let socket: WebSocket | null = null;
  const pending: FriendRoomMessage[] = [];
  const dispatch = (value: unknown) => {
    if (isFriendRoomMessage(value)) onMessage(value);
  };
  const sendFrame = (message: FriendRoomMessage) => {
    if (!socket || socket.readyState !== WebSocket.OPEN) return;
    socket.send(JSON.stringify({ kind: 'friend', message }));
  };
  const flushPending = () => {
    while (pending.length > 0) {
      const message = pending.shift();
      if (message) sendFrame(message);
    }
  };

  onStatus?.('connecting');
  try {
    const endpoint = new URL(url);
    const basePath = endpoint.pathname.replace(/\/+$/, '');
    endpoint.pathname = `${basePath}/rooms/${code}`;
    endpoint.searchParams.set('memberId', memberId);
    endpoint.searchParams.set('role', role);
    socket = new WebSocket(endpoint);
  } catch {
    onStatus?.('error', '远程友人房服务地址无效。');
    return { post: () => undefined, close: () => undefined };
  }

  // 处理远程连接建立并先发送身份握手
  const onOpen = () => {
    if (closed || !socket) return;
    opened = true;
    socket.send(JSON.stringify({ kind: 'hello', memberId, role }));
    onStatus?.('connected');
    flushPending();
  };
  // 处理服务端转发的牌局房间消息和连接错误
  const onMessageEvent = (event: MessageEvent<unknown>) => {
    try {
      const frame: unknown = JSON.parse(typeof event.data === 'string' ? event.data : '');
      if (!frame || typeof frame !== 'object') return;
      const payload = frame as { kind?: string; message?: unknown; detail?: string };
      if (payload.kind === 'friend') dispatch(payload.message);
      if (payload.kind === 'transport-error') onStatus?.('error', payload.detail ?? '远程房间连接失败。');
    } catch {
      onStatus?.('error', '远程房间返回了无法识别的消息。');
    }
  };
  // 处理网络层异常，避免把连接失败伪装成准备成功
  const onError = () => {
    if (!closed) onStatus?.('error', '无法连接远程友人房服务，请检查网络或房间码。');
  };
  // 处理连接关闭并更新上层状态提示
  const onClose = () => {
    opened = false;
    if (!closed) onStatus?.('closed');
  };
  socket.addEventListener('open', onOpen);
  socket.addEventListener('message', onMessageEvent);
  socket.addEventListener('error', onError);
  socket.addEventListener('close', onClose);

  return {
    post(message) {
      if (closed) return;
      if (!opened) {
        pending.push(message);
        return;
      }
      sendFrame(message);
    },
    close() {
      if (closed) return;
      closed = true;
      pending.length = 0;
      socket?.removeEventListener('open', onOpen);
      socket?.removeEventListener('message', onMessageEvent);
      socket?.removeEventListener('error', onError);
      socket?.removeEventListener('close', onClose);
      socket?.close();
      socket = null;
      onStatus?.('closed');
    },
  };
}

// 校验房间快照形状，防止 localStorage 内容污染 React 状态
function isFriendRoomSnapshot(value: unknown): value is FriendRoomSnapshot {
  if (!value || typeof value !== 'object') return false;
  const snapshot = value as Partial<FriendRoomSnapshot>;
  return (
    typeof snapshot.code === 'string' &&
    /^\d{4}$/.test(snapshot.code) &&
    typeof snapshot.hostId === 'string' &&
    (snapshot.phase === 'waiting' || snapshot.phase === 'started') &&
    typeof snapshot.revision === 'number' &&
    typeof snapshot.updatedAt === 'number' &&
    Array.isArray(snapshot.seats) &&
    snapshot.seats.every(isFriendRoomSeat)
  );
}

// 校验单个席位形状，避免外部消息写入任意字段
function isFriendRoomSeat(value: unknown): value is FriendRoomSeat {
  if (!value || typeof value !== 'object') return false;
  const seat = value as Partial<FriendRoomSeat>;
  return (
    typeof seat.id === 'string' &&
    typeof seat.label === 'string' &&
    typeof seat.ready === 'boolean' &&
    typeof seat.connected === 'boolean' &&
    typeof seat.isHost === 'boolean'
  );
}

// 校验本地通信消息，拒绝未知消息类型和无效快照
function isFriendRoomMessage(value: unknown): value is FriendRoomMessage {
  if (!value || typeof value !== 'object') return false;
  const message = value as Partial<FriendRoomMessage>;
  if (message.type === 'join-request') return typeof message.memberId === 'string';
  if (message.type === 'leave-request') return typeof message.memberId === 'string';
  if (message.type === 'set-ready') {
    return typeof message.memberId === 'string' && typeof message.ready === 'boolean';
  }
  if (message.type === 'room-closed') return true;
  if (message.type === 'snapshot') return isFriendRoomSnapshot(message.snapshot);
  return false;
}
