import styles from "./PageHeader.module.css"

interface PageHeaderProps {
  title: string
  description?: string
  eyebrow?: string
}

export function PageHeader({ title, description, eyebrow }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1 className={styles.title}>{title}</h1>
      {description && (
        <p className={styles.description}>{description}</p>
      )}
    </header>
  )
}
