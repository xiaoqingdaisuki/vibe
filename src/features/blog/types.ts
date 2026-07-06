export interface BlogPost {
  slug: string
  title: string
  description: string
  date: string
  updated?: string
  tags: string[]
  category: string
  published: boolean
  cover?: string
  content: string
}

export interface BlogPostMetadata {
  title: string
  description: string
  date: string
  updated?: string
  tags: string[]
  category: string
  published: boolean
  cover?: string
}
