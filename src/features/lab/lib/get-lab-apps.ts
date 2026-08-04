import type { LabApp } from '../types';
import { labApps } from '../registry';

// 返回所有 Lab 应用的 slug 列表
export function getAllLabAppSlugs(): string[] {
  return labApps.map((app) => app.slug);
}

// 返回所有 Lab 应用的完整信息
export function getLabApps(): LabApp[] {
  return [...labApps];
}

// 根据 slug 查找单个 Lab 应用
export function getLabAppBySlug(slug: string): LabApp | undefined {
  return labApps.find((app) => app.slug === slug);
}

// 返回标记为精选的 Lab 应用列表
export function getFeaturedLabApps(): LabApp[] {
  return labApps.filter((app) => app.featured);
}
