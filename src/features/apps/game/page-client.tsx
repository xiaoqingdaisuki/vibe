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

// Module-level log ID counter — initialized from saved logs to avoid collisions
let _logId = 0;

function ensureLogId(id: number | undefined): number {
  if (id !== undefined && id > _logId) _logId = id;
  return id ?? ++_logId;
}

function nextLogId(): number {
  return ++_logId;
}

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

export default function GamePageClient() {
  const [phase, setPhase] = useState<GamePhase>('login');
  const [username, setUsername] = useState('');
  const [character, setCharacter] = useState<Character | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('inventory');
  const [nextCombatIn, setNextCombatIn] = useState<number | null>(null);
  const [selectedClass, setSelectedClass] = useState<ClassType | null>(null);
  const [loginError, setLoginError] = useState('');

  const combatTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const engineRef = useRef<GameEngine | null>(null);
  const currentUsernameRef = useRef<string>('');
  const firstCombatDoneRef = useRef(false);

  // Persist logs to localStorage whenever they change
  useEffect(() => {
    if (currentUsernameRef.current) {
      savePersistedLogs(currentUsernameRef.current, logs);
    }
  }, [logs]);

  // Initialize engine when character changes
  useEffect(() => {
    if (character) {
      engineRef.current = new GameEngine(character);
    }
  }, [character]);

  // Stop combat loop
  const stopCombatLoop = useCallback(() => {
    if (combatTimerRef.current) {
      clearInterval(combatTimerRef.current);
      combatTimerRef.current = null;
    }
    setNextCombatIn(null);
  }, []);

  // Trigger combat
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

      // Build logs in chronological order: defeats → victory → skill ups
      const allLogs: LogEntry[] = [];

      // Defeat logs from auto-retry attempts come first
      for (const defeatMsg of engineRef.current.defeatLogs) {
        allLogs.push({
          id: nextLogId(),
          timestamp: Date.now(),
          text: defeatMsg,
          type: 'combat',
        });
      }
      engineRef.current.defeatLogs = [];

      // Victory log comes last
      allLogs.push(combatLog);

      // Add skill level-up logs
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
      // silently fail
    }
  }, []);

  // Combat loop
  const startCombatLoop = useCallback(() => {
    stopCombatLoop();
    let seconds = 10;
    setNextCombatIn(seconds);

    combatTimerRef.current = setInterval(() => {
      seconds--;
      setNextCombatIn(seconds);

      if (seconds <= 0) {
        triggerCombat();
        seconds = 10;
      }
    }, 1000);
  }, [stopCombatLoop, triggerCombat]);

  // Enter game - start combat loop
  const enterGame = useCallback(() => {
    setPhase('playing');
    startCombatLoop();
    // triggerCombat is called after engine is initialized via useEffect
  }, [startCombatLoop]);

  // Process offline progress when first loading a character
  const processOfflineProgress = useCallback((char: Character): Character => {
    const now = Date.now();
    const offlineMs = now - char.lastActive;
    const offlineMinutes = Math.floor(offlineMs / 60000);

    if (offlineMinutes < 1) {
      return char;
    }

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
  }, []);

  // Login handler
  const handleLogin = useCallback(() => {
    if (!username.trim()) return;
    setLoginError('');

    const trimmedUsername = username.trim();
    const localData = loadCharacterSnapshot(trimmedUsername);

    if (localData) {
      // Migrate old character data (ensure new fields exist)
      if (!localData.skillUsage) localData.skillUsage = {};
      // Initialize skillUsage for existing skills
      for (const sk of localData.skills) {
        if (!localData.skillUsage[sk.skillId]) {
          localData.skillUsage[sk.skillId] = 0;
        }
      }
      // Migrate inventory capacity
      if (!localData.inventoryMax) localData.inventoryMax = 20;
      // Migrate favorites
      if (!localData.favorites) localData.favorites = [];

      // Load persisted logs and sync the module-level ID counter
      const savedLogs = loadPersistedLogs(trimmedUsername);
      for (const log of savedLogs) {
        ensureLogId(log.id);
      }
      setLogs(savedLogs);
      currentUsernameRef.current = trimmedUsername;

      // Existing character - process offline progress and enter game
      const updatedChar = processOfflineProgress(localData);
      const engine = new GameEngine(updatedChar);
      engine.refreshCombatStats();
      setCharacter(engine.character);
      saveCharacterSnapshot(engine.character);
      enterGame();
    } else {
      setPhase('class_select');
    }
  }, [username, processOfflineProgress, enterGame]);

  // Class selection handler
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
        // Sync engine ref to the latest character state BEFORE any combat tick can fire
        const updatedChar = saveCharacterSnapshot(engineRef.current.character);
        engineRef.current.character = updatedChar;
        // flushSync ensures React commits the state update immediately,
        // so the next combat tick reads the correct (post-action) inventory
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

  // Cleanup
  useEffect(() => {
    return () => {
      stopCombatLoop();
    };
  }, [stopCombatLoop]);

  // Save character before unload
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (engineRef.current) {
        saveCharacterSnapshot(engineRef.current.character);
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);

  // Trigger first combat once engine is ready after entering game
  useEffect(() => {
    if (phase === 'playing' && engineRef.current && !firstCombatDoneRef.current) {
      firstCombatDoneRef.current = true;
      triggerCombat();
    }
  }, [phase, triggerCombat]);

  // Full-screen wrapper for non-playing phases
  const centerWrapper = (content: React.ReactNode) => (
    <div className="flex min-h-0 flex-1 items-center justify-center">{content}</div>
  );

  if (phase === 'login') {
    return centerWrapper(
      <div className="w-full max-w-md space-y-4 p-6">
        <h1 className="text-3xl font-bold text-center">adventure 😜</h1>
        <p className="text-center text-muted">用户名是登录的唯一凭证</p>
        {loginError && (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-600 dark:border-red-800 dark:bg-red-950 dark:text-red-400">
            {loginError}
          </div>
        )}
        <input
          type="text"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleLogin()}
          placeholder="用户名"
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

  // Playing phase
  if (phase === 'playing' && character) {
    return (
      <GameLayout
        character={character}
        logs={logs}
        activeTab={activeTab}
        nextCombatIn={nextCombatIn}
        onTabChange={setActiveTab}
        onAction={handleAction}
      />
    );
  }

  return null;
}
