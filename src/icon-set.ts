import { createIconifyProvider } from '@open-pencil/core/icons';
import type { IconProvider } from '@open-pencil/core/icons';

/** One icon body as Iconify stores it. */
interface IconBody {
  body: string;
  width?: number;
  height?: number;
}

/** The shape of a bundled Iconify JSON file. */
interface IconSetFile {
  prefix: string;
  width?: number;
  height?: number;
  icons: Record<string, IconBody | undefined>;
  aliases?: Record<string, { parent: string } | undefined>;
}

/**
 * Tell a bundled icon file from an unknown value.
 * @param value the parsed JSON.
 * @returns whether it has the shape the provider needs.
 */
function isIconSet(value: unknown): value is IconSetFile {
  if (value === null || typeof value !== 'object') return false;
  const fields: Record<string, unknown> = { ...value };
  if (typeof fields['prefix'] !== 'string' || fields['prefix'] === '') return false;
  if (fields['icons'] === null || typeof fields['icons'] !== 'object') return false;
  return true;
}

/**
 * Tell one icon body from an unknown value.
 * @param value the entry.
 * @returns whether it has a body.
 */
function isBody(value: unknown): value is IconBody {
  if (value === null || typeof value !== 'object') return false;
  return typeof (value as Record<string, unknown>)['body'] === 'string';
}

/**
 * An icon provider over one bundled Iconify set. The file is loaded on the first
 * icon, so a design without icons never reads it. Unknown sets and names fail
 * with a message rather than falling back to the network.
 * @param load reads and parses the bundled JSON.
 * @returns the provider.
 */
export function bundledIconProvider(load: () => Promise<unknown>): IconProvider {
  let set: Promise<IconSetFile> | null = null;
  const file = (): Promise<IconSetFile> => {
    set ??= load().then((value) => {
      if (!isIconSet(value)) throw new Error('The bundled icon set is malformed.');
      return value;
    });
    set.catch(() => {
      set = null;
    });
    return set;
  };
  const name = async (): Promise<string> => (await file()).prefix;
  return createIconifyProvider({
    async fetchCollection(prefix: string, iconNames: string[]) {
      const data = await file();
      if (prefix !== data.prefix) throw new Error('Icon set "' + prefix + '" is not bundled. Use ' + data.prefix + ':<name>.');
      const icons: Record<string, IconBody | undefined> = {};
      for (const iconName of iconNames) {
        const entry = data.icons[iconName];
        if (isBody(entry)) icons[iconName] = { body: entry.body, width: entry.width, height: entry.height };
      }
      return { prefix, width: data.width, height: data.height, icons, aliases: data.aliases };
    },
    async collections() {
      const data = await file();
      return [{ prefix: data.prefix, name: 'Material Design Icons', total: Object.keys(data.icons).length, category: 'General', license: 'Apache-2.0', multicolor: false }];
    },
    async collectionIcons(): Promise<string[]> {
      const data = await file();
      return Object.keys(data.icons).map((iconName) => data.prefix + ':' + iconName);
    },
    async search(query, options) {
      const data = await file();
      const prefix = await name();
      const limit = options?.limit ?? 20;
      const needle = query.toLowerCase();
      const icons = Object.keys(data.icons)
        .filter((iconName) => iconName.toLowerCase().includes(needle))
        .slice(0, limit)
        .map((iconName) => prefix + ':' + iconName);
      return { icons, total: icons.length, collections: { [prefix]: { name: 'Material Design Icons', total: Object.keys(data.icons).length, category: 'General' } } };
    },
  });
}
