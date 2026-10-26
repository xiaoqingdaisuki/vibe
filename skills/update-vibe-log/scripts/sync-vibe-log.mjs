#!/usr/bin/env node

/** 比对 Git 历史与 Vibe 日志，并按显式参数补齐缺失提交 */

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const headingPattern = /^## (\d{4})年(\d{2})月(\d{2})日\r?$/gm;
const bulletPattern = /^- `(.+)`\r?$/gm;

// 输出错误并终止日志同步，避免继续写入无效结果
function fail(message) {
  process.stderr.write(`Error: ${message}\n`);
  process.exit(1);
}

// 解析检查、写入及仓库路径参数并拒绝冲突选项
function parseArgs(args) {
  const options = { check: false, file: null, head: false, repo: process.cwd(), write: false };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    if (argument === '--check') options.check = true;
    else if (argument === '--write') options.write = true;
    else if (argument === '--head') options.head = true;
    else if (argument === '--file' || argument === '--repo') {
      const value = args[index + 1];
      if (!value) fail(`${argument} requires a path.`);
      options[argument.slice(2)] = value;
      index += 1;
    } else fail(`Unknown argument: ${argument}`);
  }

  if (options.check && options.write) fail('Use either --check or --write, not both.');
  return options;
}

// 将中文日期标题的匹配结果转换为日期键
function toDateKey(match) {
  return `${match[1]}-${match[2]}-${match[3]}`;
}

// 校验日志结构并按日期收集已有提交标题
function parseLog(text) {
  if (text.includes('<<<<<<<') || text.includes('=======') || text.includes('>>>>>>>')) {
    fail('vibe-log.mdx contains merge-conflict markers.');
  }

  const headings = [...text.matchAll(headingPattern)].map((match) => ({
    date: toDateKey(match),
    end: match.index + match[0].length,
    start: match.index,
  }));
  const frontmatter = text.match(/^---\r?\n[\s\S]*?\r?\n---\r?\n/);

  if (!frontmatter) fail('vibe-log.mdx must start with YAML frontmatter.');
  if (headings.length === 0) fail('vibe-log.mdx has no daily date headings.');

  for (let index = 1; index < headings.length; index += 1) {
    if (headings[index - 1].date < headings[index].date) fail('Date headings must be in descending order.');
  }

  const groups = new Map();
  for (let index = 0; index < headings.length; index += 1) {
    const heading = headings[index];
    const bodyEnd = headings[index + 1]?.start ?? text.length;
    const body = text.slice(heading.end, bodyEnd);
    groups.set(
      heading.date,
      [...body.matchAll(bulletPattern)].map((match) => match[1]),
    );
  }

  return { frontmatter: frontmatter[0], groups, text };
}

// 读取 Git 历史并按提交日期归集原始标题
function readCommits(repo, headOnly) {
  const args = ['-C', repo, 'log'];
  if (!headOnly) args.push('--all');
  args.push('--date=format:%Y-%m-%d', '--format=%ad%x1f%s%x1e');

  const output = execFileSync('git', args, { encoding: 'utf8' });
  const commits = new Map();
  for (const record of output.split('\x1e')) {
    if (!record.trim()) continue;
    const [date, subject] = record.trim().split('\x1f');
    if (!date || subject === undefined) fail('Could not parse Git history.');
    const subjects = commits.get(date) ?? [];
    subjects.push(subject);
    commits.set(date, subjects);
  }
  return commits;
}

// 按标题出现次数比对历史，找出尚未记录的提交
function getMissingCommits(groups, commits) {
  const missing = new Map();
  for (const [date, subjects] of commits) {
    const logged = new Map();
    for (const subject of groups.get(date) ?? []) logged.set(subject, (logged.get(subject) ?? 0) + 1);

    for (const subject of subjects) {
      const count = logged.get(subject) ?? 0;
      if (count > 0) logged.set(subject, count - 1);
      else {
        const additions = missing.get(date) ?? [];
        additions.push(subject);
        missing.set(date, additions);
      }
    }
  }
  return missing;
}

// 将日期键转换为日志使用的中文日期标题
function formatDate(date) {
  const [year, month, day] = date.split('-');
  return `## ${year}年${month}月${day}日`;
}

// 更新或补齐日志元数据中的最后更新日期
function updateFrontmatter(frontmatter, latestDate) {
  const updated = `updated: '${latestDate}'`;
  if (/^updated:.*$/m.test(frontmatter)) return frontmatter.replace(/^updated:.*$/m, updated);
  return frontmatter.replace(/---\r?\n$/, `${updated}\n---\n`);
}

// 合并缺失提交并按日期倒序生成完整日志
function renderLog(parsed, missing) {
  const allDates = new Set([...parsed.groups.keys(), ...missing.keys()]);
  const orderedDates = [...allDates].toSorted((left, right) => right.localeCompare(left));
  const latestDate = [...missing.keys()].toSorted((left, right) => right.localeCompare(left))[0];
  const frontmatter = updateFrontmatter(parsed.frontmatter, latestDate);
  const sections = orderedDates.map(
    // 合并指定日期的新旧提交并生成对应日志段落
    (date) => {
      const subjects = [...(missing.get(date) ?? []), ...(parsed.groups.get(date) ?? [])];
      return `${formatDate(date)}\n\n${subjects.map((subject) => `- \`${subject}\``).join('\n')}`;
    },
  );
  return `${frontmatter}\n${sections.join('\n\n')}\n`;
}

// 执行日志差异检查，并按命令参数决定是否写回
function main() {
  const options = parseArgs(process.argv.slice(2));
  const repo = resolve(options.repo);
  const file = resolve(repo, options.file ?? 'src/content/blog/vibe-log.mdx');
  if (!existsSync(file)) fail(`Cannot find ${file}.`);

  const parsed = parseLog(readFileSync(file, 'utf8'));
  const missing = getMissingCommits(parsed.groups, readCommits(repo, options.head));
  const count = [...missing.values()].reduce((total, subjects) => total + subjects.length, 0);

  if (count === 0) {
    process.stdout.write('vibe-log.mdx is up to date.\n');
    return;
  }

  process.stdout.write(`Found ${count} unlogged commit${count === 1 ? '' : 's'}:\n`);
  for (const [date, subjects] of [...missing].toSorted(([left], [right]) => right.localeCompare(left))) {
    for (const subject of subjects) process.stdout.write(`- ${date}: ${subject}\n`);
  }

  if (options.write) {
    writeFileSync(file, renderLog(parsed, missing), 'utf8');
    process.stdout.write(`Updated ${file}.\n`);
  } else process.stdout.write('Run again with --write to update the log.\n');
}

main();
