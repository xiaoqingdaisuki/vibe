function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function renderLink(label: string, href: string): string {
  if (!/^(?:https?:\/\/|mailto:)/i.test(href)) {
    return label;
  }

  return `<a href="${href}" target="_blank" rel="noopener noreferrer">${label}</a>`;
}

function renderInlineMarkdown(text: string): string {
  let html = escapeHtml(text);

  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');
  html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (_match, label: string, href: string) => renderLink(label, href));

  return html;
}

function isParagraphBoundary(line: string): boolean {
  return (
    /^(?:#{1,3}|>)\s/.test(line) ||
    line.startsWith('```') ||
    line.trim() === '---' ||
    /^[-*]\s/.test(line) ||
    /^\d+\.\s/.test(line)
  );
}

export function renderBlockMarkdown(content: string): string {
  const lines = content.split('\n');
  const result: string[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];

    if (line.startsWith('```')) {
      const codeLines: string[] = [];
      index += 1;
      while (index < lines.length && !lines[index].startsWith('```')) {
        codeLines.push(lines[index]);
        index += 1;
      }
      result.push(`<pre><code>${escapeHtml(codeLines.join('\n'))}</code></pre>`);
      if (index < lines.length) index += 1;
      continue;
    }

    const heading = /^(#{1,3})\s(.+)$/.exec(line);
    if (heading) {
      result.push(`<h${heading[1].length}>${renderInlineMarkdown(heading[2])}</h${heading[1].length}>`);
      index += 1;
      continue;
    }

    if (line.startsWith('> ')) {
      const quoteLines: string[] = [];
      while (index < lines.length && lines[index].startsWith('> ')) {
        quoteLines.push(lines[index].slice(2));
        index += 1;
      }
      result.push(`<blockquote><p>${quoteLines.map(renderInlineMarkdown).join('<br>')}</p></blockquote>`);
      continue;
    }

    if (line.trim() === '---') {
      result.push('<hr>');
      index += 1;
      continue;
    }

    if (line.includes('|') && index + 1 < lines.length && lines[index + 1]?.includes('---')) {
      const headerCells = line
        .split('|')
        .filter((cell) => cell.trim())
        .map((cell) => `<th>${renderInlineMarkdown(cell.trim())}</th>`)
        .join('');
      index += 2;
      const bodyRows: string[] = [];
      while (index < lines.length && lines[index].includes('|')) {
        const cells = lines[index]
          .split('|')
          .filter((cell) => cell.trim())
          .map((cell) => `<td>${renderInlineMarkdown(cell.trim())}</td>`)
          .join('');
        bodyRows.push(`<tr>${cells}</tr>`);
        index += 1;
      }
      result.push(`<table><thead><tr>${headerCells}</tr></thead><tbody>${bodyRows.join('')}</tbody></table>`);
      continue;
    }

    if (/^[-*]\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^[-*]\s/.test(lines[index])) {
        items.push(`<li>${renderInlineMarkdown(lines[index].replace(/^[-*]\s/, ''))}</li>`);
        index += 1;
      }
      result.push(`<ul>${items.join('')}</ul>`);
      continue;
    }

    if (/^\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (index < lines.length && /^\d+\.\s/.test(lines[index])) {
        items.push(`<li>${renderInlineMarkdown(lines[index].replace(/^\d+\.\s/, ''))}</li>`);
        index += 1;
      }
      result.push(`<ol>${items.join('')}</ol>`);
      continue;
    }

    if (line.trim() === '') {
      index += 1;
      continue;
    }

    const paragraphLines: string[] = [];
    while (index < lines.length && lines[index].trim() !== '' && !isParagraphBoundary(lines[index])) {
      paragraphLines.push(lines[index]);
      index += 1;
    }

    if (paragraphLines.length > 0) {
      result.push(`<p>${paragraphLines.map(renderInlineMarkdown).join('<br>')}</p>`);
      continue;
    }

    // Streaming can leave an incomplete Markdown marker (for example a lone
    // "#" or ">"). Always consume it so rendering can never block the UI.
    result.push(`<p>${renderInlineMarkdown(line)}</p>`);
    index += 1;
  }

  return result.join('');
}
