# Vibe

Vibe is a personal Web Lab for small apps, tools, games, AI experiments, and technical writing. It favors lightweight, explicit feature boundaries and browser-native capabilities, with responsive layouts, dark mode, and PWA installation support.

Live site: [vibe-xiaoqingdaisuki.vercel.app](https://vibe-xiaoqingdaisuki.vercel.app)

## Lab Apps

| App            | Route              | Description                                                                |
| -------------- | ------------------ | -------------------------------------------------------------------------- |
| AI助手         | `/lab/agent`       | 通过 API 调用模型，支持流式对话、Markdown 回复、历史会话与文本生成图片。    |
| 日本麻将       | `/lab/mahjong`     | 日本麻将游戏基于canvas绘制，支持本地人机对局、牌型图鉴与牌局复盘。              |
| 笔记           | `/lab/note`        | 记录临时备忘与常用指令，支持编辑、删除和代码块复制，内容只保存在本地浏览器。 |
| 代码编辑器     | `/lab/editor`      | 在线编辑 React 与 HTML、CSS、JavaScript，支持代码格式化和实时预览。          |
| 时区工具       | `/lab/timezone`    | 根据设备时区实时显示本地与世界时间，一键复制常用代码时间格式。               |
| 冒险岛怪物资料 | `/lab/maplestory`  | 浏览冒险岛国服怀旧服怪物的属性与掉落道具，支持本地检索和排序。               |
| 数独           | `/lab/sudoku`      | 数独游戏，支持五级难度与键盘操作。                                           |
| RSS Reader     | `/lab/rss`         | 管理并持久化 RSS/Atom 订阅，通过服务端代理获取和解析订阅内容。               |
| 扫雷           | `/lab/minesweeper` | 经典扫雷游戏，支持预设与自定义难度。                                         |
| Adventure      | `/lab/rpg`         | 文字挂机冒险 RPG，支持职业选择、自动战斗、技能、装备、离线收益与本地存档。   |
| Skill          | `/lab/skill`       | AI 编程助手技能、工具与知识资源合集。                                        |

Lab apps are registered in `src/features/lab/registry.ts` and loaded on demand through the explicit import map in `src/features/apps/loaders.ts`. Technical writing is available at `/blog` and sourced from local Markdown and MDX files under `src/content/blog/`.

## Tech Stack

- Next.js 16 App Router, React 19, and TypeScript in strict mode
- Tailwind CSS v4 for layout and base styles, with CSS Modules for feature-specific complex styles
- `next-mdx-remote` and `gray-matter` for local Markdown and MDX content
- The Node.js test runner, ESLint, Prettier, Husky, and Commitlint
- pnpm for dependencies and scripts, with deployment on Vercel

The project is organized by responsibility: `src/app/` contains routes, metadata, and server endpoints; `src/features/` contains product features and Lab apps; `src/components/` contains shared UI; `src/lib/` contains pure utilities and site configuration; `src/content/blog/` contains blog content; and `public/` contains fonts, icons, the service worker, and other static assets. Tests are colocated with their modules as `*.test.ts` files.

## License

[MIT](LICENSE)
