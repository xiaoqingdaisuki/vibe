import { forwardRef, useId } from 'react';

import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

// 表单输入组件，支持标签和错误提示
export const Input = forwardRef<HTMLInputElement, InputProps>(({ label, error, className = '', ...props }, ref) => {
  const generatedId = useId();
  const inputId = props.id || `input-${props.name || generatedId}`;
  return (
    <div className={styles.wrapper}>
      {label && (
        <label htmlFor={inputId} className={styles.label}>
          {label}
        </label>
      )}
      <input
        ref={ref}
        id={inputId}
        className={`${styles.input} ${error ? styles.error : ''} ${className}`}
        {...props}
      />
      {error && <p className={styles.errorText}>{error}</p>}
    </div>
  );
});

Input.displayName = 'Input';
