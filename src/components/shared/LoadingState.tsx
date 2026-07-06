import styles from "./LoadingState.module.css"

interface LoadingStateProps {
  text?: string
}

export function LoadingState({ text = "Loading..." }: LoadingStateProps) {
  return (
    <div className={styles.container}>
      <div className={styles.spinner} aria-hidden="true" />
      <span className={styles.text}>{text}</span>
    </div>
  )
}
