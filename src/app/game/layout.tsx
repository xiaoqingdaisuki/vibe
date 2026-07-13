export default function GameLayout({ children }: { children: React.ReactNode }) {
  return <div className="min-h-0 flex-1 flex flex-col overflow-hidden">{children}</div>;
}
