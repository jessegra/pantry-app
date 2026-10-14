import type { ButtonHTMLAttributes } from 'react';
import styles from './Chip.module.css';

interface ChipProps extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'role'> {
  selected: boolean;
  /** 'toggle' = aria-pressed (filters); 'radio' = role="radio" + aria-checked (pick one). */
  kind?: 'toggle' | 'radio';
}

/** 44px pill. Off: white with chip border. On: blue fill. */
export function Chip({ selected, kind = 'toggle', className, ...rest }: ChipProps) {
  const a11y = kind === 'radio' ? { role: 'radio', 'aria-checked': selected } : { 'aria-pressed': selected };
  return <button type="button" className={[styles.chip, className].filter(Boolean).join(' ')} {...a11y} {...rest} />;
}
