import styles from './PageHeader.module.css';

interface PageHeaderProps {
  title: string;
  description?: string;
  eyebrow?: string;
}

// 页面头部标题组件
export function PageHeader({ title, description, eyebrow }: PageHeaderProps) {
  return (
    <header className={styles.header}>
      {eyebrow && <span className="eyebrow">{eyebrow}</span>}
      <h1 className={styles.title}>{title}</h1>
      {description && <p className={styles.description}>{description}</p>}
    </header>
  );
}
