/**
 * Recipes: named content structures for an intent, such as a client scope of
 * work or an internal feature spec. A recipe says who reads the artifact, which
 * sections it has, and the content rules. It says nothing about colors or
 * components; tokens and the kit own those.
 */

import { RECIPE_PATTERN, isArtifactType } from '../../contract.js';
import type { ArtifactType } from '../../contract.js';
import { ArtifactError } from './errors.js';

export interface RecipeSection {
  readonly key: string;
  readonly title: string;
  readonly purpose: string;
  readonly required: boolean;
}

export interface Recipe {
  readonly id: string;
  readonly name: string;
  readonly types: readonly ArtifactType[];
  readonly audience: string;
  readonly purpose: string;
  readonly sections: readonly RecipeSection[];
  readonly rules: readonly string[];
}

/** Where a resolved recipe came from, highest precedence first. */
export type RecipeSource = 'workspace' | 'library' | 'builtin';

export interface ResolvedRecipe extends Recipe {
  readonly source: RecipeSource;
}

export const RECIPE_ID = RECIPE_PATTERN;
const SECTION_KEY = /^[a-z][a-z0-9-]{0,39}$/;
export const MAX_RECIPES = 30;

function section(key: string, title: string, purpose: string, required = true): RecipeSection {
  return { key, title, purpose, required };
}

