import type { LabApp } from "../types"
import { labApps } from "../registry"

export function getAllLabAppSlugs(): string[] {
  return labApps.map((app) => app.slug)
}

export function getLabApps(): LabApp[] {
  return [...labApps]
}

export function getLabAppBySlug(slug: string): LabApp | undefined {
  return labApps.find((app) => app.slug === slug)
}

export function getFeaturedLabApps(): LabApp[] {
  return labApps.filter((app) => app.featured)
}
