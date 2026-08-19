import { forwardRef, useId, type ReactNode } from 'react';

import styles from './Input.module.css';

interface InputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  description?: string;
  error?: string;
  startAdornment?: ReactNode;
  endAdornment?: ReactNode;
  wrapperClassName?: string;
  inputClassName?: string;
}

// 表单输入组件，支持说明、状态提示与前后附加内容
export const Input = forwardRef<HTMLInputElement, InputProps>(
  (
    {
      label,
      description,
      error,
      startAdornment,
      endAdornment,
      wrapperClassName = '',
      className = '',
      inputClassName = '',
      ...props
    },
    ref,
  ) => {
    const generatedId = useId();
    const inputId = props.id || `input-${props.name || generatedId}`;
    const descriptionId = description ? `${inputId}-description` : undefined;
    const errorId = error ? `${inputId}-error` : undefined;
    const describedBy = [props['aria-describedby'], descriptionId, errorId].filter(Boolean).join(' ') || undefined;

    return (
      <div className={`${styles.wrapper} ${wrapperClassName}`}>
        {label && (
          <label htmlFor={inputId} className={styles.label}>
            {label}
          </label>
        )}
        {description && (
          <p id={descriptionId} className={styles.description}>
            {description}
          </p>
        )}
        <div className={`${styles.control} ${error ? styles.error : ''}`}>
          {startAdornment && (
            <span className={styles.adornment} aria-hidden="true">
              {startAdornment}
            </span>
          )}
          <input
            {...props}
            ref={ref}
            id={inputId}
            aria-describedby={describedBy}
            aria-invalid={error ? true : props['aria-invalid']}
            className={`${styles.input} ${className} ${inputClassName}`}
          />
          {endAdornment && <span className={styles.adornment}>{endAdornment}</span>}
        </div>
        {error && (
          <p id={errorId} className={styles.errorText} role="alert">
            {error}
          </p>
        )}
      </div>
    );
  },
);

Input.displayName = 'Input';
