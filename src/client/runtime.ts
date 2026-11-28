import type { LayoutService, SidebarRightService, SidebarRightTabsService } from './harness.js';

/** Runtime handles shared by code that runs outside a tab, such as the chat card and the composer menu. */
export const runtime: {
  sidebarRight: SidebarRightService | null;
  sidebarRightTabs: SidebarRightTabsService | null;
  layout: LayoutService | null;
} = {
  sidebarRight: null,
  sidebarRightTabs: null,
  layout: null,
};

/**
 * Open an HTTP(S) link from a page artifact outside its preview frame: in the
 * Harness browser tab when the composition registers one, else a new browser
 * tab. The report follows the click, so the browser keeps its user activation.
 * @param url the absolute HTTP(S) URL to open.
 */
export function openPageLink(url: string): void {
  if (runtime.sidebarRight !== null && runtime.sidebarRightTabs?.get('browser') !== undefined) {
    try {
      runtime.sidebarRight.openTab('browser', { params: { url } });
      return;
    } catch {
      // The full-page Artifacts panel has no session surface, so it cannot host the browser tab.
    }
  }
  window.open(url, '_blank', 'noopener,noreferrer');
}
