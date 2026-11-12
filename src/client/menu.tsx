import { useEffect, useRef } from 'react';
import type { ReactNode } from 'react';

/** One menu row. */
export interface MenuItem {
  id: string;
  label: string;
  icon?: ReactNode;
  separatorBefore?: boolean;
  run: () => void;
}

/** Props for a small anchored menu. */
export interface MenuProps {
  label: string;
  items: MenuItem[];
  onClose: () => void;
}

/**
 * An anchored menu that focuses its first row, moves with arrow keys, and
 * closes on Escape or an outside click, returning focus to the trigger.
 * @param props the rows and close callback.
 * @returns the menu.
 */
export function Menu({ label, items, onClose }: MenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const returnTo = useRef<Element | null>(null);

  useEffect(() => {
    returnTo.current = document.activeElement;
    ref.current?.querySelector('button')?.focus();
    const onPointer = (event: PointerEvent) => {
      if (event.target instanceof Node && ref.current?.contains(event.target) !== true) onClose();
    };
    document.addEventListener('pointerdown', onPointer, true);
    return () => {
      document.removeEventListener('pointerdown', onPointer, true);
      if (returnTo.current instanceof HTMLElement) returnTo.current.focus();
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="art-menu"
      role="menu"
      aria-label={label}
      onKeyDown={(event) => {
        const buttons = [...(ref.current?.querySelectorAll('button') ?? [])];
        const index = buttons.findIndex((button) => button === document.activeElement);
        if (event.key === 'Escape') {
          event.preventDefault();
          event.stopPropagation();
          onClose();
        } else if (event.key === 'ArrowDown') {
          event.preventDefault();
          buttons[(index + 1) % buttons.length]?.focus();
        } else if (event.key === 'ArrowUp') {
          event.preventDefault();
          buttons[(index - 1 + buttons.length) % buttons.length]?.focus();
        }
      }}
    >
      {items.map((item) => (
        <div key={item.id} role="none">
          {item.separatorBefore === true ? <hr /> : null}
          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onClose();
              item.run();
            }}
          >
            {item.icon}
            {item.label}
          </button>
        </div>
      ))}
    </div>
  );
}
