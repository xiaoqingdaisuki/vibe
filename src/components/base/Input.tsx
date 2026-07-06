import { forwardRef } from "react"

import styles from "./Input.module.css"

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string
  error?: string
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className = "", ...props }, ref) => {
    return (
      <div className={styles.wrapper}>
        {label && <label className={styles.label}>{label}</label>}
        <input
          ref={ref}
          className={`${styles.input} ${error ? styles.error : ""} ${className}`}
          {...props}
        />
        {error && <p className={styles.errorText}>{error}</p>}
      </div>
    )
  },
)

Input.displayName = "Input"
