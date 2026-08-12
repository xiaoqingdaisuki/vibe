// 保留其他查询参数并生成最新的怪物筛选查询字符串
export function getMaplestoryFilterSearch(search: string, filter: string): string {
  const params = new URLSearchParams(search);
  const normalizedFilter = filter.trim();

  if (normalizedFilter) {
    params.set('filter', normalizedFilter);
  } else {
    params.delete('filter');
  }

  const serializedParams = params.toString();
  return serializedParams ? `?${serializedParams}` : '';
}
