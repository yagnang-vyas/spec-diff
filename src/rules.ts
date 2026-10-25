export type Severity = "breaking" | "warning" | "safe" | "info";

export const SEVERITY_ORDER: readonly Severity[] = ["breaking", "warning", "safe", "info"];

export interface RuleDef {
  severity: Severity;
  /** One-line description used in documentation. */
  summary: string;
  /** Message template; `{name}` placeholders are filled by `formatMessage`. */
  template: string;
}

/**
 * The rule registry. Every change SpecDiff reports has an ID from this table. Keep it in sync with
 * the rule table in SPEC.md (a test enforces this) and give every rule a fixture directory.
 */
export const RULES = {
  // Paths and operations
  PATH_REMOVED: {
    severity: "breaking",
    summary: "path removed",
    template: "path {path} removed",
  },
  PATH_ADDED: { severity: "safe", summary: "path added", template: "path {path} added" },
  PATH_PARAM_RENAMED: {
    severity: "info",
    summary: "path template renamed with the same shape",
    template: "path template renamed from {from} to {to} (same shape, treated as the same path)",
  },
  OP_REMOVED: {
    severity: "breaking",
    summary: "HTTP method removed from a path that still exists",
    template: "operation {method} {path} removed",
  },
  OP_ADDED: {
    severity: "safe",
    summary: "HTTP method added",
    template: "operation {method} {path} added",
  },
  OP_DEPRECATED: {
    severity: "warning",
    summary: "operation newly deprecated",
    template: "operation is now deprecated",
  },

  // Parameters
  PARAM_ADDED_REQUIRED: {
    severity: "breaking",
    summary: "new required parameter",
    template: 'required {in} parameter "{name}" added',
  },
  PARAM_ADDED_OPTIONAL: {
    severity: "safe",
    summary: "new optional parameter",
    template: 'optional {in} parameter "{name}" added',
  },
  PARAM_BECAME_REQUIRED: {
    severity: "breaking",
    summary: "parameter became required",
    template: '{in} parameter "{name}" is now required',
  },
  PARAM_BECAME_OPTIONAL: {
    severity: "safe",
    summary: "parameter became optional",
    template: '{in} parameter "{name}" is now optional',
  },
  PARAM_REMOVED: {
    severity: "warning",
    summary: "parameter removed",
    template: '{in} parameter "{name}" removed',
  },
  PARAM_LOCATION_CHANGED: {
    severity: "breaking",
    summary: "parameter moved to a different location",
    template: 'parameter "{name}" moved from {from} to {to}',
  },
  PARAM_SERIALIZATION_CHANGED: {
    severity: "breaking",
    summary: "effective style/explode changed",
    template: '{in} parameter "{name}" serialization changed from ({from}) to ({to})',
  },

  // Request bodies
  REQ_BODY_BECAME_REQUIRED: {
    severity: "breaking",
    summary: "request body became required, or a required body was added",
    template: "request body is now required",
  },
  REQ_BODY_BECAME_OPTIONAL: {
    severity: "safe",
    summary: "request body became optional",
    template: "request body is now optional",
  },
  REQ_BODY_ADDED: {
    severity: "safe",
    summary: "optional request body added",
    template: "optional request body added",
  },
  REQ_BODY_REMOVED: {
    severity: "warning",
    summary: "request body removed",
    template: "request body removed (servers may now reject or ignore it)",
  },
  REQ_MEDIA_TYPE_REMOVED: {
    severity: "breaking",
    summary: "request content type removed",
    template: 'request content type "{mediaType}" removed',
  },
  REQ_MEDIA_TYPE_ADDED: {
    severity: "safe",
    summary: "request content type added",
    template: 'request content type "{mediaType}" added',
  },

  // Request schemas (parameters and request bodies): stricter is breaking
  REQ_PROPERTY_REQUIRED_ADDED: {
    severity: "breaking",
    summary: "property became required, or a required property was added",
    template: "property {at} {what}",
  },
  REQ_PROPERTY_REQUIRED_REMOVED: {
    severity: "safe",
    summary: "property is no longer required",
    template: "property {at} is no longer required",
  },
  REQ_PROPERTY_ADDED: {
    severity: "safe",
    summary: "optional property added",
    template: "optional property {at} added",
  },
  REQ_PROPERTY_REMOVED: {
    severity: "warning",
    summary: "property removed",
    template: "property {at} removed (servers may now reject or ignore it)",
  },
  REQ_ENUM_NARROWED: {
    severity: "breaking",
    summary: "enum value removed, or enum added to a free value",
    template: "enum of {at} narrowed: {detail}",
  },
  REQ_ENUM_WIDENED: {
    severity: "safe",
    summary: "enum value added, or enum removed",
    template: "enum of {at} widened: {detail}",
  },
  REQ_CONSTRAINT_TIGHTENED: {
    severity: "breaking",
    summary: "constraint tightened, or an opaque constraint added or changed",
    template: "{constraint} of {at} {change}",
  },
  REQ_CONSTRAINT_LOOSENED: {
    severity: "safe",
    summary: "constraint loosened or removed",
    template: "{constraint} of {at} {change}",
  },
  REQ_ADDITIONAL_PROPERTIES_DISALLOWED: {
    severity: "breaking",
    summary: "additionalProperties changed to false",
    template: "additional properties of {at} are no longer allowed",
  },
  REQ_ADDITIONAL_PROPERTIES_ALLOWED: {
    severity: "safe",
    summary: "additionalProperties changed from false",
    template: "additional properties of {at} are now allowed",
  },
  REQ_BECAME_NON_NULLABLE: {
    severity: "breaking",
    summary: "value that could be null no longer can",
    template: "{at} no longer accepts null",
  },
  REQ_BECAME_NULLABLE: {
    severity: "safe",
    summary: "value that could not be null now can",
    template: "{at} now accepts null",
  },

  // Responses: looser or lossy is breaking
  RESP_STATUS_REMOVED: {
    severity: "breaking",
    summary: "documented status code removed (warning unless 2xx)",
    template: "response status {status} removed",
  },
  RESP_STATUS_ADDED: {
    severity: "safe",
    summary: "status code added",
    template: "response status {status} added",
  },
  RESP_MEDIA_TYPE_REMOVED: {
    severity: "breaking",
    summary: "response content type removed",
    template: 'response content type "{mediaType}" removed',
  },
  RESP_MEDIA_TYPE_ADDED: {
    severity: "safe",
    summary: "response content type added",
    template: 'response content type "{mediaType}" added',
  },
  RESP_PROPERTY_REMOVED: {
    severity: "breaking",
    summary: "property removed",
    template: "property {at} removed",
  },
  RESP_PROPERTY_ADDED: {
    severity: "safe",
    summary: "property added",
    template: "property {at} added",
  },
  RESP_PROPERTY_BECAME_OPTIONAL: {
    severity: "breaking",
    summary: "property removed from required",
    template: "property {at} is no longer always present (removed from required)",
  },
  RESP_PROPERTY_BECAME_REQUIRED: {
    severity: "safe",
    summary: "property added to required",
    template: "property {at} is now always present (added to required)",
  },
  RESP_BECAME_NULLABLE: {
    severity: "breaking",
    summary: "value can now be null",
    template: "{at} can now be null",
  },
  RESP_BECAME_NON_NULLABLE: {
    severity: "safe",
    summary: "value can no longer be null",
    template: "{at} can no longer be null",
  },
  RESP_ENUM_WIDENED: {
    severity: "warning",
    summary: "enum value added, or enum removed",
    template: "enum of {at} widened: {detail}",
  },
  RESP_ENUM_NARROWED: {
    severity: "safe",
    summary: "enum value removed, or enum added to a free value",
    template: "enum of {at} narrowed: {detail}",
  },
  RESP_CONSTRAINT_LOOSENED: {
    severity: "breaking",
    summary: "constraint loosened or removed (warning for opaque changes)",
    template: "{constraint} of {at} {change}",
  },
  RESP_CONSTRAINT_TIGHTENED: {
    severity: "safe",
    summary: "constraint tightened or added",
    template: "{constraint} of {at} {change}",
  },

  // Both directions
  TYPE_CHANGED: {
    severity: "breaking",
    summary: "type changed (safe when the change is compatible in this direction)",
    template: "type of {at} changed from {from} to {to}",
  },
  UNSUPPORTED_CONSTRUCT: {
    severity: "info",
    summary: "an unanalyzed keyword differs between versions",
    template: "{what} at {at} (not analyzed, review manually)",
  },

  // Security
  SECURITY_ADDED: {
    severity: "breaking",
    summary: "security requirement became stricter",
    template: "security requirement became stricter (was {from}, now {to})",
  },
  SECURITY_RELAXED: {
    severity: "safe",
    summary: "security requirement became less strict",
    template: "security requirement became less strict (was {from}, now {to})",
  },
} as const satisfies Record<string, RuleDef>;

export type RuleId = keyof typeof RULES;

export const RULE_IDS = Object.keys(RULES) as RuleId[];

export function isRuleId(value: string): value is RuleId {
  return Object.hasOwn(RULES, value);
}

export type MessageParams = Record<string, string | number>;

/** Fill a rule's message template. A missing parameter is a programming error and throws. */
export function formatMessage(id: RuleId, params: MessageParams = {}): string {
  return RULES[id].template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = params[name];
    if (value === undefined) throw new Error(`rule ${id}: missing message parameter "${name}"`);
    return String(value);
  });
}
