import type { LabApp } from "./types"

export const labApps: LabApp[] = [
  {
    slug: "skills",
    title: "Skills",
    description: "A collection of skills, tools and knowledge resources.",
    category: "app",
    status: "beta",
    tags: ["skills", "knowledge", "collection"],
    href: "/lab/skills",
    featured: true,
    dataSource: "local",
  },
  {
    slug: "rpg",
    title: "adventure",
    description: "文字挂机冒险RPG游戏，选择职业，自动战斗，收集装备！",
    category: "game",
    status: "building",
    tags: ["game", "rpg", "idle"],
    href: "/game",
    featured: true,
    dataSource: "local",
  },
]
