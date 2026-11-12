import type { SidebarRightService } from './harness.js';

/** Runtime handles shared by code that runs outside a tab, such as the chat card. */
export const runtime: { sidebarRight: SidebarRightService | null } = {
  sidebarRight: null,
};
