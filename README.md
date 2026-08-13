# Vibe

A personal Web Lab for apps, games, experiments, public API demos, and technical writing.

Live site: [vibe-xiaoqingdaisuki.vercel.app](https://vibe-xiaoqingdaisuki.vercel.app)

## Lab Apps

| App | Route | Description |
| --- | --- | --- |
| 时区工具 | `/lab/timezone` | 根据设备时区实时显示本地与世界时间，一键复制常用代码时间格式。 |
| AI助手 | `/lab/ai` | AI 对话助手，支持 API 模型调用、流式回复与文本生成图片。 |
| 冒险岛怪物资料 | `/lab/maplestory` | 浏览冒险岛国服怀旧服怪物的属性与掉落道具，支持本地检索和排序。 |
| 数独 | `/lab/sudoku` | 数独游戏，支持五级难度与键盘操作。 |
| RSS Reader | `/lab/rss` | 聚合你的 RSS 订阅。 |
| 扫雷 | `/lab/minesweeper` | 经典扫雷游戏，支持预设与自定义难度。 |
| Adventure | `/game` | 文字挂机冒险 RPG 游戏，选择职业，自动战斗，收集装备。 |
| Skills | `/lab/skills` | AI 编程助手技能、工具与知识资源合集。 |
| Blog | `/blog` | 本地 Markdown 与 MDX 驱动的技术笔记空间。 |

The site also includes recent homepage updates, a Lab app index, an About page, and a light/dark theme toggle.

## Tech Stack

- Next.js 16 (App Router, Turbopack)
- React 19 and TypeScript (strict mode)
- Tailwind CSS v4 and CSS Modules
- `next-mdx-remote` and `gray-matter` for local Markdown and MDX content
- pnpm, ESLint, Prettier, Husky, and Commitlint
- Vercel deployment

## License

[MIT](LICENSE)
