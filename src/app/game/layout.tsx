// 游戏布局容器，限制高度并处理溢出滚动
export default function GameLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{children}</div>;
}
