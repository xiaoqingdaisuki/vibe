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

## 阿里云 ECS Docker 部署

项目使用 Next.js 的同源 API 路由：浏览器请求 `/api/...`，再由容器内的 Next.js 服务转发到
`AGENT_API_BASE_URL`。因此浏览器不需要跨域直连后端，也不需要公开后端服务的端口。

ECS 需要预先安装 Docker Engine 和 Docker Compose 插件，并在安全组入方向放行 TCP 80。首次部署：

```bash
cp .env.docker.example .env
vi .env
sh deploy-ecs.sh
```

在 `.env` 中至少把 `NEXT_PUBLIC_SITE_URL` 改成 ECS 公网地址或域名。默认将宿主机 80 端口映射到
应用的 3000 端口；如需其他端口，可修改 `APP_PORT` 并同步调整 ECS 安全组。

如果 AI 后端也运行在同一台 ECS 的宿主机上，容器中不能使用 `127.0.0.1` 访问它。请配置：

```dotenv
AGENT_API_BASE_URL=http://host.docker.internal:6001
```

后续更新代码后，在项目目录再次执行 `sh deploy-ecs.sh` 即可重新构建并替换容器。查看状态与日志：

```bash
docker compose ps
docker compose logs --follow web
```

## License

[MIT](LICENSE)
