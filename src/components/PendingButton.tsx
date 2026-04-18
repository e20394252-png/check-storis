'use client';

import { useFormStatus } from 'react-dom';

interface PendingButtonProps {
  label: string;
  pendingLabel?: string;
  style?: React.CSSProperties;
  pendingStyle?: React.CSSProperties;
}

/**
 * Submit button that shows a loading state while a Server Action is in progress.
 * Must be used INSIDE a <form> element.
 */
export default function PendingButton({ label, pendingLabel, style, pendingStyle }: PendingButtonProps) {
  const { pending } = useFormStatus();

  return (
    <button
      type="submit"
      disabled={pending}
      style={{
        ...style,
        ...(pending ? pendingStyle : {}),
        opacity: pending ? 0.7 : 1,
        cursor: pending ? 'wait' : 'pointer',
        transition: 'all 0.15s',
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
      }}
    >
      {pending && (
        <span style={{
          width: 12, height: 12,
          border: '2px solid currentColor',
          borderTopColor: 'transparent',
          borderRadius: '50%',
          display: 'inline-block',
          animation: 'spin 0.6s linear infinite',
          flexShrink: 0,
        }} />
      )}
      {pending ? (pendingLabel || label) : label}
    </button>
  );
}
