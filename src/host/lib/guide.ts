/**
 * Guides: the conventions a user or a project keeps for every artifact, plus
 * their own recipes. The library guide holds the user's preferences across
 * projects; a workspace guide holds one project's conventions. Both live in
 * guide.json beside design-system.json in their scope root.
 */

import fs from 'node:fs/promises';
import path from 'node:path';
import type { ArtifactType } from '../../contract.js';
import { ArtifactError } from './errors.js';
import { assertWithin, withLock, writeAtomic } from './fsutil.js';
import { assertPlainFile } from './paths.js';
import type { ScopeRoot } from './paths.js';
import { BUILTIN_RECIPES, MAX_RECIPES, RECIPE_ID, parseRecipe } from './recipes.js';
import type { Recipe, ResolvedRecipe } from './recipes.js';

const FILE = 'guide.json';
export const MAX_INSTRUCTIONS = 6000;

export interface Guide {
  readonly schemaVersion: 1;
  readonly instructions: string;
  readonly recipes: readonly Recipe[];
}

/** A change to one guide. Absent fields keep their value. */
export interface GuidePatch {
  readonly instructions?: string;
  readonly recipe?: unknown;
  readonly removeRecipe?: string;
}

export const EMPTY_GUIDE: Guide = { schemaVersion: 1, instructions: '', recipes: [] };

/**
 * Validate a stored or proposed guide.
 * @param value the candidate.
 * @returns the guide.
 */
export function parseGuide(value: unknown): Guide {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ArtifactError('artifact/invalid-guide', 'A guide must be an object.', {});
  }
  const fields: Record<string, unknown> = { ...value };
  if (fields.schemaVersion !== 1) throw new ArtifactError('artifact/invalid-guide', 'Unsupported guide schemaVersion. Expected 1.');
  const instructions = fields.instructions ?? '';
  if (typeof instructions !== 'string' || instructions.length > MAX_INSTRUCTIONS) {
    throw new ArtifactError('artifact/invalid-guide', 'instructions must be text up to ' + String(MAX_INSTRUCTIONS) + ' characters.', { field: 'instructions' });
  }
  const recipes = fields.recipes ?? [];
  if (!Array.isArray(recipes) || recipes.length > MAX_RECIPES) {
    throw new ArtifactError('artifact/invalid-guide', 'recipes must be a list of up to ' + String(MAX_RECIPES) + ' recipes.', { field: 'recipes' });
  }
  const parsed = recipes.map((item: unknown, index) => parseRecipe(item, 'recipes[' + String(index) + ']'));
  if (new Set(parsed.map((item) => item.id)).size !== parsed.length) {
    throw new ArtifactError('artifact/invalid-guide', 'Recipe ids must be unique.', { field: 'recipes' });
  }
  return { schemaVersion: 1, instructions: instructions.trim(), recipes: parsed };
}

/**
 * A missing guide is empty. Invalid saved data is reported rather than
 * silently replaced by a partial update.
 * @param root the scope root, or undefined when the workspace has no store.
 * @returns the guide.
 */
export async function readGuide(root: ScopeRoot | undefined): Promise<Guide> {
  if (root === undefined) return EMPTY_GUIDE;
  const file = path.join(root.root, FILE);
  await assertWithin(root.root, file);
  if (!(await assertPlainFile(file))) return EMPTY_GUIDE;
  if ((await fs.stat(file)).size > 1024 * 1024) throw new ArtifactError('artifact/invalid-guide', 'Guide exceeds the 1 MiB read limit.');
  try {
    return parseGuide(JSON.parse(await fs.readFile(file, 'utf8')));
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new ArtifactError('artifact/invalid-guide', 'The saved guide contains invalid JSON. Repair it before updating conventions.', { file });
    }
    throw error;
  }
}

/**
 * Apply a patch to one scope's guide under its lock.
 * @param root the scope root to write.
 * @param patch the change.
 * @returns the saved guide.
 */
export async function saveGuide(root: ScopeRoot, patch: GuidePatch): Promise<Guide> {
  const file = path.join(root.root, FILE);
  return withLock(file, async () => {
    const current = await readGuide(root);
    let recipes = [...current.recipes];
    if (patch.removeRecipe !== undefined) {
      if (!recipes.some((item) => item.id === patch.removeRecipe)) {
        throw new ArtifactError('artifact/not-found', 'This guide has no recipe ' + patch.removeRecipe + '.', { recipe: patch.removeRecipe });
      }
      recipes = recipes.filter((item) => item.id !== patch.removeRecipe);
    }
    if (patch.recipe !== undefined) {
      const recipe = parseRecipe(patch.recipe);
      recipes = [...recipes.filter((item) => item.id !== recipe.id), recipe];
    }
    const next = parseGuide({ schemaVersion: 1, instructions: patch.instructions ?? current.instructions, recipes });
    await assertWithin(root.root, file);
    await assertPlainFile(file);
    await writeAtomic(file, JSON.stringify(next, null, 2) + '\n');
    return next;
  });
}

/** The guides in force for one call, narrowest first. */
export interface GuideLayers {
  readonly workspace: Guide;
  readonly library: Guide;
}

/**
 * Every recipe available for a type, a workspace recipe first, then the
 * library, then the built-in set. The same id at a narrower scope replaces
 * the wider one.
 * @param layers the guides.
 * @param type limit to recipes for this type, when given.
 * @returns the recipes.
 */
export function availableRecipes(layers: GuideLayers, type?: ArtifactType): ResolvedRecipe[] {
  const seen = new Set<string>();
  const out: ResolvedRecipe[] = [];
  const add = (recipes: readonly Recipe[], source: ResolvedRecipe['source']) => {
    for (const recipe of recipes) {
      if (seen.has(recipe.id)) continue;
      seen.add(recipe.id);
      if (type === undefined || recipe.types.includes(type)) out.push({ ...recipe, source });
    }
  };
  add(layers.workspace.recipes, 'workspace');
  add(layers.library.recipes, 'library');
  add(BUILTIN_RECIPES, 'builtin');
  return out;
}

/**
 * Resolve one recipe id through the layers.
 * @param layers the guides.
 * @param id the recipe id.
 * @returns the recipe, or undefined when no layer defines it.
 */
export function findRecipe(layers: GuideLayers, id: string): ResolvedRecipe | undefined {
  if (!RECIPE_ID.test(id)) return undefined;
  return availableRecipes(layers).find((item) => item.id === id);
}
