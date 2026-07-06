import styles from "./ErrorState.module.css"

interface ErrorStateProps {
  title?: string
  message?: string
  onRetry?: () => void
}

export function ErrorState({
  title = "Something went wrong",
  message,
  onRetry,
}: ErrorStateProps) {
  return (
    <div className={styles.container}>
      <div className={styles.iconWrap} aria-hidden="true">
        <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
      </div>
      <p className={styles.title}>{title}</p>
      {message && (
        <p className={styles.message}>{message}</p>
      )}
      {onRetry && (
        <button
          onClick={onRetry}
          className={styles.retryBtn}
        >
          Try again
        </button>
      )}
    </div>
  )
}
