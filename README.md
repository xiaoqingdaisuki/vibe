# Vibe

A personal Web Lab for apps, games, experiments, public API demos, and technical writing.

Live site: [vibe-xiaoqingdaisuki.vercel.app](https://vibe-xiaoqingdaisuki.vercel.app)

## Lab Apps

| App        | Route              | Description                                                             |
| ---------- | ------------------ | ----------------------------------------------------------------------- |
| AI小情     | `/lab/ai`          | 支持多轮对话、流式文本响应与文本生成图片的 AI 助手。                    |
| 数独       | `/lab/sudoku`      | 支持五级难度和键盘操作的数独游戏。                                      |
| RSS Reader | `/lab/rss`         | 聚合并阅读 RSS 订阅源。                                                 |
| 扫雷       | `/lab/minesweeper` | 支持预设及自定义难度的经典扫雷游戏。                                    |
| Adventure  | `/game`            | 选择职业、自动战斗并收集装备的文字挂机 RPG。                            |
| Skills     | `/lab/skills`      | A collection of AI coding agent skills, tools, and knowledge resources. |
| Blog       | `/blog`            | A local Markdown and MDX-powered space for technical notes.             |

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
