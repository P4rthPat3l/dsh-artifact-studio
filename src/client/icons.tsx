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

/** A rectangle shape. */
export const IconRectangle = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="4.5" y="6" width="15" height="12" rx="1.5" />
  </Glyph>
);

/** An ellipse shape. */
export const IconEllipse = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <ellipse cx="12" cy="12" rx="7.5" ry="6" />
  </Glyph>
);

/** A line shape. */
export const IconLine = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M4.5 19.5l15-15" />
  </Glyph>
);

/** A pen: bezier vector drawing. */
export const IconPen = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <path d="M12 19.5C8.5 19.5 6 17.3 6 14.3 6 9.9 12 3.5 12 3.5s6 6.4 6 10.8c0 3-2.5 5.2-6 5.2Z" />
    <circle cx="12" cy="14.5" r="1.6" />
  </Glyph>
);

/** Two copies offset: duplicate. */
export const IconDuplicate = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="8.5" y="8.5" width="11" height="11" rx="2" />
    <path d="M15.5 4.5h-8a3 3 0 0 0-3 3v8" />
  </Glyph>
);

/** A raised box: bring forward. */
export const IconForward = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="9.5" y="9.5" width="10" height="10" rx="1.5" fill="currentColor" stroke="none" />
    <path d="M7.5 7.5h10M7.5 7.5v10M4.5 13v-6a2 2 0 0 1 2-2h6" />
  </Glyph>
);

/** A lowered box: send backward. */
export const IconBackward = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="4.5" y="4.5" width="10" height="10" rx="1.5" />
    <path d="M16.5 9.5h-6" />
  </Glyph>
);

/** Two boxes against a left rail: align left. */
export const IconAlignLeft = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="5.5" y="5.5" width="10" height="5.5" rx="1" />
    <rect x="5.5" y="14.5" width="6" height="5.5" rx="1" />
    <path d="M3.5 3.5v17" />
  </Glyph>
);

/** Two boxes against a center rail: align horizontally. */
export const IconAlignCenterX = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="6.5" y="5.5" width="9" height="5.5" rx="1" />
    <rect x="9" y="14.5" width="4" height="5.5" rx="1" />
    <path d="M11 3.5v17" strokeDasharray="3 2" />
  </Glyph>
);

/** Two boxes against a right rail: align right. */
export const IconAlignRight = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="8.5" y="5.5" width="10" height="5.5" rx="1" />
    <rect x="12.5" y="14.5" width="6" height="5.5" rx="1" />
    <path d="M20.5 3.5v17" />
  </Glyph>
);

/** Two boxes against a top rail: align top. */
export const IconAlignTop = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="5.5" y="5.5" width="5.5" height="10" rx="1" />
    <rect x="14.5" y="5.5" width="5.5" height="6" rx="1" />
    <path d="M3.5 3.5h17" />
  </Glyph>
);

/** Two boxes against a middle rail: align vertically. */
export const IconAlignMiddle = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="5.5" y="6.5" width="5.5" height="9" rx="1" />
    <rect x="14.5" y="9" width="5.5" height="4" rx="1" />
    <path d="M3.5 11h17" strokeDasharray="3 2" />
  </Glyph>
);

/** Two boxes against a bottom rail: align bottom. */
export const IconAlignBottom = ({ size }: { size?: number }) => (
  <Glyph size={size}>
    <rect x="5.5" y="8.5" width="5.5" height="10" rx="1" />
    <rect x="14.5" y="12.5" width="5.5" height="6" rx="1" />
    <path d="M3.5 20.5h17" />
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
