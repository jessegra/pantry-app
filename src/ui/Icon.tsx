import { UI_ICONS } from './icons';

export type UiIconName = keyof typeof UI_ICONS;

interface IconProps {
  /** A UI glyph name, or a raw path `d` (e.g. from CATEGORY_ICONS). */
  name?: UiIconName;
  path?: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

/** Stroke-only 24×24 icon. Decorative: label the surrounding control instead. */
export function Icon({ name, path, size = 24, strokeWidth = 1.8, className }: IconProps) {
  const d = path ?? (name ? UI_ICONS[name] : '');
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={d} />
    </svg>
  );
}
