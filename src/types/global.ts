export interface SiteConfig {
  name: string
  description: string
  url: string
  author: string
}

export interface NavItem {
  href: string
  label: string
  external?: boolean
}
