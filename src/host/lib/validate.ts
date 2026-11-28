import { ARTIFACT_TYPES, EXPORT_FORMATS, SCOPES, TRANSFER_MODES } from '../../contract.js';
import type { ArtifactType, ExportFormat, Scope, DesignSelection, DesignSaveOptions, TransferMode } from '../../contract.js';
import { ArtifactError } from './errors.js';
import type { TextEdit } from './store.js';

/** A request body or tool argument object narrowed to named fields. */
export type Fields = Readonly<Record<string, unknown>>;

/**
 * Narrow an input to an object.
 * @param value the input.
 * @returns the fields.
 */
export function fieldsOf(value: unknown): Fields {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new ArtifactError('artifact/bad-request', 'The request body must be an object.');
  }
  return { ...value };
}

/**
 * A required non-empty string.
 * @param fields the input.
 * @param key the field.
 * @returns the string.
 */
export function requiredString(fields: Fields, key: string): string {
  const value = fields[key];
  if (typeof value !== 'string' || value === '') {
    throw new ArtifactError('artifact/bad-request', `"${key}" must be a non-empty string.`, { field: key });
  }
  return value;
}

/**
 * An optional string.
 * @param fields the input.
 * @param key the field.
 * @returns the string, or undefined.
 */
export function optionalString(fields: Fields, key: string): string | undefined {
  const value = fields[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'string') {
    throw new ArtifactError('artifact/bad-request', `"${key}" must be a string.`, { field: key });
  }
  return value;
}

/**
 * An optional non-negative integer.
 * @param fields the input.
 * @param key the field.
 * @returns the integer, or undefined.
 */
export function optionalInteger(fields: Fields, key: string): number | undefined {
  const value = fields[key];
  if (value === undefined || value === null) return undefined;
  if (typeof value !== 'number' || !Number.isInteger(value) || value < 0) {
    throw new ArtifactError('artifact/bad-request', `"${key}" must be a non-negative integer.`, { field: key });
  }
  return value;
}

/**
 * A required non-negative integer (a version is 1 or more; an offset starts at 0).
 * @param fields the input.
 * @param key the field.
 * @returns the integer.
 */
export function requiredInteger(fields: Fields, key: string): number {
  const value = optionalInteger(fields, key);
  if (value === undefined) {
    throw new ArtifactError('artifact/bad-request', `"${key}" is required.`, { field: key });
  }
  return value;
}

/**
 * Read an enumerated value.
 * @param fields the input.
 * @param key the field.
 * @param allowed the allowed values.
 * @param code the error code on a bad value.
 * @returns the value, or undefined when absent.
 */
function optionalEnum<T extends string>(fields: Fields, key: string, allowed: readonly T[], code: string): T | undefined {
  const value = fields[key];
  if (value === undefined || value === null) return undefined;
  const match = allowed.find((item) => item === value);
  if (match === undefined) {
    throw new ArtifactError(code, `"${key}" must be one of ${allowed.join(', ')}.`, { field: key });
  }
  return match;
}

export function optionalScope(fields: Fields): Scope | undefined {
  return optionalEnum(fields, 'scope', SCOPES, 'artifact/unknown-scope');
}

export function optionalType(fields: Fields): ArtifactType | undefined {
  return optionalEnum(fields, 'type', ARTIFACT_TYPES, 'artifact/bad-request');
}

export function requiredType(fields: Fields): ArtifactType {
  const type = optionalType(fields);
  if (type === undefined) throw new ArtifactError('artifact/bad-request', `"type" must be one of ${ARTIFACT_TYPES.join(', ')}.`);
  return type;
}

export function requiredTransferMode(fields: Fields): TransferMode {
  const mode = optionalEnum(fields, 'mode', TRANSFER_MODES, 'artifact/bad-request');
  if (mode === undefined) throw new ArtifactError('artifact/bad-request', '"mode" must be copy or move.');
  return mode;
}

export function requiredFormat(fields: Fields): ExportFormat {
  const format = optionalEnum(fields, 'format', EXPORT_FORMATS, 'artifact/unsupported-format');
  if (format === undefined) throw new ArtifactError('artifact/bad-request', '"format" is required.');
  return format;
}

/**
 * Optional replace-once edits.
 * @param fields the input.
 * @returns the edits, or undefined.
 */
export function optionalEdits(fields: Fields): TextEdit[] | undefined {
  const value = fields.edits;
  if (value === undefined || value === null) return undefined;
  if (!Array.isArray(value) || value.length === 0 || value.length > 50) {
    throw new ArtifactError('artifact/bad-request', '"edits" must be a list of 1 to 50 edits.');
  }
  return value.map((item, index) => {
    const edit = fieldsOf(item);
    const oldText = edit.oldText;
    const newText = edit.newText;
    if (typeof oldText !== 'string' || typeof newText !== 'string') {
      throw new ArtifactError('artifact/bad-request', `Edit ${index + 1} needs string oldText and newText.`);
    }
    return { oldText, newText };
  });
}

export function optionalBoolean(fields: Fields, key: string): boolean | undefined {
  const value = fields[key];
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') throw new ArtifactError('artifact/bad-request', key + ' must be a boolean.');
  return value;
}
export function designSelection(fields: Fields): DesignSelection {
  return { systemId: optionalString(fields, 'systemId'),
    systemScope: optionalEnum(fields, 'systemScope', SCOPES, 'artifact/unknown-scope'),
    revision: optionalInteger(fields, 'systemRevision') };
}
export function designSaveOptions(fields: Fields): DesignSaveOptions | undefined {
  const systemId = optionalString(fields, 'systemId');
  const expectedRevision = optionalInteger(fields, 'expectedRevision');
  const createNew = optionalBoolean(fields, 'createNew');
  const makeDefault = optionalBoolean(fields, 'makeDefault');
  if (systemId === undefined && expectedRevision === undefined && createNew === undefined && makeDefault === undefined) return undefined;
  if (expectedRevision === undefined) throw new ArtifactError('artifact/bad-request', 'Named system saves require expectedRevision from design_system_list.');
  return { systemId, expectedRevision, createNew, makeDefault };
}
