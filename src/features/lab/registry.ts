import type { LabApp } from './types';

const registeredLabApps: LabApp[] = [
  {
    slug: 'skills',
    title: 'Skills',
    description: 'A collection of skills, tools and knowledge resources.',
    category: 'app',
    tags: ['skills', 'knowledge', 'collection'],
    href: '/lab/skills',
    featured: true,
    recentOrder: 4,
    dataSource: 'local',
  },
  {
    slug: 'rpg',
    title: 'adventure',
    description: '文字挂机冒险RPG游戏，选择职业，自动战斗，收集装备！',
    category: 'game',
    tags: ['game', 'rpg', 'idle'],
    href: '/game',
    featured: true,
    recentOrder: 3,
    dataSource: 'local',
  },
  {
    slug: 'rss',
    title: 'RSS Reader',
    description: '聚合你的RSS订阅',
    category: 'app',
    tags: ['rss', 'reader', 'feed'],
    href: '/lab/rss',
    featured: true,
    recentOrder: 2,
    dataSource: 'local',
  },
];

export const labApps: LabApp[] = [...registeredLabApps].sort(
  (firstApp, secondApp) => (firstApp.recentOrder ?? Infinity) - (secondApp.recentOrder ?? Infinity),
);
