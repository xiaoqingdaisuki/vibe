export type BlogHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;

export interface BlogHeading {
  id: string;
  level: BlogHeadingLevel;
  text: string;
}

const MARKDOWN_HEADING = /^(#{1,6})\s+(.+?)\s*#*\s*$/;
const FENCED_CODE_BLOCK = /^\s*(```|~~~)/;

// 从标题文本中移除 markdown 链接和行内格式
function getHeadingText(value: string): string {
  return value
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim();
}

// 从 markdown 源码中提取所有标题及其层级
export function getBlogHeadings(source: string): BlogHeading[] {
  const headings: BlogHeading[] = [];
  let inCodeBlock = false;

  for (const line of source.split(/\r?\n/)) {
    if (FENCED_CODE_BLOCK.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }

    if (inCodeBlock) continue;

    const match = MARKDOWN_HEADING.exec(line);
    if (!match) continue;

    const text = getHeadingText(match[2]);
    if (!text) continue;

    headings.push({
      id: `section-${headings.length + 1}`,
      level: match[1].length as BlogHeadingLevel,
      text,
    });
  }

  return headings;
}
