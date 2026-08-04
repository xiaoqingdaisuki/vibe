interface IconProps {
  className?: string;
}

// 地雷图标 SVG
export function MineIcon({ className }: IconProps) {
  return (
    <svg className={className} width="24" height="24" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="5" fill="currentColor" />
      <path
        d="M12 2v4M12 18v4M2 12h4M18 12h4M4.9 4.9l2.8 2.8M16.3 16.3l2.8 2.8M19.1 4.9l-2.8 2.8M7.7 16.3l-2.8 2.8"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
      />
      <circle cx="10.5" cy="10.5" r="1" fill="white" />
    </svg>
  );
}

// 旗帜图标 SVG
export function FlagIcon({ className }: IconProps) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M6 21V4m0 1h10l-2 4 2 4H6"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path d="M3 21h7" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

// 时钟图标 SVG
export function ClockIcon({ className }: IconProps) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" />
      <path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 重新开始图标 SVG
export function RestartIcon({ className }: IconProps) {
  return (
    <svg className={className} width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M4 7v5h5M5.8 16a8 8 0 1 0 .1-8.1L4 12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// 挖掘图标 SVG
export function RevealIcon({ className }: IconProps) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 20l6.5-6.5M8 17l-2-2M12 13l-2-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <path
        d="M13 4l1.2 2.8L17 8l-2.8 1.2L13 12l-1.2-2.8L9 8l2.8-1.2L13 4Z"
        stroke="currentColor"
        strokeWidth="1.5"
        strokeLinejoin="round"
      />
      <path d="M19 3v4M17 5h4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    </svg>
  );
}

// 滑块设置图标 SVG
export function SlidersIcon({ className }: IconProps) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M4 7h10M18 7h2M4 17h2M10 17h10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
      <circle cx="16" cy="7" r="2" stroke="currentColor" strokeWidth="2" />
      <circle cx="8" cy="17" r="2" stroke="currentColor" strokeWidth="2" />
    </svg>
  );
}

// 奖杯图标 SVG
export function TrophyIcon({ className }: IconProps) {
  return (
    <svg className={className} width="22" height="22" viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M8 4h8v4a4 4 0 0 1-8 0V4Z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" />
      <path
        d="M8 6H4v1a4 4 0 0 0 4 4M16 6h4v1a4 4 0 0 1-4 4M12 12v5M8 20h8M10 17h4"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
