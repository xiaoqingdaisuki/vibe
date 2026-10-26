/** 放置角色游戏：客户端页面与交互编排 */

'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { flushSync } from 'react-dom';
import type { Character, LogEntry, ClassType, ActiveTab, GameInteraction } from './types';
import { GameLayout } from './components/GameLayout';
import { ClassSelect } from './components/ClassSelect';
import { GameEngine } from './engine';
import { CLASSES } from './static-data';
import {
  clearPersistedLogs,
  loadCharacterSnapshot,
  loadPersistedLogs,
  saveCharacterSnapshot,
  savePersistedLogs,
} from './persistence';

type GamePhase = 'login' | 'class_select' | 'playing';
const COMBAT_INTERVAL_MS = 10_000;

// 使用模块级日志计数器，并从已保存日志初始化以避免标识冲突
let _logId = 0;

// 确保日志ID递增，从已保存日志中恢复计数器
function ensureLogId(id: number | undefined): number {
  if (id !== undefined && id > _logId) _logId = id;
  return id ?? ++_logId;
}

// 生成下一个日志ID
function nextLogId(): number {
  return ++_logId;
}

// 生成默认角色数据
function createDefaultCharacter(username: string, classId: ClassType): Character {
  const classDef = CLASSES.find((c) => c.id === classId) || CLASSES[0];
  const now = new Date().toISOString();

  return {
    username,
    name: username,
    class: classDef.id,
    level: 1,
    exp: 0,
    expToNext: 100,
    stats: { ...classDef.baseStats },
    hp: classDef.baseHp,
    maxHp: classDef.baseHp,
    gold: 0,
    inventory: [],
    equipment: { weapon: null, armor: null, accessory: null },
    skills: classDef.startingSkills.map((skillId) => ({ skillId, level: 1 })),
    skillUsage: {},
    lastActive: Date.now(),
    createdAt: now,
    inventoryMax: 20,
    favorites: [],
  };
}