export const BUILTIN_RECIPES: readonly Recipe[] = [
  {
    id: 'feature-spec',
    name: 'Feature specification',
    types: ['page', 'doc'],
    audience: 'The engineers and reviewers who build or approve the feature.',
    purpose: 'Explain a new or changed feature: current behavior, proposed behavior, rules, and what to build. Use for internal requirement docs and change proposals.',
    sections: [
      section('summary', 'Summary', 'What changes and why in a few sentences, and the request it answers.'),
      section('current', 'Current behavior', 'What users and the system do today, naming the screens involved.'),
      section('proposed', 'Proposed behavior', 'Explain the changed behavior. Include screen states or an interactive demonstration when requested or useful, using verified project UI references.'),
      section('rules', 'Rules and edge cases', 'Conditions, limits, permissions, and empty and error states.'),
      section('implementation', 'Implementation notes', 'Where the code changes, with file paths and the current code path.', false),
      section('acceptance', 'Scope and acceptance checks', 'What is in and out of scope, and checks that can fail.'),
      section('questions', 'Open questions', 'Decisions still needed, each with an owner when known.', false),
    ],
    rules: [
      'Feature walkthrough: name the actor and starting conditions, show the actions and alternate paths, and state the resulting behavior.',
      'Identify the request source when available. Quote only supplied or verified wording.',
      'Mark simulated actions and illustrative data.',
      'Do not invent metrics, owners, or estimates.',
    ],
  },
  {
    id: 'client-scope',
    name: 'Client scope of work',
    types: ['page', 'doc'],
    audience: 'The client or external stakeholders approving the deliverables. Match their known technical familiarity.',
    purpose: 'Agree on what will be delivered: the behavior, what users see, what the client controls, and what stays the same.',
    sections: [
      section('aim', 'Aim', 'One short paragraph: what will be added or changed, and the outcome.'),
      section('deliverables', 'Deliverables', 'Describe the agreed outputs and observable outcomes. Choose prose, tables, or a journey view to fit the work and reader.'),
      section('controls', 'What the client controls', 'Settings and admin actions, with their starting values.', false),
      section('unchanged', 'What stays the same', 'Existing behavior and data this work does not change.', false),
      section('assumptions', 'Assumptions and exclusions', 'What the scope depends on and what it leaves out.', false),
      section('next', 'Next step', 'What the client needs to approve or answer.', false),
    ],
    rules: [
      "Use the client's terms. Include implementation detail only when it helps the intended audience approve the scope.",
      'Distinguish agreed deliverables, assumptions, and proposed behavior. Do not invent exact UI messages.',
      'Include commercial terms, responsibilities, schedules, or acceptance conditions when requested and supported by evidence.',
      'Keep one name for each flow throughout.',
    ],
  },
  {
    id: 'investigation',
    name: 'Investigation report',
    types: ['page', 'doc'],
    audience: 'Engineers fixing the problem and the people who reported it.',
    purpose: 'Explain a bug or incident: what is wrong, the evidence, the cause, and the fix.',
    sections: [
      section('problem', 'Problem', 'The defect as one observable sentence, with the real numbers.'),
      section('evidence', 'Evidence', 'Observations, data, and logs, kept apart from interpretation.'),
      section('cause', 'Cause', 'The confirmed cause, or each hypothesis with the check that would confirm it.'),
      section('fix', 'Fix', 'Explain the remedy or proposed next action. A before-and-after comparison is optional.'),
      section('checks', 'Acceptance checks', 'Checks that prove the fix and can fail.'),
      section('reply', 'Reply to the reporter', 'A short plain-language summary the reporter can read.', false),
    ],
    rules: [
      'Investigation report: separate observations, evidence, hypotheses, and unresolved checks.',
      'Do not present a hypothesis as a confirmed cause.',
    ],
  },
  {
    id: 'technical-decision',
    name: 'Technical decision',
    types: ['page', 'doc'],
    audience: 'The engineers and leads who make or review the decision.',
    purpose: 'Recommend one option among several, with evidence.',
    sections: [
      section('recommendation', 'Recommendation', 'The choice and the one-line reason.'),
      section('context', 'Context', 'The problem and the constraints.'),
      section('options', 'Options', 'Each option on the same criteria, with evidence and tradeoffs. A table works well.'),
      section('consequences', 'Consequences', 'What the choice commits to, its risks, and the migration.'),
      section('reversal', 'What would change the decision', 'The evidence that would reopen it.', false),
    ],
    rules: [
      'Technical decision: state the recommendation, compare options with evidence and tradeoffs, and name what would change the decision.',
    ],
  },
  {
    id: 'architecture',
    name: 'Architecture or code walkthrough',
    types: ['page', 'doc'],
    audience: 'Engineers who need to understand a system before changing it.',
    purpose: 'Explain how a system or code path works: its parts, one flow through it, and the risks.',
    sections: [
      section('overview', 'Overview', 'What the system does and its main parts, in short.'),
      section('boundaries', 'Boundaries', 'Components, ownership, and dependencies.'),
      section('flow', 'Flow', 'One request or data flow traced step by step, with file paths.'),
      section('data', 'Data and contracts', 'Data shapes, storage, and interfaces.', false),
      section('files', 'File map', 'Where each part lives.', false),
      section('risks', 'Risks', 'Watch-outs for anyone changing the code.', false),
    ],
    rules: [
      'Architecture walkthrough: show boundaries, dependencies, and one request or data flow.',
      'Label connections and provide a textual flow beside the diagram.',
      'Use real file paths and names from code you read.',
    ],
  },
  {
    id: 'ui-proposal',
    name: 'UI proposal or prototype',
    types: ['page'],
    audience: 'Reviewers who approve a UI before it is built.',
    purpose: 'Show proposed screens and interaction states before implementation. A static canvas mockup is a design artifact instead.',
    sections: [
      section('summary', 'What this shows', 'The change under review and how to use the prototype.'),
      section('prototype', 'Prototype', 'Only the relevant screens and interaction states, inside a product UI replica.'),
      section('decisions', 'Decisions for review', 'Each open design choice with a recommendation.', false),
      section('acceptance', 'Acceptance criteria', 'Checks a reviewer can try in the prototype.', false),
      section('excluded', 'Not in this prototype', 'What the prototype leaves out.', false),
    ],
    rules: [
      'UI proposal: show only the relevant screens and interaction states. Mark simulated actions.',
      "Recreate the product's real look inside the replica from its code or screenshots, and keep the page around it on the artifact theme.",
    ],
  },
  {
    id: 'dashboard',
    name: 'Metrics dashboard',
    types: ['page'],
    audience: 'People who track the numbers and act on them.',
    purpose: 'Show metrics with their sources, units, and time range.',
    sections: [
      section('summary', 'Summary', 'The headline numbers and what they mean.'),
      section('metrics', 'Metrics', 'Charts and tables built from one dataset.'),
      section('sources', 'Sources and gaps', 'Sources, units, time range, baseline, and missing data.'),
    ],
    rules: [
      'Metrics dashboard: name sources, units, time range, baseline, and missing data.',
      'Derive charts, tables, labels, and selection details from one dataset.',
      'Never turn missing values into zero.',
    ],
  },
  {
    id: 'general',
    name: 'General',
    types: ['page', 'doc', 'design'],
    audience: 'Whoever the request names.',
    purpose: 'Anything that matches no other recipe.',
    sections: [],
    rules: ['Lead with the answer, then the detail.'],
  },
];

