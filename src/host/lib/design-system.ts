import fs from 'node:fs/promises';
import path from 'node:path';
import { COLOR_ROLES, DEFAULT_TOKENS, tokensToCss } from '../../contract.js';
import type { DesignTokens, ResolvedDesignSystem, Scope, TokenColors } from '../../contract.js';
import { ArtifactError } from './errors.js';
import { assertWithin, withLock, writeAtomic } from './fsutil.js';
import { assertPlainFile } from './paths.js';
import type { ScopeRoot } from './paths.js';

const FILE = 'design-system.json';

/**
 * Values reach a `<style>` block, so only characters that cannot close a
 * declaration, a rule, or the element are accepted.
 */
const SAFE_VALUE = /^[#\w\s,.'"()%+-]{1,200}$/;

type Record_ = Record<string, unknown>;

/**
 * Whether a value is a plain object.
 * @param value the value.
 * @returns whether it is an object.
 */
function isObject(value: unknown): value is Record_ {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

/**
 * Read a CSS-safe string.
 * @param value the value.
 * @param field the field name for the error.
 * @returns the string.
 */
function cssString(value: unknown, field: string): string {
  if (typeof value !== 'string' || !SAFE_VALUE.test(value)) {
    throw new ArtifactError('artifact/invalid-tokens', `${field} must be a short CSS value without ; { } < or >.`, {
      field,
    });
  }
  return value.trim();
}

/**
 * Read a list of pixel sizes.
 * @param value the value.
 * @param field the field name for the error.
 * @returns the sizes.
 */
function sizes(value: unknown, field: string): number[] {
  if (!Array.isArray(value) || value.length === 0 || value.length > 12) {
    throw new ArtifactError('artifact/invalid-tokens', `${field} must be a list of 1 to 12 numbers.`, { field });
  }
  return value.map((item) => size(item, field));
}

/**
 * Read one pixel size.
 * @param value the value.
 * @param field the field name for the error.
 * @returns the size.
 */
function size(value: unknown, field: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0 || value > 512) {
    throw new ArtifactError('artifact/invalid-tokens', `${field} must be a number from 0 to 512.`, { field });
  }
  return value;
}

/**
 * Merge one color set.
 * @param base the colors to start from.
 * @param patch the patch value for this set.
 * @param field the field name for errors.
 * @returns valid colors.
 */
function mergeColors(base: TokenColors, patch: unknown, field: string): TokenColors {
  const source = isObject(patch) ? patch : {};
  const colors = { ...base };
  for (const role of COLOR_ROLES) colors[role] = cssString(source[role] ?? base[role], `${field}.${role}`);
  return colors;
}

/**
 * Merge a partial token patch onto a base and validate the result.
 * @param base the tokens to start from.
 * @param patch a partial or full token object.
 * @returns valid tokens.
 */
export function mergeTokens(base: DesignTokens, patch: unknown): DesignTokens {
  if (!isObject(patch)) throw new ArtifactError('artifact/invalid-tokens', 'Tokens must be an object.');
  const typography = isObject(patch.typography) ? patch.typography : {};
  const spacing = isObject(patch.spacing) ? patch.spacing : {};
  const radius = isObject(patch.radius) ? patch.radius : {};
  const name = patch.name ?? base.name;
  const notes = patch.notes ?? base.notes;
  if (typeof name !== 'string' || name.trim() === '' || name.length > 80) {
    throw new ArtifactError('artifact/invalid-tokens', 'name must be 1 to 80 characters.');
  }
  if (typeof notes !== 'string' || notes.length > 4000) {
    throw new ArtifactError('artifact/invalid-tokens', 'notes must be text up to 4000 characters.');
  }
  return {
    schemaVersion: 1,
    name: name.trim(),
    colors: mergeColors(base.colors, patch.colors, 'colors'),
    colorsDark: mergeColors(base.colorsDark, patch.colorsDark, 'colorsDark'),
    typography: {
      fontFamily: cssString(typography.fontFamily ?? base.typography.fontFamily, 'typography.fontFamily'),
      displayFamily: cssString(typography.displayFamily ?? base.typography.displayFamily, 'typography.displayFamily'),
      monoFamily: cssString(typography.monoFamily ?? base.typography.monoFamily, 'typography.monoFamily'),
      scale: sizes(typography.scale ?? base.typography.scale, 'typography.scale'),
    },
    spacing: {
      unit: size(spacing.unit ?? base.spacing.unit, 'spacing.unit'),
      scale: sizes(spacing.scale ?? base.spacing.scale, 'spacing.scale'),
    },
    radius: {
      sm: size(radius.sm ?? base.radius.sm, 'radius.sm'),
      md: size(radius.md ?? base.radius.md, 'radius.md'),
      lg: size(radius.lg ?? base.radius.lg, 'radius.lg'),
    },
    notes,
  };
}

/**
 * Read the token file of one scope root.
 * @param root the scope root.
 * @returns the tokens, or undefined when the scope has none or the file is invalid.
 */
export async function readScopeTokens(root: ScopeRoot): Promise<DesignTokens | undefined> {
  const file = path.join(root.root, FILE);
  if (!(await assertPlainFile(file))) return undefined;
  try {
    const stored: unknown = JSON.parse(await fs.readFile(file, 'utf8'));
    if (!isObject(stored)) return undefined;
    const upgraded = { ...stored };
    for (const set of ['colors', 'colorsDark'] as const) {
      const defaults = DEFAULT_TOKENS[set];
      const colors = stored[set];
      if (!isObject(colors)) continue;
      // Legacy brands must not inherit rust actions or warm backgrounds from the new default.
      upgraded[set] = {
        background: colors.surface ?? defaults.surface,
        raised: colors.surface ?? defaults.surface,
        border: colors.muted ?? defaults.muted,
        control: colors.muted ?? defaults.muted,
        action: colors.primary ?? defaults.primary,
        actionText: colors.surface ?? defaults.surface,
        focus: colors.primary ?? defaults.primary,
        ...colors,
      };
    }
    return mergeTokens(DEFAULT_TOKENS, upgraded);
  } catch (error) {
    if (error instanceof SyntaxError || error instanceof ArtifactError) return undefined;
    throw error;
  }
}

/**
 * Resolve tokens workspace first, then library, then the built-in default.
 * @param workspace the workspace root, when the caller has one.
 * @param library the library root.
 * @returns the tokens, their source, and the CSS rule.
 */
export async function resolveDesignSystem(
  workspace: ScopeRoot | undefined,
  library: ScopeRoot,
): Promise<ResolvedDesignSystem> {
  const own = workspace === undefined ? undefined : await readScopeTokens(workspace);
  if (own !== undefined) return { tokens: own, source: 'workspace', css: tokensToCss(own) };
  const shared = await readScopeTokens(library);
  if (shared !== undefined) return { tokens: shared, source: 'library', css: tokensToCss(shared) };
  return { tokens: DEFAULT_TOKENS, source: 'default', css: tokensToCss(DEFAULT_TOKENS) };
}

/**
 * Save tokens at one scope, merging a partial patch onto what that scope
 * currently resolves to.
 * @param target the scope root to write.
 * @param library the library root, for the base of a new workspace override.
 * @param patch partial or full tokens.
 * @returns the saved tokens and their scope.
 */
export async function saveDesignSystem(
  target: ScopeRoot,
  library: ScopeRoot,
  patch: unknown,
): Promise<{ tokens: DesignTokens; scope: Scope }> {
  const file = path.join(target.root, FILE);
  return withLock(file, async () => {
    // Read inside the lock, so a UI save and a tool save cannot interleave.
    const base = (await resolveDesignSystem(target.scope === 'workspace' ? target : undefined, library)).tokens;
    const tokens = mergeTokens(base, patch);
    await assertWithin(target.root, file);
    await assertPlainFile(file);
    await writeAtomic(file, `${JSON.stringify(tokens, null, 2)}\n`);
    return { tokens, scope: target.scope };
  });
}

/**
 * Remove a workspace override so the workspace inherits the library again.
 * @param workspace the workspace root.
 */
export async function clearWorkspaceDesignSystem(workspace: ScopeRoot): Promise<void> {
  const file = path.join(workspace.root, FILE);
  await withLock(file, async () => {
    await assertWithin(workspace.root, file);
    if (await assertPlainFile(file)) await fs.rm(file);
  });
}
