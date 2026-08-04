import { createElement, type ReactNode } from 'react';

// 判断 URL 是否为安全的外部链接（仅 http/https）
function isSafeExternalUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

// 将单行文本中的 inline 标记渲染为 React 节点
function renderInline(text: string): ReactNode[] {
  const matches = text.matchAll(/(\*\*[^*]+\*\*|\*[^*]+\*|`[^`]+`|\[[^\]]+\]\([^)]+\))/g);
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let key = 0;

  for (const match of matches) {
    const token = match[0];
    const index = match.index ?? 0;

    if (index > lastIndex) {
      nodes.push(text.slice(lastIndex, index));
    }

    if (token.startsWith('**') && token.endsWith('**')) {
      nodes.push(createElement('strong', { key: key++ }, token.slice(2, -2)));
    } else if (token.startsWith('*') && token.endsWith('*')) {
      nodes.push(createElement('em', { key: key++ }, token.slice(1, -1)));
    } else if (token.startsWith('`') && token.endsWith('`')) {
      nodes.push(createElement('code', { key: key++ }, token.slice(1, -1)));
    } else {
      const linkMatch = /^\[(.+)\]\((.+)\)$/.exec(token);
      if (linkMatch && isSafeExternalUrl(linkMatch[2])) {
        nodes.push(
          createElement(
            'a',
            {
              key: key++,
              href: linkMatch[2],
              target: '_blank',
              rel: 'noopener noreferrer',
            },
            linkMatch[1],
          ),
        );
      } else if (linkMatch) {
        nodes.push(linkMatch[1]);
      } else {
        nodes.push(token);
      }
    }

    lastIndex = index + token.length;
  }

  if (lastIndex < text.length) {
    nodes.push(text.slice(lastIndex));
  }

  return nodes;
}

// 将技能 notes 的 markdown 文本渲染为 React 节点列表
export function renderSkillNotes(content: string): ReactNode[] {
  const lines = content.trim().split('\n');
  const blocks: ReactNode[] = [];
  let paragraph: string[] = [];
  let listItems: string[] = [];

  const flushParagraph = () => {
    if (paragraph.length === 0) return;
    blocks.push(createElement('p', { key: `p-${blocks.length}` }, ...renderInline(paragraph.join(' '))));
    paragraph = [];
  };

  const flushList = () => {
    if (listItems.length === 0) return;
    blocks.push(
      createElement(
        'ul',
        { key: `ul-${blocks.length}` },
        ...listItems.map((item, index) => createElement('li', { key: `li-${index}` }, ...renderInline(item))),
      ),
    );
    listItems = [];
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (line === '') {
      flushParagraph();
      flushList();
      continue;
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line);
    if (headingMatch) {
      flushParagraph();
      flushList();
      blocks.push(
        createElement(`h${headingMatch[1].length}`, { key: `h-${blocks.length}` }, ...renderInline(headingMatch[2])),
      );
      continue;
    }

    if (line.startsWith('- ')) {
      flushParagraph();
      listItems.push(line.slice(2));
      continue;
    }

    flushList();
    paragraph.push(line);
  }

  flushParagraph();
  flushList();

  return blocks;
}
