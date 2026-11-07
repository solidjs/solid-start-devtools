import type { JSX } from '@solidjs/web';
import { omit } from 'solid-js';
import './HealthButton.css';

export interface HealthButtonProps extends JSX.ButtonHTMLAttributes<HTMLButtonElement> {
  /** A square button that holds only an icon. */
  icon?: boolean;
  /** The one filled action of a bar. */
  primary?: boolean;
}

/** An action of the Health view, in the size and weight the prototype gives it. */
export function HealthButton(props: HealthButtonProps): JSX.Element {
  const rest = omit(props, 'icon', 'primary', 'children');
  return (
    <button
      type="button"
      {...rest}
      data-solid-health-btn
      data-icon={props.icon ? '' : undefined}
      data-primary={props.primary ? '' : undefined}
    >
      {props.children}
    </button>
  );
}
