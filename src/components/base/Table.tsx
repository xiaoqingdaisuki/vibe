import {
  forwardRef,
  type HTMLAttributes,
  type TableHTMLAttributes,
  type TdHTMLAttributes,
  type ThHTMLAttributes,
} from 'react';

import styles from './Table.module.css';

interface TableProps extends TableHTMLAttributes<HTMLTableElement> {
  wrapperClassName?: string;
}

// 渲染带水平滚动容器的响应式数据表格
export const Table = forwardRef<HTMLTableElement, TableProps>(
  ({ className = '', wrapperClassName = '', ...props }, ref) => {
    return (
      <div className={`${styles.wrapper} ${wrapperClassName}`}>
        <table ref={ref} className={`${styles.table} ${className}`} {...props} />
      </div>
    );
  },
);

// 渲染表格标题说明
export const TableCaption = forwardRef<HTMLTableCaptionElement, HTMLAttributes<HTMLTableCaptionElement>>(
  ({ className = '', ...props }, ref) => <caption ref={ref} className={`${styles.caption} ${className}`} {...props} />,
);

// 渲染表格头部区域
export const TableHeader = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className = '', ...props }, ref) => <thead ref={ref} className={`${styles.header} ${className}`} {...props} />,
);

// 渲染表格主体区域
export const TableBody = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className = '', ...props }, ref) => <tbody ref={ref} className={`${styles.body} ${className}`} {...props} />,
);

// 渲染表格底部汇总区域
export const TableFooter = forwardRef<HTMLTableSectionElement, HTMLAttributes<HTMLTableSectionElement>>(
  ({ className = '', ...props }, ref) => <tfoot ref={ref} className={`${styles.footer} ${className}`} {...props} />,
);

// 渲染可复用的数据表行
export const TableRow = forwardRef<HTMLTableRowElement, HTMLAttributes<HTMLTableRowElement>>(
  ({ className = '', ...props }, ref) => <tr ref={ref} className={`${styles.row} ${className}`} {...props} />,
);

// 渲染表格列标题单元格
export const TableHead = forwardRef<HTMLTableCellElement, ThHTMLAttributes<HTMLTableCellElement>>(
  ({ className = '', ...props }, ref) => <th ref={ref} className={`${styles.head} ${className}`} {...props} />,
);

// 渲染表格内容单元格
export const TableCell = forwardRef<HTMLTableCellElement, TdHTMLAttributes<HTMLTableCellElement>>(
  ({ className = '', ...props }, ref) => <td ref={ref} className={`${styles.cell} ${className}`} {...props} />,
);

Table.displayName = 'Table';
TableCaption.displayName = 'TableCaption';
TableHeader.displayName = 'TableHeader';
TableBody.displayName = 'TableBody';
TableFooter.displayName = 'TableFooter';
TableRow.displayName = 'TableRow';
TableHead.displayName = 'TableHead';
TableCell.displayName = 'TableCell';
