'use client';

import { useEffect, useRef, useState } from 'react';
import { applyAction, createMatch, getLegalActions, playAiTurn, startNextRound } from './core/engine';
import {
  addFriendRoomGuest,
  canStartFriendRoom,
  createFriendRoomCode,
  createFriendRoomPlaceholder,
  createFriendRoomSnapshot,
  createFriendSessionId,
  getFriendRoomSignalUrl,
  openNetworkFriendRoomTransport,
  removeFriendRoomGuest,
  setFriendRoomReady,
  startFriendRoom,
  type FriendRoomMessage,
  type FriendRoomSnapshot,
  type FriendRoomTransportStatus,
  type FriendRoomTransport,
} from './friend-room';
import type { LegalAction, MahjongState } from './core/types';
import {
  PixiMahjongSurface,
  type MahjongFriendAction,
  type MahjongFriendTransportMode,
  type MahjongFriendView,
  type MahjongScreen,
  type MahjongUtilityPanel,
} from './components/PixiMahjongSurface';

const INITIAL_SEED = 3903255371;

// 渲染纯前端单人与友人牌局，所有交互委托给 Pixi Canvas
export default function Mahjong() {
  const [screen, setScreen] = useState<MahjongScreen>('lobby');
  const [utilityPanel, setUtilityPanel] = useState<MahjongUtilityPanel>('none');
  const [utilityScroll, setUtilityScroll] = useState(0);
  const [state, setState] = useState<MahjongState>(() => createMatch(INITIAL_SEED));
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [friendView, setFriendView] = useState<MahjongFriendView>('entry');
  const [friendRoom, setFriendRoom] = useState<FriendRoomSnapshot | null>(null);
  const [friendLocalPlayerId, setFriendLocalPlayerId] = useState<string | null>(null);
  const [friendCodeInput, setFriendCodeInput] = useState('');
  const [friendNotice, setFriendNotice] = useState('输入房主分享的 4 位房间码即可跨设备加入。');
  const [friendReadyConfirm, setFriendReadyConfirm] = useState(false);
  const friendSignalUrl = getFriendRoomSignalUrl();
  const friendTransportMode: MahjongFriendTransportMode = friendSignalUrl ? 'network' : 'unavailable';
  const sessionIdRef = useRef<string | null>(null);
  const roomCodeRef = useRef<string | null>(null);
  const roomRoleRef = useRef<'host' | 'guest' | null>(null);
  const friendRoomRef = useRef<FriendRoomSnapshot | null>(null);
  const transportRef = useRef<FriendRoomTransport | null>(null);

  const legalActions = getLegalActions(state, 0);
  const humanRiichi = state.players[0]?.riichi ?? false;

  // AI 回合使用短暂延迟，让训练者看见每一次摸打决策
  useEffect(() => {
    if (screen !== 'single' || state.phase !== 'ai-turn' || state.currentPlayer === 0) return undefined;
    const timer = window.setTimeout(() => {
      setState((current) => playAiTurn(current, current.currentPlayer));
    }, 420);
    return () => window.clearTimeout(timer);
  }, [screen, state.phase, state.currentPlayer, state.seq]);

  // 立直后摸牌立即摸切，避免再次显示可操作牌按钮
  useEffect(() => {
    if (
      screen !== 'single' ||
      state.phase !== 'player-turn' ||
      state.currentPlayer !== 0 ||
      !humanRiichi ||
      state.drawnTileId === null
    ) {
      return undefined;
    }
    const timer = window.setTimeout(() => {
      setState((current) => {
        if (
          current.phase !== 'player-turn' ||
          current.currentPlayer !== 0 ||
          !current.players[0]?.riichi ||
          current.drawnTileId === null
        ) {
          return current;
        }
        const actions = getLegalActions(current, 0);
        if (actions.some((action) => action.type === 'tsumo')) return current;
        const tsumogiri = actions.find((action) => action.type === 'discard' && action.tileId === current.drawnTileId);
        return tsumogiri ? applyAction(current, 0, tsumogiri).state : current;
      });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [screen, state.phase, state.currentPlayer, state.drawnTileId, humanRiichi, state.seq]);

  // 离开页面时关闭远程友人房通信并通知房间释放资源
  useEffect(
    () => () => {
      const code = roomCodeRef.current;
      if (roomRoleRef.current === 'host' && code) {
        transportRef.current?.post({ type: 'room-closed' });
      } else if (roomRoleRef.current === 'guest' && code && sessionIdRef.current) {
        transportRef.current?.post({ type: 'leave-request', memberId: sessionIdRef.current });
      }
      transportRef.current?.close();
    },
    [],
  );

  // 延迟创建成员标识，避免服务端预渲染与浏览器随机值不一致
  const getSessionId = () => {
    if (!sessionIdRef.current) {
      sessionIdRef.current = createFriendSessionId();
      setFriendLocalPlayerId(sessionIdRef.current);
    }
    return sessionIdRef.current;
  };

  // 关闭当前标签页的房间通信并重置本地房间引用
  const leaveFriendRoom = () => {
    const code = roomCodeRef.current;
    if (roomRoleRef.current === 'host' && code) {
      transportRef.current?.post({ type: 'room-closed' });
    } else if (roomRoleRef.current === 'guest' && code && sessionIdRef.current) {
      transportRef.current?.post({ type: 'leave-request', memberId: sessionIdRef.current });
    }
    transportRef.current?.close();
    transportRef.current = null;
    roomCodeRef.current = null;
    roomRoleRef.current = null;
    sessionIdRef.current = null;
    friendRoomRef.current = null;
    setFriendRoom(null);
    setFriendLocalPlayerId(null);
    setFriendReadyConfirm(false);
  };

  // 将房间快照同步到 React 并通过临时服务转发给房间成员
  const syncFriendRoom = (snapshot: FriendRoomSnapshot) => {
    friendRoomRef.current = snapshot;
    setFriendRoom(snapshot);
    transportRef.current?.post({ type: 'snapshot', snapshot });
  };

  // 响应房主和成员之间的加入、准备及开局消息
  const handleFriendMessage = (message: FriendRoomMessage) => {
    const current = friendRoomRef.current;
    if (message.type === 'room-closed') {
      transportRef.current?.close();
      transportRef.current = null;
      roomCodeRef.current = null;
      roomRoleRef.current = null;
      sessionIdRef.current = null;
      friendRoomRef.current = null;
      setFriendRoom(null);
      setFriendLocalPlayerId(null);
      setFriendView('entry');
      setFriendNotice('房主已关闭房间，请重新创建或输入新的房间码。');
      return;
    }
    if (
      message.type === 'snapshot' &&
      roomRoleRef.current === 'guest' &&
      message.snapshot.code === roomCodeRef.current
    ) {
      friendRoomRef.current = message.snapshot;
      setFriendRoom(message.snapshot);
      if (message.snapshot.phase === 'started') {
        setFriendView('game');
        setFriendNotice('房主已开始友人对局，通信已同步。');
      } else {
        setFriendNotice('已与房主同步，等待所有席位准备。');
      }
      return;
    }
    if (roomRoleRef.current !== 'host' || !current) return;
    if (message.type === 'join-request') {
      const updated = addFriendRoomGuest(current, message.memberId);
      if (!updated) {
        transportRef.current?.post({ type: 'snapshot', snapshot: current });
        return;
      }
      syncFriendRoom(updated);
      setFriendNotice('新成员已加入，房间状态已同步。');
      return;
    }
    if (message.type === 'leave-request') {
      const updated = removeFriendRoomGuest(current, message.memberId);
      if (!updated) return;
      syncFriendRoom(updated);
      setFriendNotice('成员已离开，席位已释放。');
      return;
    }
    if (message.type === 'set-ready') {
      const updated = setFriendRoomReady(current, message.memberId, message.ready);
      if (!updated) return;
      syncFriendRoom(updated);
      setFriendNotice(message.ready ? '准备状态已同步。' : '成员已取消准备。');
    }
  };

  // 建立指定房间码的跨设备 WebSocket 通信通道
  const connectFriendTransport = (code: string, role: 'host' | 'guest', memberId: string) => {
    transportRef.current?.close();
    if (!friendSignalUrl) {
      setFriendNotice('跨设备友人房需要公网 WSS 信令地址，当前未配置。');
      return;
    }
    transportRef.current = openNetworkFriendRoomTransport({
      url: friendSignalUrl,
      code,
      memberId,
      role,
      onMessage: handleFriendMessage,
      onStatus: handleFriendTransportStatus,
    });
  };

  // 显示远程房间服务的连接、拒绝和断线状态
  const handleFriendTransportStatus = (status: FriendRoomTransportStatus, detail?: string) => {
    if (status === 'connecting') {
      setFriendNotice('正在连接远程友人房服务……');
      return;
    }
    if (status === 'connected') {
      setFriendNotice(
        roomRoleRef.current === 'host' ? '房间服务已连接，等待好友加入。' : '已连接房间服务，等待房主同步席位。',
      );
      return;
    }
    if (status === 'error') {
      const message = detail ?? '远程友人房连接失败，请检查网络或房间码。';
      transportRef.current?.close();
      transportRef.current = null;
      roomCodeRef.current = null;
      roomRoleRef.current = null;
      friendRoomRef.current = null;
      setFriendRoom(null);
      setFriendReadyConfirm(false);
      setFriendView('entry');
      setFriendNotice(message);
      return;
    }
    if (status === 'closed' && roomCodeRef.current) {
      setFriendNotice('远程房间通信已断开。');
    }
  };

  // 从模式入口切入单人牌局或友人牌局入口
  const handleChooseMode = (mode: 'single' | 'friends') => {
    setScreen(mode);
    setUtilityPanel('none');
    setUtilityScroll(0);
    setSelectedTileId(null);
    if (mode === 'friends') {
      setFriendView('entry');
      setFriendCodeInput('');
      setFriendNotice(
        friendTransportMode === 'network'
          ? '输入房主分享的 4 位房间码即可跨设备加入。'
          : '单人模式纯前端；跨设备友人房还需要公网 WSS 信令地址。',
      );
    }
  };

  // 从牌局或友人房返回模式入口并断开当前本地房间
  const handleBackToLobby = () => {
    if (screen === 'friends') leaveFriendRoom();
    setScreen('lobby');
    setUtilityPanel('none');
    setUtilityScroll(0);
    setSelectedTileId(null);
    setFriendView('entry');
    setFriendCodeInput('');
  };

  // 选中或取消选中一张手牌，实际绘制和点击区域由 Canvas 管理
  const handleTileSelect = (tileId: number) => {
    if (state.phase !== 'player-turn') return;
    setSelectedTileId((current) => (current === tileId ? null : tileId));
  };

  // 将 Canvas 动作交给规则引擎，非法动作会被安全拒绝
  const handleAction = (action: LegalAction) => {
    const result = applyAction(state, 0, action);
    if (!result.accepted) return;
    setState(result.state);
    setSelectedTileId(null);
  };

  // 重新创建一局完整东风局并回到随机种子训练起点
  const handleRestart = () => {
    setState(createMatch());
    setSelectedTileId(null);
  };

  // 根据上一局结果进入下一局并沿用累计分数
  const handleNextRound = () => {
    setState((current) => startNextRound(current));
    setSelectedTileId(null);
  };

  // 打开或关闭牌型说明与配置面板，面板仍由同一张 Canvas 绘制
  const handleToggleUtilityPanel = (panel: Exclude<MahjongUtilityPanel, 'none'>) => {
    setUtilityScroll(0);
    setUtilityPanel((current) => (current === panel ? 'none' : panel));
  };

  // 根据滚轮或拖拽移动胡牌图鉴，始终把距离限制在内容范围内
  const handleScrollUtility = (delta: number) => {
    setUtilityScroll((current) => Math.max(0, Math.min(6000, current + delta)));
  };

  // 执行创建、加入、准备和开始等友人房动作
  const handleFriendAction = (action: MahjongFriendAction) => {
    if (action.type === 'create-room') {
      if (friendTransportMode !== 'network') {
        setFriendNotice('未配置公网 WSS，无法创建跨设备房间。');
        return;
      }
      const code = createFriendRoomCode();
      const hostId = getSessionId();
      const snapshot = createFriendRoomSnapshot(code, hostId);
      roomCodeRef.current = code;
      roomRoleRef.current = 'host';
      friendRoomRef.current = snapshot;
      setFriendRoom(snapshot);
      setFriendView('room');
      setFriendCodeInput('');
      setFriendNotice('正在连接房间服务，连接成功后即可分享 4 位房间码。');
      connectFriendTransport(code, 'host', hostId);
      syncFriendRoom(snapshot);
      return;
    }
    if (action.type === 'join-room') {
      if (friendTransportMode !== 'network') {
        setFriendNotice('未配置公网 WSS，无法加入跨设备房间。');
        return;
      }
      const code = friendCodeInput;
      if (!/^\d{4}$/.test(code)) {
        setFriendNotice('请输入完整的 4 位数字房间码。');
        return;
      }
      const localId = getSessionId();
      const snapshot = createFriendRoomPlaceholder(code);
      roomCodeRef.current = code;
      roomRoleRef.current = 'guest';
      friendRoomRef.current = snapshot;
      setFriendRoom(snapshot);
      setFriendView('room');
      setFriendNotice('正在与房主建立远程通信……');
      connectFriendTransport(code, 'guest', localId);
      transportRef.current?.post({ type: 'join-request', memberId: localId });
      return;
    }
    if (action.type === 'copy-code') {
      const code = roomCodeRef.current;
      if (!code) return;
      void navigator.clipboard
        ?.writeText(code)
        .then(() => setFriendNotice('房间码已复制，可以分享给好友。'))
        .catch(() => setFriendNotice(`房间码是 ${code}，请手动分享。`));
      return;
    }
    if (action.type === 'back') {
      leaveFriendRoom();
      setFriendView('entry');
      setFriendCodeInput('');
      setFriendNotice(
        friendTransportMode === 'network'
          ? '输入房主分享的 4 位房间码即可跨设备加入。'
          : '单人模式纯前端；跨设备友人房还需要公网 WSS 信令地址。',
      );
      return;
    }
    if (action.type === 'digit') {
      setFriendCodeInput((current) => (current.length < 4 ? `${current}${action.digit}` : current));
      return;
    }
    if (action.type === 'backspace') {
      setFriendCodeInput((current) => current.slice(0, -1));
      return;
    }
    if (action.type === 'request-ready') {
      if (!friendRoomRef.current) return;
      setFriendReadyConfirm(true);
      return;
    }
    if (action.type === 'cancel-ready') {
      setFriendReadyConfirm(false);
      return;
    }
    if (action.type === 'confirm-ready') {
      const current = friendRoomRef.current;
      const localId = getSessionId();
      const localSeat = current?.seats.find((seat) => seat.id === localId);
      if (!current || !localSeat) {
        setFriendReadyConfirm(false);
        setFriendNotice('还没有收到房主的席位确认，请稍候。');
        return;
      }
      const nextReady = !localSeat.ready;
      if (roomRoleRef.current === 'host') {
        const updated = setFriendRoomReady(current, localId, nextReady);
        if (updated) syncFriendRoom(updated);
      } else {
        transportRef.current?.post({ type: 'set-ready', memberId: localId, ready: nextReady });
        setFriendNotice(nextReady ? '已向房主发送准备请求。' : '已向房主发送取消准备请求。');
      }
      setFriendReadyConfirm(false);
      return;
    }
    if (action.type === 'start-game') {
      const current = friendRoomRef.current;
      if (roomRoleRef.current !== 'host' || !current) return;
      if (!canStartFriendRoom(current)) {
        setFriendNotice('需要四位成员全部准备后才能开始。');
        return;
      }
      const started = startFriendRoom(current);
      if (!started) return;
      syncFriendRoom(started);
      setFriendView('game');
      setFriendNotice('友人对局已开始，通信已同步。');
    }
  };

  // 将键盘数字、退格和回车映射到友人房 Canvas 输入
  const handleFriendKey = (key: string) => {
    if (screen !== 'friends') return;
    if (friendReadyConfirm && key === 'Escape') {
      handleFriendAction({ type: 'cancel-ready' });
      return;
    }
    if (key === 'Escape' && friendView !== 'entry') {
      handleFriendAction({ type: 'back' });
      return;
    }
    if (friendView !== 'entry') return;
    if (/^[0-9]$/.test(key)) {
      handleFriendAction({ type: 'digit', digit: key });
      return;
    }
    if (key === 'Backspace') {
      handleFriendAction({ type: 'backspace' });
      return;
    }
    if (key === 'Enter') handleFriendAction({ type: 'join-room' });
  };

  return (
    <PixiMahjongSurface
      screen={screen}
      utilityPanel={utilityPanel}
      utilityScroll={utilityScroll}
      friendView={friendView}
      friendTransportMode={friendTransportMode}
      friendRoom={friendRoom}
      friendLocalPlayerId={friendLocalPlayerId}
      friendCodeInput={friendCodeInput}
      friendNotice={friendNotice}
      friendReadyConfirm={friendReadyConfirm}
      state={state}
      selectedTileId={selectedTileId}
      legalActions={legalActions}
      onSelectTile={handleTileSelect}
      onAction={handleAction}
      onRestart={handleRestart}
      onNextRound={handleNextRound}
      onChooseMode={handleChooseMode}
      onBackToLobby={handleBackToLobby}
      onToggleUtilityPanel={handleToggleUtilityPanel}
      onScrollUtility={handleScrollUtility}
      onFriendAction={handleFriendAction}
      onFriendKey={handleFriendKey}
    />
  );
}
