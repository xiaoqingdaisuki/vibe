'use client';

import { useEffect, useState } from 'react';
import { applyAction, createMatch, getLegalActions, playAiTurn, startNextRound } from './core/engine';
import type { LegalAction, MahjongState } from './core/types';
import { PixiMahjongSurface, type MahjongScreen, type MahjongUtilityPanel } from './components/PixiMahjongSurface';

// 渲染纯前端单人牌局，所有界面交互委托给 Pixi Canvas
export default function Mahjong() {
  const [screen, setScreen] = useState<MahjongScreen>('lobby');
  const [utilityPanel, setUtilityPanel] = useState<MahjongUtilityPanel>('none');
  const [utilityScroll, setUtilityScroll] = useState(0);
  const [state, setState] = useState<MahjongState>(() => createMatch());
  const [selectedTileId, setSelectedTileId] = useState<number | null>(null);
  const [reviewMode, setReviewMode] = useState(false);

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

  // 从主页进入单人牌局并清空上一次面板状态
  const handleChooseMode = (mode: 'single') => {
    setScreen(mode);
    setState(createMatch());
    setUtilityPanel('none');
    setUtilityScroll(0);
    setSelectedTileId(null);
    setReviewMode(false);
  };

  // 从牌局返回主页并关闭所有 Canvas 面板
  const handleBackToLobby = () => {
    setScreen('lobby');
    setUtilityPanel('none');
    setUtilityScroll(0);
    setSelectedTileId(null);
    setReviewMode(false);
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
    setUtilityPanel('none');
    setUtilityScroll(0);
    setSelectedTileId(null);
    setReviewMode(false);
  };

  // 根据上一局结果进入下一局并沿用累计分数
  const handleNextRound = () => {
    setState((current) => startNextRound(current));
    setSelectedTileId(null);
    setReviewMode(false);
  };

  // 打开当前牌局的真实状态回顾，不重新生成牌面或修改结算结果
  const handleOpenReview = () => {
    if (state.phase !== 'round-over' && state.phase !== 'match-over') return;
    setReviewMode(true);
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

  return (
    <PixiMahjongSurface
      screen={screen}
      utilityPanel={utilityPanel}
      utilityScroll={utilityScroll}
      state={state}
      reviewMode={reviewMode}
      selectedTileId={selectedTileId}
      legalActions={legalActions}
      onSelectTile={handleTileSelect}
      onAction={handleAction}
      onRestart={handleRestart}
      onNextRound={handleNextRound}
      onOpenReview={handleOpenReview}
      onCloseReview={handleCloseReview}
      onChooseMode={handleChooseMode}
      onBackToLobby={handleBackToLobby}
      onToggleUtilityPanel={handleToggleUtilityPanel}
      onScrollUtility={handleScrollUtility}
    />
  );
}