type Fields = Record<string, unknown>;

function isFields(value: unknown): value is Fields {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function invalid(message: string, field: string): ArtifactError {
  return new ArtifactError('artifact/invalid-guide', message, { field });
}

function text(value: unknown, field: string, max: number, allowEmpty = false): string {
  if (typeof value !== 'string' || value.length > max || (!allowEmpty && value.trim() === '')) {
    throw invalid(field + ' must be text of 1 to ' + String(max) + ' characters.', field);
  }
  return value.trim();
}

/**
 * Validate one recipe from a tool call or a saved guide file.
 * @param value the candidate.
 * @param field the field path for errors.
 * @returns the recipe.
 */
export function parseRecipe(value: unknown, field = 'recipe'): Recipe {
  if (!isFields(value)) throw invalid(field + ' must be an object.', field);
  const id = value.id;
  if (typeof id !== 'string' || !RECIPE_ID.test(id)) {
    throw invalid(field + '.id must be 2 to 40 lowercase letters, digits, or hyphens, starting with a letter.', field + '.id');
  }
  const types = value.types;
  const recipeTypes: readonly ArtifactType[] = ['page', 'doc', 'design'];
  if (!Array.isArray(types) || types.length === 0 || !types.every((type) => isArtifactType(type) && recipeTypes.includes(type))) {
    throw invalid(field + '.types must list one or more of page, doc, design; sheets do not use recipes.', field + '.types');
  }
  const rawSections = value.sections ?? [];
  if (!Array.isArray(rawSections) || rawSections.length > 20) throw invalid(field + '.sections must be a list of up to 20 sections.', field + '.sections');
  const keys = new Set<string>();
  const sections = rawSections.map((item: unknown, index): RecipeSection => {
    const at = field + '.sections[' + String(index) + ']';
    if (!isFields(item)) throw invalid(at + ' must be an object.', at);
    const key = item.key;
    if (typeof key !== 'string' || !SECTION_KEY.test(key) || keys.has(key)) {
      throw invalid(at + '.key must be a unique lowercase key such as "scope".', at + '.key');
    }
    keys.add(key);
    if (item.required !== undefined && typeof item.required !== 'boolean') throw invalid(at + '.required must be true or false.', at + '.required');
    return {
      key,
      title: text(item.title, at + '.title', 80),
      purpose: text(item.purpose ?? '', at + '.purpose', 400, true),
      required: item.required !== false,
    };
  });
  const rawRules = value.rules ?? [];
  if (!Array.isArray(rawRules) || rawRules.length > 20) throw invalid(field + '.rules must be a list of up to 20 rules.', field + '.rules');
  return {
    id,
    name: text(value.name, field + '.name', 80),
    types: [...new Set(types)],
    audience: text(value.audience ?? '', field + '.audience', 300, true),
    purpose: text(value.purpose, field + '.purpose', 400),
    sections,
    rules: rawRules.map((rule: unknown, index) => text(rule, field + '.rules[' + String(index) + ']', 400)),
  };
}
