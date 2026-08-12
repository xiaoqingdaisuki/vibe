import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

// 使用方式 node scripts/update-maplestory.mjs

const SOURCE_URL = 'https://mxdzlk.com/monster/';
const DEFAULT_VERSION = 'CMSC';
const REQUEST_CONCURRENCY = 2;
const OUTPUT_PATH = resolve(
  dirname(fileURLToPath(import.meta.url)),
  '../src/features/apps/maplestory/data/monsters.json',
);

const statKeys = {
  '等级：': 'level',
  '经验：': 'experience',
  '金币：': 'meso',
  'HP：': 'hp',
  'MP：': 'mp',
  '攻击力：': 'weaponAttack',
  '魔法攻击力：': 'magicAttack',
  '防御力：': 'weaponDefense',
  '魔法防御力：': 'magicDefense',
  '命中率：': 'accuracy',
  '回避率：': 'avoidability',
  'HP恢复/10秒：': 'hpRecoveryPer10Seconds',
  'MP恢复/10秒：': 'mpRecoveryPer10Seconds',
  '移动速度：': 'speed',
  '击退：': 'knockback',
};

// 将网页片段转换为可安全存储的纯文本
function toText(value) {
  return value
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/\s+/g, ' ')
    .trim();
}

// 将页面中展示的数值规范化为 number 或 null
function toNumber(value) {
  const normalized = toText(value).replace(/,/g, '');
  return normalized === '' ? null : Number(normalized);
}

// 暂停请求，降低公开数据源的瞬时压力
function wait(milliseconds) {
  return new Promise((resolvePromise) => setTimeout(resolvePromise, milliseconds));
}

// 获取页面并在暂时失败时自动重试
async function fetchHtml(url) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    try {
      const response = await fetch(url);

      if (response.ok) {
        return response.text();
      }
    } catch {
      // 网络短暂波动时延迟后重试
    }

    await wait((attempt + 1) * 1000);
  }

  throw new Error(`无法抓取数据源：${url}`);
}

// 从列表页提取当前版本全部怪物编号
function parseMonsterIds(html) {
  const ids = new Set();
  const pattern = /href="https:\/\/mxdzlk\.com\/monster\/(\d+)\/"/g;

  for (const match of html.matchAll(pattern)) {
    ids.add(match[1]);
  }

  return [...ids];
}

// 从列表页的分页提示中读取当前数据源的总页数
function parsePageCount(html) {
  const match = html.match(/第\s*<strong[^>]*>\s*\d+\s*\/\s*(\d+)/);
  const pageCount = Number(match?.[1]);

  if (!Number.isInteger(pageCount) || pageCount < 1) {
    throw new Error('无法识别列表页数，已停止写入以保护现有本地数据。');
  }

  return pageCount;
}

// 从怪物详情页提取数值属性与全部掉落物
function parseMonster(html, id, version) {
  const stats = Object.fromEntries(Object.values(statKeys).map((key) => [key, null]));
  const statPattern = /<span class="text-muted">([^<]+)<\/span>[\s\S]*?<strong>([\s\S]*?)<\/strong>/g;

  for (const match of html.matchAll(statPattern)) {
    const key = statKeys[match[1]];
    if (key) {
      stats[key] = toNumber(match[2]);
    }
  }

  const titleMatch = html.match(/<h2[^>]*>\s*([^<]+)\s*<\/h2>/);
  const imageMatch = html.match(/<img[^>]+src="([^"]+\/images\/mob\/[^"]+\/preview\.png)"[^>]*>/);
  const statsSectionStart = html.indexOf('<div class="col-lg-5 col-md-6">');
  const statsSectionEnd = html.indexOf('<div class="col-lg-7 col-md-6">');
  const statsSection = html.slice(statsSectionStart, statsSectionEnd);
  const weaknesses = new Set();
  const resistances = new Set();
  const traitPattern = /<span class="badge[^>]*>([\s\S]*?)<\/span>/g;

  for (const traitMatch of statsSection.matchAll(traitPattern)) {
    const trait = toText(traitMatch[1]);

    if (trait.startsWith('弱')) {
      weaknesses.add(trait);
    }

    if (trait.startsWith('抗')) {
      resistances.add(trait);
    }
  }

  const dropSection = html.slice(html.indexOf('>掉落道具</h3>'));
  const drops = [];
  const categoryPattern =
    /<div class="row mb-3">[\s\S]*?font-weight-bold[^>]*>([^<]+)<\/div>[\s\S]*?d-flex flex-wrap[^>]*>([\s\S]*?)<\/div>\s*<\/div>/g;

  for (const categoryMatch of dropSection.matchAll(categoryPattern)) {
    const category = toText(categoryMatch[1]);
    const itemPattern = /href="https:\/\/mxdzlk\.com\/item\/(\d+)\/"[^>]*>([\s\S]*?)<\/a>/g;

    for (const itemMatch of categoryMatch[2].matchAll(itemPattern)) {
      drops.push({ id: itemMatch[1], name: toText(itemMatch[2]), category });
    }
  }

  return {
    id,
    name: titleMatch ? toText(titleMatch[1]) : id,
    imageUrl: imageMatch?.[1] ?? null,
    sourceUrl: `${SOURCE_URL}${id}/?sv=${version}`,
    stats,
    drops,
    traits: {
      weaknesses: [...weaknesses],
      resistances: [...resistances],
    },
  };
}

// 控制并发地抓取怪物详情，避免对公开数据源造成突发请求
async function mapWithConcurrency(values, mapper) {
  const results = [];
  let nextIndex = 0;

  async function worker() {
    while (nextIndex < values.length) {
      const currentIndex = nextIndex;
      nextIndex += 1;
      results[currentIndex] = await mapper(values[currentIndex]);
    }
  }

  await Promise.all(Array.from({ length: Math.min(REQUEST_CONCURRENCY, values.length) }, worker));
  return results;
}

// 抓取并写入整个可版本化的怪物本地数据库
async function updateDatabase() {
  const versionArgument = process.argv.find((argument) => argument.startsWith('--version='));
  const version = versionArgument?.split('=')[1] || DEFAULT_VERSION;
  const firstPage = await fetchHtml(`${SOURCE_URL}?sv=${version}&page_num=1`);
  const pageCount = parsePageCount(firstPage);
  const remainingPages = await Promise.all(
    Array.from({ length: pageCount - 1 }, (_, index) => fetchHtml(`${SOURCE_URL}?sv=${version}&page_num=${index + 2}`)),
  );
  const pages = [firstPage, ...remainingPages];
  const ids = [...new Set(pages.flatMap(parseMonsterIds))];

  if (ids.length === 0) {
    throw new Error('未在列表页找到怪物，已停止写入以保护现有本地数据。');
  }

  const monsters = await mapWithConcurrency(ids, async (id) => {
    const html = await fetchHtml(`${SOURCE_URL}${id}/?sv=${version}`);
    return parseMonster(html, id, version);
  });
  const document = {
    schemaVersion: 1,
    source: {
      name: '怀旧冒险岛资料库',
      url: SOURCE_URL,
      version,
      pages: pageCount,
      updatedAt: new Date().toISOString(),
    },
    monsters,
  };

  await mkdir(dirname(OUTPUT_PATH), { recursive: true });
  await writeFile(OUTPUT_PATH, `${JSON.stringify(document, null, 2)}\n`, 'utf8');
  console.log(`已写入 ${monsters.length} 条 ${version} 怪物数据：${OUTPUT_PATH}`);
}

updateDatabase().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
