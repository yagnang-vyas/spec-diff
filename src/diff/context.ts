import { RULES, formatMessage, type MessageParams, type RuleId, type Severity } from "../rules.js";

/**
 * A JSON-pointer-like location in both documents. A side is `null` when the element does not
 * exist in that document (added or removed elements).
 */
export class Loc {
  constructor(
    readonly base: readonly string[] | null,
    readonly head: readonly string[] | null,
  ) {}

  /** Descend into the same key in both documents (or different keys, e.g. a renamed path). */
  child(baseKey: string, headKey: string = baseKey): Loc {
    return new Loc(this.base && [...this.base, baseKey], this.head && [...this.head, headKey]);
  }

  /** An element that exists only in the base document. */
  removed(...keys: string[]): Loc {
    return new Loc(this.base && [...this.base, ...keys], null);
  }

  /** An element that exists only in the head document. */
  added(...keys: string[]): Loc {
    return new Loc(null, this.head && [...this.head, ...keys]);
  }

  /** Descend by independent key sequences, e.g. a parameter that moved. */
  descend(baseKeys: readonly string[], headKeys: readonly string[]): Loc {
    return new Loc(
      this.base && [...this.base, ...baseKeys],
      this.head && [...this.head, ...headKeys],
    );
  }

  toJSON(): { base: string | null; head: string | null } {
    return { base: this.base?.join(".") ?? null, head: this.head?.join(".") ?? null };
  }
}

export interface Change {
  id: RuleId;
  severity: Severity;
  /** `METHOD /path` or just `/path` for path-level changes. */
  operation: string;
  location: { base: string | null; head: string | null };
  message: string;
}

export interface EmitOptions {
  /** Override the rule's default severity (documented per rule in SPEC.md). */
  severity?: Severity;
  /** Context prepended to the message, e.g. `200 application/json`. */
  scope?: string;
}

export type Emit = (id: RuleId, loc: Loc, params?: MessageParams, options?: EmitOptions) => void;

/** Create an emitter that appends changes for one operation (or path) label. */
export function createEmitter(changes: Change[], operation: string): Emit {
  return (id, loc, params, options) => {
    const text = formatMessage(id, params);
    changes.push({
      id,
      severity: options?.severity ?? RULES[id].severity,
      operation,
      location: loc.toJSON(),
      message: options?.scope ? `${options.scope}: ${text}` : text,
    });
  };
}
