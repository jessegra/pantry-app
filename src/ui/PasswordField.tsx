import { useId, useState } from 'react';
import { Icon } from './Icon';
import sheetStyles from './Sheet.module.css';
import styles from './PasswordField.module.css';

/** A password input with a 44px "Show password" button, so typos on a phone keyboard can be seen. */
export function PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  hint,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  autoComplete: 'current-password' | 'new-password';
  hint?: string;
}) {
  const id = useId();
  const [shown, setShown] = useState(false);
  return (
    <div className={sheetStyles.field}>
      <label htmlFor={id} className={sheetStyles.label}>
        {label}
      </label>
      <div className={styles.wrap}>
        <input
          id={id}
          className={`${sheetStyles.textInput} ${styles.input}`}
          type={shown ? 'text' : 'password'}
          autoComplete={autoComplete}
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          aria-describedby={hint ? `${id}-hint` : undefined}
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
        <button
          type="button"
          className={styles.toggle}
          aria-label="Show password"
          aria-pressed={shown}
          onClick={() => setShown(!shown)}
        >
          <Icon name={shown ? 'eyeOff' : 'eye'} size={20} strokeWidth={1.8} />
        </button>
      </div>
      {hint && (
        <span id={`${id}-hint`} className={styles.hint}>
          {hint}
        </span>
      )}
    </div>
  );
}
