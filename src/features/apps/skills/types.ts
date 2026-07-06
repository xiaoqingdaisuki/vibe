export interface Skill {
  id: string
  name: string
  category: string
  description: string
  level: "beginner" | "intermediate" | "advanced" | "expert"
  agents: string[]
  notes: string
  link?: string
}
