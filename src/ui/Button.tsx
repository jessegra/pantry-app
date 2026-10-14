import type { ButtonHTMLAttributes } from 'react';
import { Link, type LinkProps } from 'react-router-dom';
import styles from './Button.module.css';

type Variant = 'primary' | 'secondary' | 'neutral' | 'text' | 'danger';
type Size = 44 | 48 | 56;

const cls = (variant: Variant, size: Size, className?: string) =>
  [styles.button, styles[variant], styles[`h${size}`], className].filter(Boolean).join(' ');

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
}

/** DESIGN.md buttons: primary (blue fill), secondary (blue outline), neutral (grey outline), text. */
export function Button({ variant = 'primary', size = 48, className, type = 'button', ...rest }: ButtonProps) {
  return <button type={type} className={cls(variant, size, className)} {...rest} />;
}

export function ButtonLink({
  variant = 'primary',
  size = 48,
  className,
  ...rest
}: LinkProps & { variant?: Variant; size?: Size }) {
  return <Link className={cls(variant, size, className)} {...rest} />;
}
