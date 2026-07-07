"use client"

import type { Character } from "../types"
import { SKILLS, getSkillEffectValue, SKILL_USES_PER_LEVEL } from "../static-data"
import styles from "./SkillsPanel.module.css"

interface SkillsPanelProps {
  character: Character
  onCommand: (cmd: string, args?: string[]) => void
}

const SKILL_MAP = new Map(SKILLS.map(s => [s.id, s]))

function SkillProgressBar({ skillId, level, skillUsage }: { skillId: string; level: number; skillUsage: Record<string, number> }) {
  if (level >= 10) {
    return <span className={styles.maxLevelBadge}>MAX</span>
  }

  const usage = skillUsage[skillId] || 0
  const needed = level * SKILL_USES_PER_LEVEL
  const pct = Math.min(100, Math.floor(usage / needed * 100))
  const filled = Math.floor(pct / 10)

  return (
    <div className={styles.progressContainer}>
      <div className={styles.progressBar}>
        <div className={styles.progressFill} style={{ width: `${pct}%` }} />
      </div>
      <span className={styles.progressText}>{pct}%</span>
    </div>
  )
}

export function SkillsPanel({ character, onCommand }: SkillsPanelProps) {
  const classNames: Record<string, string> = {
    warrior: "战士",
    mage: "法师",
    rogue: "盗贼",
  }

  const availableSkills = SKILLS.filter(s => !s.classRequired || s.classRequired === character.class)
  const learnedIds = new Set(character.skills.map(s => s.skillId))

  return (
    <div className={styles.container}>
      <h3 className={styles.title}>技能 ({character.skills.length}/{availableSkills.length})</h3>
      <div className={styles.list}>
        {character.skills.length === 0 ? (
          <p className={styles.empty}>还没有学习任何技能</p>
        ) : (
          character.skills.map((skill) => {
            const skillDef = SKILL_MAP.get(skill.skillId)
            if (!skillDef) return null

            const scaledValue = getSkillEffectValue(skillDef, skill.level)
            const effectStr = skillDef.effect.type === "damage"
              ? `造成 ${Math.floor(scaledValue * 100)}% 伤害`
              : skillDef.effect.type === "heal"
                ? `恢复 ${Math.floor(scaledValue * 100)}% HP`
                : skillDef.description

            return (
              <div key={skill.skillId} className={styles.skill}>
                <div className={styles.skillHeader}>
                  <span className={styles.skillName}>{skillDef.name}</span>
                  <div className={styles.skillLevelArea}>
                    <span className={styles.skillLevel}>Lv.{skill.level}</span>
                    <SkillProgressBar
                      skillId={skill.skillId}
                      level={skill.level}
                      skillUsage={character.skillUsage || {}}
                    />
                  </div>
                </div>
                <p className={styles.skillDesc}>{effectStr}</p>
              </div>
            )
          })
        )}
      </div>
      <div className={styles.hint}>
        <p className={styles.available}>
          可学习: {availableSkills.filter(s => !learnedIds.has(s.id)).map(s => s.name).join("、") || "无"}
        </p>
      </div>
    </div>
  )
}
