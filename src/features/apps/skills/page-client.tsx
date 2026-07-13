'use client';

import { useState } from 'react';
import type { Skill } from './types';
import { skills } from './data';
import { renderSkillNotes } from './render-skill-notes';
import styles from './styles/Skills.module.css';

function MarkdownRenderer({ content }: { content: string }) {
  return <div className={styles.markdown}>{renderSkillNotes(content)}</div>;
}

function SkillCard({ skill, onClick }: { skill: Skill; onClick: () => void }) {
  return (
    <button onClick={onClick} className={styles.card} type="button">
      <div className={styles.cardHeader}>
        <h3 className={styles.cardTitle}>{skill.name}</h3>
      </div>
      <p className={styles.cardCategory}>{skill.category}</p>
      <p className={styles.cardDesc}>{skill.description}</p>
      <div className={styles.agents}>
        {skill.agents.map((agent) => (
          <span key={agent} className={styles.agentTag}>
            {agent}
          </span>
        ))}
      </div>
    </button>
  );
}

function SkillDetail({ skill, onBack }: { skill: Skill; onBack: () => void }) {
  return (
    <div className={styles.detail}>
      <button onClick={onBack} className={styles.backBtn} type="button">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <path d="M19 12H5" />
          <path d="M12 19l-7-7 7-7" />
        </svg>
        <span>Back</span>
      </button>

      <div className={styles.detailHeader}>
        <h1 className={styles.detailTitle}>{skill.name}</h1>
        <p className={styles.detailCategory}>{skill.category}</p>
        <p className={styles.detailDesc}>{skill.description}</p>
        <div className={styles.agents}>
          {skill.agents.map((agent) => (
            <span key={agent} className={styles.agentTag}>
              {agent}
            </span>
          ))}
        </div>
        {skill.link && (
          <a href={skill.link} target="_blank" rel="noopener noreferrer" className={styles.externalLink}>
            Reference
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M18 13v6a2 2 0 01-2 2H5a2 2 0 01-2-2V8a2 2 0 012-2h6" />
              <polyline points="15 3 21 3 21 9" />
              <line x1="10" y1="14" x2="21" y2="3" />
            </svg>
          </a>
        )}
      </div>

      <div className={styles.divider} />

      <div className={styles.content}>
        <h2 className={styles.contentTitle}>Notes</h2>
        <MarkdownRenderer content={skill.notes} />
      </div>
    </div>
  );
}

export function Skills() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedSkill = selectedId ? skills.find((s) => s.id === selectedId) : null;

  return (
    <div>
      {selectedSkill ? (
        <SkillDetail skill={selectedSkill} onBack={() => setSelectedId(null)} />
      ) : (
        <div className={styles.grid}>
          {skills.map((skill) => (
            <SkillCard key={skill.id} skill={skill} onClick={() => setSelectedId(skill.id)} />
          ))}
        </div>
      )}

      {skills.length === 0 && <p className="mt-8 text-muted">No skills yet.</p>}
    </div>
  );
}

export default Skills;
