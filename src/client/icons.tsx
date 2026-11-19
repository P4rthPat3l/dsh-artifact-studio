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
      strokeWidth={1.5}
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

/** A pen drawing on a board: a whiteboard. */
export const IconBoard = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M7 14.5c2.2-4.2 4.2-5.8 6-4.8 1.8 1 1.2 3.4-0.6 3.4-1.8 0-2.4-2.2-0.6-3.8 1.8-1.6 4.2-0.6 5.2 1.8" />
  </Glyph>
);

/** A grid with a header row and column: a spreadsheet. */
export const IconSheet = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="3.5" y="4.5" width="17" height="15" rx="2" />
    <path d="M3.5 9.5h17M9.5 9.5v10M15 9.5v10M3.5 14.5h17" />
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

/** A square with crossing guides: a frame or section layer. */
export const IconLayerFrame = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M7 3v18M17 3v18M3 7h18M3 17h18" />
  </Glyph>
);

/** A capital letter: a text layer. */
export const IconLayerText = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M5 6h14M12 6v13" />
  </Glyph>
);

/** A rounded square and a circle: a rectangle, ellipse, line, or vector layer. */
export const IconLayerShape = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="3.5" y="3.5" width="11" height="11" rx="2" />
    <circle cx="15.5" cy="15.5" r="5" />
  </Glyph>
);

/** Two overlapping frames: a group, component, or instance layer. */
export const IconLayerGroup = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="3.5" y="3.5" width="12" height="12" rx="2" />
    <path d="M8.5 8.5h12v12h-12z" />
  </Glyph>
);

/** An arrow pointer: the selection tool. */
export const IconCursor = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M5 3.5l12.5 8.2-5.7 1.2L14 19l-2.4 1-2.1-5.1L5 18.2z" />
  </Glyph>
);

/** A hand: the pan tool. */
export const IconHand = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M8 12V5.5a1.5 1.5 0 0 1 3 0V11M11 10.5V4.5a1.5 1.5 0 0 1 3 0V11M14 10.5V6.5a1.5 1.5 0 0 1 3 0V13c0 4-2.4 7-6 7-3.3 0-4.6-1.6-6.5-5.2L3.2 11.5a1.5 1.5 0 0 1 2.5-1.6L8 12.5" />
  </Glyph>
);

/** A frame tool. */
export const IconFrame = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="4.5" y="4.5" width="15" height="15" rx="2" />
    <path d="M8.5 4.5v15M15.5 4.5v15M4.5 8.5h15M4.5 15.5h15" />
  </Glyph>
);

/** A text tool. */
export const IconText = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M4.5 6.5h15M12 6.5v12" />
  </Glyph>
);

/** A counter-clockwise arrow: undo. */
export const IconUndo = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M4 9.5h9.5a5.5 5.5 0 0 1 0 11H9M4 9.5l4-4M4 9.5l4 4" />
  </Glyph>
);

/** A clockwise arrow: redo. */
export const IconRedo = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M20 9.5h-9.5a5.5 5.5 0 0 0 0 11H15M20 9.5l-4-4M20 9.5l-4 4" />
  </Glyph>
);

/** An open eye: a visible layer. */
export const IconEye = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <circle cx="12" cy="12" r="2.6" />
  </Glyph>
);

/** A crossed eye: a hidden layer. */
export const IconEyeOff = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
    <path d="M4 4l16 16" />
  </Glyph>
);

/** A closed padlock: a locked layer. */
export const IconLock = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 8 0v3.5" />
  </Glyph>
);

/** An open padlock: an unlocked layer. */
export const IconLockOpen = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="5" y="10.5" width="14" height="9.5" rx="2" />
    <path d="M8 10.5V7a4 4 0 0 1 7.4-2" />
  </Glyph>
);
