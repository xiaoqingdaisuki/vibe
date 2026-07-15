import { Metadata } from 'next';
import GamePageClient from './page-client';

export const metadata: Metadata = {
  title: 'Adventure',
  description: '文字挂机冒险RPG游戏',
};

export default function GamePage() {
  return <GamePageClient />;
}
