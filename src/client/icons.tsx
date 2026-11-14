import React from 'react';
import type { ReactNode } from 'react';

/** One 24-unit stroke glyph; every icon in the plugin shares this stroke and weight. */
function Glyph({ children, size = 16 }: { children: ReactNode; size?: number }): ReactNode {
  return (
    <svg
      viewBox="0 0 24 24"
      width={size}
      height={size}
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  );
}

export const IconArtifacts = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="3.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="13.5" y="3.5" width="7" height="7" rx="1.5" />
    <rect x="3.5" y="13.5" width="7" height="7" rx="1.5" />
    <path d="M17 13.5v7M13.5 17h7" />
  </Glyph>
);

export const IconPage = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 8.5h17M9 13l-2 1.8L9 16.5M15 13l2 1.8-2 1.7" />
  </Glyph>
);

export const IconDoc = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M6.5 3.5h7l4 4v13h-11z" />
    <path d="M13.5 3.5v4h4M9 12h6M9 15.5h6" />
  </Glyph>
);

export const IconDesign = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 14.5l4.5-4.5 4 4 3-3 5 5" />
    <circle cx="8.5" cy="8.5" r="1.2" />
  </Glyph>
);

/** A palette with paint wells: the design system, not a settings control. */
export const IconPalette = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M20.5 12a8.5 8.5 0 1 1-8.5-8.5c4.7 0 8.5 3.4 8.5 7.6 0 2.1-1.7 3.8-3.8 3.8h-1.4c-1 0-1.9.8-1.9 1.8 0 .8.5 1.3.5 2.1 0 1-.7 1.7-1.9 1.7Z" />
    <circle cx="7.6" cy="10" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="10" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="14" cy="7" r="1.1" fill="currentColor" stroke="none" />
    <circle cx="17" cy="10.2" r="1.1" fill="currentColor" stroke="none" />
  </Glyph>
);
