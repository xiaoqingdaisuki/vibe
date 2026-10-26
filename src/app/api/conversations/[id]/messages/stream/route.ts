/** 提供 AI 会话流式消息端点与路由时限配置 */

import { handleAgentStreamPost } from '@/features/apps/agent/agent-v1-stream-route';

export const maxDuration = 300;

export const POST = handleAgentStreamPost;
