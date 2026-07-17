'use client';

import { CompletionPanel } from './components/CompletionPanel';
import { DifficultySelector } from './components/DifficultySelector';
import { GameDashboard } from './components/GameDashboard';
import { NumberPanel } from './components/NumberPanel';
import { SudokuCanvas } from './components/SudokuCanvas';
import { useSudokuGame } from './use-sudoku-game';
import styles from './styles/Sudoku.module.css';

function SudokuIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="3" y="3" width="18" height="18" rx="2" stroke="currentColor" strokeWidth="1.5" />
      <path d="M9 3v18M15 3v18M3 9h18M3 15h18" stroke="currentColor" strokeWidth="1.5" />
      <path d="M12 3v18M3 12h18" stroke="currentColor" strokeWidth="0.75" opacity="0.55" />
    </svg>
  );
}

export default function Sudoku() {
  const {
    session,
    elapsedSeconds,
    currentDifficulty,
    nextDifficulty,
    completedDigits,
    startGame,
    selectCell,
    enterDigit,
    eraseSelected,
  } = useSudokuGame();

  return (
    <div className={styles.app}>
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <span className={styles.logo}>
            <SudokuIcon />
          </span>
          <div>
            <p className={styles.eyebrow}>Logic game</p>
            <h1 className={styles.title}>数独</h1>
          </div>
        </div>
        <p className={styles.subtitle}>选择一个空格，再点一次数字。让每行、每列和每个九宫格都包含 1–9。</p>
      </header>

      <DifficultySelector difficultyId={session.difficultyId} onSelect={startGame} />

      <section className={styles.gameSection} aria-label="数独游戏区">
        <GameDashboard
          difficultyLabel={currentDifficulty.label}
          elapsedSeconds={elapsedSeconds}
          mistakes={session.mistakes}
          onRestart={() => startGame(session.difficultyId)}
        />

        {session.hasIncorrectCompletion ? (
          <p className={styles.reviewNotice} role="status">
            填写有误，请自行检查。
          </p>
        ) : null}

        {session.status === 'won' ? (
          <CompletionPanel
            difficultyLabel={currentDifficulty.label}
            elapsedSeconds={elapsedSeconds}
            nextDifficulty={nextDifficulty}
            onChallenge={startGame}
            replayDifficultyId={session.difficultyId}
          />
        ) : null}

        <div className={styles.playLayout}>
          <div>
            <SudokuCanvas
              puzzle={session.game.puzzle}
              values={session.values}
              selectedIndex={session.selectedIndex}
              onSelect={selectCell}
              onDigit={enterDigit}
              onErase={eraseSelected}
            />
            <p id="sudoku-instructions" className={styles.instructions}>
              点选格子后再点数字；再次点同一数字可清除。键盘支持方向键、数字键与退格键。
            </p>
          </div>

          <NumberPanel
            completedDigits={completedDigits}
            selectedIndex={session.selectedIndex}
            status={session.status}
            onDigit={enterDigit}
            onErase={eraseSelected}
          />
        </div>
      </section>
    </div>
  );
}
