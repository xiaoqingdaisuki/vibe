type IconName =
  | 'search'
  | 'pin'
  | 'route'
  | 'layers'
  | 'tools'
  | 'star'
  | 'locate'
  | 'plus'
  | 'minus'
  | 'close'
  | 'expand'
  | 'share'
  | 'compass'
  | 'back';

const PATHS: Record<IconName, string> = {
  search: 'M21 21l-5-5M19 10a9 9 0 11-18 0 9 9 0 0118 0',
  pin: 'M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1116 0zM15 10a3 3 0 11-6 0 3 3 0 016 0',
  route: 'M6 7h9a4 4 0 010 8H9M6 3v8M2 7h8M18 13l4 4-4 4M5 19h17',
  layers: 'M12 3l10 6-10 6L2 9l10-6zM2 13l10 6 10-6M2 17l10 6 10-6',
  tools: 'M14 6a5 5 0 00-6 6L2 18l4 4 6-6a5 5 0 006-6l-4 4-4-4 4-4z',
  star: 'M12 3l3 6 7 1-5 5 1 7-6-3-6 3 1-7-5-5 7-1 3-6z',
  locate: 'M12 2v4M12 18v4M2 12h4M18 12h4M19 12a7 7 0 11-14 0 7 7 0 0114 0M14 12a2 2 0 11-4 0 2 2 0 014 0',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  close: 'M6 6l12 12M6 18L18 6',
  expand: 'M8 3H3v5M16 3h5v5M21 16v5h-5M8 21H3v-5',
  share: 'M12 16V2M7 7l5-5 5 5M5 12H3v10h18V12h-2',
  compass: 'M12 2a10 10 0 100 20 10 10 0 000-20M16 8l-3 5-5 3 3-5 5-3z',
  back: 'M15 4l-8 8 8 8',
};

// 使用统一的内联图标表示地图操作
export function MapIcon({ name }: { name: IconName }) {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
