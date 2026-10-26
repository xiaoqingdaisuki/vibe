/** 技能参考：类型与数据契约 */

export interface Skill {
  id: string;
  name: string;
  category: string;
  description: string;
  level: 'beginner' | 'intermediate' | 'advanced' | 'expert';
  agents: string[];
  notes: string;
  link?: string;
}
