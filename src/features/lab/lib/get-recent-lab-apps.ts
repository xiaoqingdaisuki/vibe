import { labApps } from "../registry.ts"
import type { LabApp } from "../types.ts"

const RECENT_APP_LIMIT = 3

export function getRecentLabApps(apps: LabApp[] = labApps): LabApp[] {
  return apps
    .filter((app): app is LabApp & { recentOrder: number } => typeof app.recentOrder === "number")
    .sort((firstApp, secondApp) => firstApp.recentOrder - secondApp.recentOrder)
    .slice(0, RECENT_APP_LIMIT)
}
