export type AgentConnectionStatus = 'idle' | 'connecting' | 'connected' | 'error';

const STATUS_LABELS: Record<AgentConnectionStatus, string> = {
  idle: '等待连接',
  connecting: '连接中',
  connected: '已连接',
  error: '连接失败',
};

export function getAgentConnectionStatusLabel(status: AgentConnectionStatus): string {
  return STATUS_LABELS[status];
}
