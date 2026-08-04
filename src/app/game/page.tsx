import GamePageClient from '@/features/apps/game/page-client';

export const metadata = {
  title: 'Adventure RPG',
  description:
    'Adventure RPG is a text-based role-playing game where you can explore dungeons, fight monsters, and collect loot. Embark on an epic adventure and become a legendary hero!',
};

// 游戏页面路由，加载RPG游戏客户端组件
export default function GamePage() {
  return <GamePageClient />;
}
