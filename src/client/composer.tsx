import type { SessionSlotProps } from './harness.js';
import { IconArtifacts } from './icons.jsx';
import { runtime } from './runtime.js';

export const GALLERY_KIND = 'artifacts';

/**
 * The composer button that opens the Artifacts page beside the chat.
 * @param props slot props.
 * @returns the button.
 */
export function ComposerButton({ t }: SessionSlotProps) {
  return (
    <button
      type="button"
      className="art-composer"
      aria-label={t('composer.label')}
      title={t('composer.label')}
      onClick={() => runtime.sidebarRight?.openTab(GALLERY_KIND)}
    >
      <IconArtifacts />
    </button>
  );
}
