'use client';

import { useEffect, useRef, useState } from 'react';
import { applyAction, createMatch, getLegalActions, playAiTurn, startNextRound } from './core/engine';
import { tileLabel } from './core/tiles';
import type { LegalAction, MahjongState } from './core/types';
import styles from './styles/Mahjong.module.css';
import {
  PixiMahjongSurface,
  type MahjongScreen,
  type MahjongSurfaceHandlers,
  type MahjongSurfaceView,
  type MahjongUtilityPanel,
} from './components/PixiMahjongSurface';

type TrainingSpeed = 'slow' | 'normal' | 'fast';

const AI_TURN_DELAY: Record<TrainingSpeed, number> = { slow: 900, normal: 420, fast: 120 };

// 渲染纯前端单人牌局，所有界面交互委托给 Pixi Canvas
export default function Mahjong() {
  const [screen, setScreen] = useState<MahjongScreen>('lobby');
  const [utilityPanel, setUtilityPanel] = useState<MahjongUtilityPanel>('none');
  const [utilityScroll, setUtilityScroll] = useState(0);
  const [state, setState] = useState<MahjongState>(() => createMatch());
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [reviewMode, setReviewMode] = useState(false);
  const [hasStarted, setHasStarted] = useState(false);
  const [trainingSpeed, setTrainingSpeed] = useState<TrainingSpeed>('normal');
  const [showScoreDetails, setShowScoreDetails] = useState(false);
  const detailsTriggerRef = useRef<HTMLButtonElement>(null);
  const detailsCloseRef = useRef<HTMLButtonElement>(null);

  const legalActions = getLegalActions(state, 0);
  const humanRiichi = state.players[0]?.riichi ?? false;

  // AI 回合使用短暂延迟，让训练者看见每一次摸打决策
  useEffect(() => {
    if (screen !== 'single' || utilityPanel !== 'none' || state.phase !== 'ai-turn' || state.currentPlayer === 0)
      return undefined;
    const timer = window.setTimeout(() => {
      setState((current) => playAiTurn(current, current.currentPlayer));
    }, AI_TURN_DELAY[trainingSpeed]);
    return () => window.clearTimeout(timer);
  }, [screen, utilityPanel, trainingSpeed, state.phase, state.currentPlayer, state.seq]);

  // 立直后摸牌立即摸切，避免再次显示可操作牌按钮
  useEffect(() => {
    if (
      screen !== 'single' ||
      utilityPanel !== 'none' ||
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
        if (actions.some((action) => action.type === 'kan')) return current;
        const tsumogiri = actions.find((action) => action.type === 'discard' && action.tileId === current.drawnTileId);
        return tsumogiri ? applyAction(current, 0, tsumogiri).state : current;
      });
    }, 260);
    return () => window.clearTimeout(timer);
  }, [screen, utilityPanel, state.phase, state.currentPlayer, state.drawnTileId, humanRiichi, state.seq]);

  // 从主页进入单人牌局并清空上一次面板状态
  const handleChooseMode = (mode: 'single') => {
    setScreen(mode);
    if (!hasStarted) setState(createMatch());
    setHasStarted(true);
    setUtilityPanel('none');
    setUtilityScroll(0);
    setSelectedTileId(null);
    setReviewMode(false);
    setShowScoreDetails(false);
  };

  // 从牌局返回主页并关闭所有 Canvas 面板
  const handleBackToLobby = () => {
    setScreen('lobby');
    setUtilityPanel('none');
    setUtilityScroll(0);
    setSelectedTileId(null);
    setReviewMode(false);
    setShowScoreDetails(false);
  };

  // 首次点击抬牌，重复点击同一张抬起的牌立即执行普通出牌
  const handleTileSelect = (tileId: number) => {
    if (state.phase !== 'player-turn') return;
    if (selectedTileId === tileId) {
      const discard = legalActions.find((action) => action.type === 'discard' && action.tileId === tileId);
      if (discard) {
        setState((current) => {
          const result = applyAction(current, 0, discard);
          return result.accepted ? result.state : current;
        });
        setSelectedTileId(null);
        return;
      }
    }
    setSelectedTileId((current) => (current === tileId ? null : tileId));
  };

  // 取消当前抬起的手牌，不执行出牌
  const handleCancelTileSelection = () => {
    setSelectedTileId(null);
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
    setHasStarted(true);
    setUtilityPanel('none');
    setUtilityScroll(0);
    setSelectedTileId(null);
    setReviewMode(false);
    setShowScoreDetails(false);
  };

  // 根据上一局结果进入下一局并沿用累计分数
  const handleNextRound = () => {
    setState((current) => startNextRound(current));
    setSelectedTileId(null);
    setReviewMode(false);
    setShowScoreDetails(false);
  };

  // 打开当前牌局的真实状态回顾，不重新生成牌面或修改结算结果
  const handleOpenReview = () => {
    if (state.phase !== 'round-over' && state.phase !== 'match-over') return;
    setReviewMode(true);
    setShowScoreDetails(false);
  };

  // 关闭回顾层并回到当前局结算，不丢失原始牌局状态
  const handleCloseReview = () => {
    setReviewMode(false);
  };

  // 打开或关闭牌型说明与配置面板，面板仍由同一张 Canvas 绘制
  const handleToggleUtilityPanel = (panel: Exclude<MahjongUtilityPanel, 'none'>) => {
    setUtilityScroll(0);
    setUtilityPanel((current) => (current === panel ? 'none' : panel));
  };

  // 按图鉴实际内容边界更新滚动位置，确保可以完整看到最后一项
  const handleScrollUtility = (delta: number, limit?: number) => {
    setUtilityScroll((current) => {
      const next = Math.max(0, current + delta);
      return limit === undefined ? next : Math.min(limit, next);
    });
  };

  // 在慢速、正常和快速之间切换 AI 决策节奏
  const handleCycleTrainingSpeed = () => {
    setTrainingSpeed((current) => (current === 'slow' ? 'normal' : current === 'normal' ? 'fast' : 'slow'));
  };

  // 显示本局番符和四家收支的完整明细
  const handleOpenScoreDetails = () => {
    setShowScoreDetails(true);
  };

  // 关闭结算明细并返回牌桌结算层
  const handleCloseScoreDetails = () => {
    setShowScoreDetails(false);
    detailsTriggerRef.current?.focus();
  };

  // 将键盘焦点留在明细层，并允许按 Escape 返回牌桌
  useEffect(() => {
    if (!showScoreDetails) return undefined;
    detailsCloseRef.current?.focus();
    // Escape 关闭明细并把焦点返回触发按钮
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        detailsCloseRef.current?.focus();
        return;
      }
      if (event.key !== 'Escape') return;
      event.preventDefault();
      setShowScoreDetails(false);
      detailsTriggerRef.current?.focus();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showScoreDetails]);

  const result = state.result;
  const canShowScoreDetails =
    screen === 'single' && result !== null && (state.phase === 'round-over' || state.phase === 'match-over');

  return (
    <>
      <PixiMahjongSurface
        view={
          {
            screen,
            utilityPanel,
            trainingSpeed,
            hasStarted,
            utilityScroll,
            state,
            reviewMode,
            selectedTileId,
            legalActions,
          } satisfies MahjongSurfaceView
        }
        handlers={
          {
            onSelectTile: handleTileSelect,
            onCancelTileSelection: handleCancelTileSelection,
            onAction: handleAction,
            onRestart: handleRestart,
            onNextRound: handleNextRound,
            onOpenReview: handleOpenReview,
            onCloseReview: handleCloseReview,
            onChooseMode: handleChooseMode,
            onBackToLobby: handleBackToLobby,
            onToggleUtilityPanel: handleToggleUtilityPanel,
            onScrollUtility: handleScrollUtility,
            onCycleTrainingSpeed: handleCycleTrainingSpeed,
          } satisfies MahjongSurfaceHandlers
        }
      />
      {canShowScoreDetails && (
        <button
          ref={detailsTriggerRef}
          className={styles.detailsTrigger}
          type="button"
          onClick={handleOpenScoreDetails}
        >
          查看计分明细
        </button>
      )}
      {canShowScoreDetails && showScoreDetails && (
        <div className={styles.detailsBackdrop} onClick={handleCloseScoreDetails}>
          <section
            className={styles.detailsDialog}
            role="dialog"
            aria-modal="true"
            aria-labelledby="mahjong-score-title"
            onClick={(event) => event.stopPropagation()}
          >
            <header className={styles.detailsHeader}>
              <h2 id="mahjong-score-title">本局计分明细</h2>
              <button ref={detailsCloseRef} type="button" onClick={handleCloseScoreDetails} aria-label="关闭计分明细">
                关闭
              </button>
            </header>
            <p>{result.message}</p>
            {result.winningTile && <p>和牌张：{tileLabel(result.winningTile)}</p>}
            {result.hanDetails && result.hanDetails.length > 0 && (
              <div>
                <h3>番数（合计 {result.han} 番）</h3>
                <ul>
                  {result.hanDetails.map((detail) => (
                    <li key={detail.name}>
                      {detail.name}：{detail.han} 番
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {result.fuDetails && result.fuDetails.length > 0 && (
              <div>
                <h3>符数（合计 {result.fu} 符）</h3>
                <ul>
                  {result.fuDetails.map((detail, index) => (
                    <li key={`${index}-${detail}`}>{detail}</li>
                  ))}
                </ul>
              </div>
            )}
            <div>
              <h3>分数变化</h3>
              <ul>
                {state.players.map((player) => (
                  <li key={player.seat}>
                    {player.name}：{(result.scoreChanges?.[player.seat] ?? 0) >= 0 ? '+' : ''}
                    {(result.scoreChanges?.[player.seat] ?? 0).toLocaleString()} 点，当前{' '}
                    {player.score.toLocaleString()} 点
                  </li>
                ))}
              </ul>
            </div>
          </section>
        </div>
      )}
    </>
  );
}
