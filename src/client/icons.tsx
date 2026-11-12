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

export const IconPlus = () => (
  <Glyph>
    <path d="M12 5v14M5 12h14" />
  </Glyph>
);

export const IconRefresh = () => (
  <Glyph>
    <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4" />
  </Glyph>
);

export const IconHistory = () => (
  <Glyph>
    <path d="M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9" />
    <path d="M4.5 4.5V9H9M12 8v4.5l3 2" />
  </Glyph>
);

export const IconDownload = () => (
  <Glyph>
    <path d="M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14" />
  </Glyph>
);

export const IconExpand = () => (
  <Glyph>
    <path d="M14 4.5h5.5V10M10 19.5H4.5V14M19.5 4.5 13.5 10.5M4.5 19.5l6-6" />
  </Glyph>
);

export const IconCollapse = () => (
  <Glyph>
    <path d="M19.5 4.5l-6 6M13.5 6v4.5H18M4.5 19.5l6-6M10.5 18v-4.5H6" />
  </Glyph>
);

export const IconMore = () => (
  <Glyph>
    <circle cx="6" cy="12" r=".8" />
    <circle cx="12" cy="12" r=".8" />
    <circle cx="18" cy="12" r=".8" />
  </Glyph>
);

export const IconPalette = () => (
  <Glyph>
    <path d="M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.4 1.6-2.4h1.8a3.7 3.7 0 0 0 3.7-3.7c0-5-3.8-9-8.5-9Z" />
    <circle cx="7.8" cy="11" r="1" />
    <circle cx="10.5" cy="7.3" r="1" />
    <circle cx="15" cy="7.5" r="1" />
  </Glyph>
);

export const IconBack = () => (
  <Glyph>
    <path d="M14.5 6 8.5 12l6 6" />
  </Glyph>
);

export const IconSave = () => (
  <Glyph>
    <path d="M5 4.5h11l3 3v12H5z" />
    <path d="M8 4.5V9h7V4.5M8 19.5v-5h8v5" />
  </Glyph>
);
