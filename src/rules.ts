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
