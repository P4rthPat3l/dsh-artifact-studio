import { ARTIFACT_DESIGN_SKILL } from './lib/skill.js';
import type { BundledSkill } from './lib/skill.js';

export const name = 'dsh-artifact-studio-skill';

export const inject = ['skills'];

/** The host context the skill plugin receives. */
export interface SkillHostContext {
  readonly skills: { register(skill: BundledSkill): () => void };
}

/**
 * Register the artifact design skill. It is a separate plugin, so a
 * composition without the skill registry still loads the tools and the route.
 * @param ctx the plugin context.
 */
export function apply(ctx: SkillHostContext): void {
  ctx.skills.register(ARTIFACT_DESIGN_SKILL);
}
