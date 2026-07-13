import { forwardRef } from 'react';

import styles from './Card.module.css';

interface CardProps extends React.HTMLAttributes<HTMLDivElement> {
  hoverable?: boolean;
}

export const Card = forwardRef<HTMLDivElement, CardProps>(({ hoverable = false, className = '', ...props }, ref) => {
  return <div ref={ref} className={`${styles.card} ${hoverable ? styles.hoverable : ''} ${className}`} {...props} />;
});

Card.displayName = 'Card';
