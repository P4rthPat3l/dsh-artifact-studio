import type { LayoutService, SidebarRightService } from './harness.js';

/** Runtime handles shared by code that runs outside a tab, such as the chat card and the composer menu. */
export const runtime: { sidebarRight: SidebarRightService | null; layout: LayoutService | null } = {
  sidebarRight: null,
  layout: null,
};
