export type LabAppCategory =
  | "tool"
  | "game"
  | "ai"
  | "visualization"
  | "experiment"
  | "public-api"
  | "app"

export type LabApp = {
  slug: string
  title: string
  description: string
  category: LabAppCategory
  tags: string[]
  href: string
  cover?: string
  featured?: boolean
  recentOrder?: number
  dataSource?: "local" | "public-api" | "future-backend"
}