// 游戏主页面客户端，管理登录、选职业和游戏循环
export default function GamePageClient() {
  const [phase, setPhase] = useState<GamePhase>('login');
  const [username, setUsername] = useState('');
  const [character, setCharacter] = useState<Character | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('inventory');
  const [combatCycleStartedAt, setCombatCycleStartedAt] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassType | null>(null);
  const [loginError, setLoginError] = useState('');

  const combatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const currentUsernameRef = useRef<string>('');
  const firstCombatDoneRef = useRef(false);

  // 日志变化时持久化当前用户的战斗记录
  useEffect(() => {
    if (currentUsernameRef.current) {
      savePersistedLogs(currentUsernameRef.current, logs);
    }
  }, [logs]);

  // 角色状态变化时同步游戏引擎实例
  useEffect(() => {
    if (character) {
      engineRef.current = new GameEngine(character);
    }
  }, [character]);

  // 清理自动战斗计时器并重置引用
  const stopCombatLoop = useCallback(() => {
    if (combatTimerRef.current) {
      clearInterval(combatTimerRef.current);
      combatTimerRef.current = null;
    }
  }, []);

  // 执行自动战斗并保存角色、合并战斗和升级日志
  const triggerCombat = useCallback(() => {
    if (!engineRef.current) return;

    try {
      const result = engineRef.current.autoRetryCombat();
      const updatedChar = saveCharacterSnapshot(engineRef.current.character);
      engineRef.current.character = updatedChar;
      setCharacter(updatedChar);

      const combatLog: LogEntry = {
        id: nextLogId(),
        timestamp: Date.now(),
        text: engineRef.current.formatCombatResult(result),
        type: 'combat',
        rarity: result.itemsGained.length > 0 ? result.itemsGained[0].rarity : undefined,
        difficulty: result.difficulty,
        details: result.roundDetails,
      };

      // 按战败、胜利、技能升级的时间顺序组织日志
      const allLogs: LogEntry[] = [];

      // 先记录自动重试过程中的战败日志
      for (const defeatMsg of engineRef.current.defeatLogs) {
        allLogs.push({
          id: nextLogId(),
          timestamp: Date.now(),
          text: defeatMsg,
          type: 'combat',
        });
      }
      engineRef.current.defeatLogs = [];

      // 最后添加胜利日志
      allLogs.push(combatLog);

      // 追加技能升级日志
      for (const lvlUp of engineRef.current.skillLevelUpLogs) {
        allLogs.push({
          id: nextLogId(),
          timestamp: Date.now(),
          text: `✨ ${lvlUp.skillName} 升级到 Lv.${lvlUp.newLevel}！`,
          type: 'levelup',
        });
      }
      engineRef.current.skillLevelUpLogs = [];

      setLogs((prev) => [...prev, ...allLogs].slice(-50));
    } catch {
      // 忽略本轮错误并等待下一次战斗重试
    } finally {
      setCombatCycleStartedAt(Date.now());
    }
  }, []);

  // 重置战斗周期并启动定时自动战斗
  const startCombatLoop = useCallback(() => {
    stopCombatLoop();
    setCombatCycleStartedAt(Date.now());

    combatTimerRef.current = setInterval(() => {
      triggerCombat();
    }, COMBAT_INTERVAL_MS);
  }, [stopCombatLoop, triggerCombat]);

  // 进入游戏阶段并启动自动战斗循环
  const enterGame = useCallback(() => {
    setPhase('playing');
    startCombatLoop();
    // 引擎经 useEffect 初始化后再调用 triggerCombat
  }, [startCombatLoop]);

  // 在空闲时结算离线战斗收益并返回最新角色
  const processOfflineProgress = useCallback(async (char: Character): Promise<Character> => {
    const now = Date.now();
    const offlineMs = now - char.lastActive;
    const offlineMinutes = Math.floor(offlineMs / 60000);

    if (offlineMinutes < 1) {
      return char;
    }

    // 重型离线结算放到空闲时段执行，避免阻塞登录首帧与交互
    const settle = () => {
      const engine = new GameEngine(char);
      const result = engine.calculateOfflineProgress();

      const offlineLogs: LogEntry[] = [
        {
          id: nextLogId(),
          timestamp: now,
          text: `=== 离线收益 (${offlineMinutes} 分钟) ===`,
          type: 'info',
        },
        {
          id: nextLogId(),
          timestamp: now,
          text: `自动战斗 ${result.totalCombats} 场 | 胜利 ${result.totalWins} | 失败 ${result.totalLosses}`,
          type: 'info',
        },
        {
          id: nextLogId(),
          timestamp: now,
          text: `获得经验: +${result.totalExpGained} | 金币: +${result.totalGoldGained}`,
          type: 'info',
        },
      ];

      if (result.totalItemsGained.length > 0) {
        const grouped = new Map<string, { item: (typeof result.totalItemsGained)[0]; count: number }>();
        for (const item of result.totalItemsGained) {
          const key = item.id;
          if (grouped.has(key)) {
            grouped.get(key)!.count++;
          } else {
            grouped.set(key, { item, count: 1 });
          }
        }
        for (const { item, count } of grouped.values()) {
          offlineLogs.push({
            id: nextLogId(),
            timestamp: now,
            text: `📦 离线掉落: [${item.rarity}] ${item.name} x${count}`,
            type: 'loot',
            rarity: item.rarity,
          });
        }
      }

      if (result.levelUps > 0) {
        offlineLogs.push({
          id: nextLogId(),
          timestamp: now,
          text: `🎉 离线升级了 ${result.levelUps} 次！当前等级: ${engine.character.level}`,
          type: 'levelup',
        });
      }

      setLogs((prev) => [...offlineLogs, ...prev].slice(-50));
      return engine.character;
    };

    // 等待空闲回调完成后返回结算结果，避免阻塞主线程
    const requestIdle = (globalThis as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
    return new Promise(
      // 优先安排空闲回调执行离线结算，缺少支持时延迟执行
      (resolve) => {
        // 执行离线结算并完成等待中的收益请求
        const done = () => resolve(settle());
        if (requestIdle) requestIdle(done);
        else setTimeout(done, 0);
      },
    );
  }, []);

  // 恢复用户存档和日志，结算离线收益后进入游戏
  const handleLogin = useCallback(async () => {
    if (!username.trim()) return;
    setLoginError('');

    const trimmedUsername = username.trim();
    const localData = loadCharacterSnapshot(trimmedUsername);

    if (localData) {
      // 迁移旧角色数据，确保新增字段存在
      if (!localData.skillUsage) localData.skillUsage = {};
      // 初始化已学习技能的使用次数
      for (const sk of localData.skills) {
        if (!localData.skillUsage[sk.skillId]) {
          localData.skillUsage[sk.skillId] = 0;
        }
      }
      // 迁移背包容量
      if (!localData.inventoryMax) localData.inventoryMax = 20;
      // 迁移收藏列表
      if (!localData.favorites) localData.favorites = [];

      // 恢复持久化日志并同步模块级标识计数器
      const savedLogs = loadPersistedLogs(trimmedUsername);
      for (const log of savedLogs) {
        ensureLogId(log.id);
      }
      setLogs(savedLogs);
      currentUsernameRef.current = trimmedUsername;

      // 已有角色先结算离线收益，再进入游戏
      const updatedChar = await processOfflineProgress(localData);
      const engine = new GameEngine(updatedChar);
      engine.refreshCombatStats();
      if (engine.grantMythicChestCompensation()) {
        const compensationLog: LogEntry = {
          id: nextLogId(),
          timestamp: Date.now(),
          text: '登录补偿：获得 1 个神话宝箱！',
          type: 'loot',
          rarity: 'mythic',
        };
        setLogs((prev) => [...prev, compensationLog].slice(-50));
      }
      setCharacter(engine.character);
      saveCharacterSnapshot(engine.character);
      enterGame();
    } else {
      setPhase('class_select');
    }
  }, [username, processOfflineProgress, enterGame]);

  // 使用选定职业创建角色、初始化战斗属性并进入游戏
  const handleClassSelect = useCallback(() => {
    if (!selectedClass) return;

    const trimmedUsername = username.trim();
    const newChar = createDefaultCharacter(trimmedUsername, selectedClass);

    currentUsernameRef.current = trimmedUsername;
    const engine = new GameEngine(newChar);
    engine.refreshCombatStats();
    const savedCharacter = saveCharacterSnapshot(engine.character);
    setCharacter(savedCharacter);
    enterGame();
  }, [selectedClass, username, enterGame]);

  // 处理角色交互或清空日志，并及时同步引擎与持久化状态
  const handleAction = useCallback(
    (action: GameInteraction | { type: 'clearLogs' }) => {
      if (!engineRef.current || !character) return;

      if (action.type === 'clearLogs') {
        setLogs([]);
        if (currentUsernameRef.current) {
          clearPersistedLogs(currentUsernameRef.current);
        }
        return;
      }

      try {
        const result = engineRef.current.performAction(action);
        // 在下次战斗触发前，将引擎引用同步为最新角色状态
        const updatedChar = saveCharacterSnapshot(engineRef.current.character);
        engineRef.current.character = updatedChar;
        // 使用 flushSync 立即提交 React 状态更新
        // 确保下次战斗读取操作完成后的背包数据
        flushSync(() => {
          setCharacter(updatedChar);
        });

        if (result.logs.length > 0) {
          const logsWithId = result.logs.map((log) => ({ ...log, id: ensureLogId(log.id) }));
          setLogs((prev) => [...prev, ...logsWithId].slice(-50));
        }
      } catch (err) {
        console.error('[handleAction] error:', err);
      }
    },
    [character],
  );

  // 组件卸载时停止自动战斗循环
  useEffect(() => {
    return () => {
      stopCombatLoop();
    };
  }, [stopCombatLoop]);

  // 监听页面离开事件，保存引擎中的最新角色数据
  useEffect(() => {
    // 页面离开前保存当前角色快照
    const handleBeforeUnload = () => {
      if (engineRef.current) {
        saveCharacterSnapshot(engineRef.current.character);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // 首次进入游玩阶段且引擎就绪后立即执行一场战斗
  useEffect(() => {
    if (phase === 'playing' && engineRef.current && !firstCombatDoneRef.current) {
      firstCombatDoneRef.current = true;
      triggerCombat();
    }
  }, [phase, triggerCombat]);

  // 为未进入游玩阶段的界面提供居中布局
  // 居中显示登录和职业选择阶段的内容
  const centerWrapper = (content: React.ReactNode) => (
    <div className="flex min-h-0 flex-1 items-center justify-center">{content}</div>
  );

  if (phase === 'login') {
    return centerWrapper(
      <div className="w-full max-w-md space-y-4 p-6">
        <h1 className="text-3xl font-bold text-center">Adventure 😜</h1>
        <p className="text-center text-muted">用户名是登录的唯一凭证</p>
        <label htmlFor="game-username" className="sr-only">
          用户名
        </label>
        {loginError && (
          <div className="border-error bg-error text-error rounded-lg border p-3 text-sm">{loginError}</div>
        )}
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          placeholder="用户名"
          id="game-username"
          name="username"
          autoComplete="username"
          className="w-full rounded-lg border border-border bg-background px-4 py-3 text-base outline-none focus:border-accent"
          maxLength={20}
        />
        <button
          onClick={handleLogin}
          className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-white transition-colors hover:bg-accent-hover"
        >
          进入游戏
        </button>
      </div>,
    );
  }

  if (phase === 'class_select') {
    return centerWrapper(
      <div className="w-full max-w-2xl space-y-6 p-6">
        <h1 className="text-3xl font-bold text-center">选择职业</h1>
        <ClassSelect selected={selectedClass} onSelect={setSelectedClass} />
        <button
          onClick={handleClassSelect}
          disabled={!selectedClass}
          className="w-full rounded-lg bg-accent px-4 py-3 font-semibold text-white transition-colors hover:bg-accent-hover disabled:opacity-50"
        >
          开始冒险
        </button>
      </div>,
    );
  }

  // 游玩阶段
  if (phase === 'playing' && character) {
    return (
      <GameLayout
        character={character}
        logs={logs}
        activeTab={activeTab}
        combatCycleStartedAt={combatCycleStartedAt}
        onTabChange={setActiveTab}
        onAction={handleAction}
      />
    );
  }

  return null;
}
