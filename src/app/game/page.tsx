import GamePageClient from '@/features/apps/game/page-client';

export const metadata = {
  title: 'Adventure RPG',
  description:
    'Adventure RPG is a text-based role-playing game where you can explore dungeons, fight monsters, and collect loot. Embark on an epic adventure and become a legendary hero!',
};

export default function GamePage() {
  return <GamePageClient />;
}
