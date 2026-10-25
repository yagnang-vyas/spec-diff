import {
  SCALAR_CONSTRAINTS,
  UNSUPPORTED_KEYWORDS,
  canonicalJson,
  describeSchema,
  typeLabel,
  type Bound,
  type SchemaView,
} from "../normalize.js";
import type { Schema } from "../model.js";
import type { RuleId, Severity } from "../rules.js";
import type { Emit, Loc } from "./context.js";

export type Direction = "request" | "response";

/** Nesting beyond this is reported instead of followed; it only guards pathological composition. */
const MAX_DEPTH = 100;

/** `additionalProperties: true` and an absent keyword both accept anything. */
const ANY_SCHEMA: Schema = Object.freeze({});

interface State {
  emit: Emit;
  direction: Direction;
  scope: string;
  /** Pairs (base, head) currently being compared further up the stack. */
  active: Map<Schema, Set<Schema>>;
  /** Pairs already compared that produced no change; shared sub-schemas are compared once. */
  clean: Map<Schema, Set<Schema>>;
  /** Number of changes emitted so far. */
  emitted: number;
}

/**
 * Compare two schemas for one direction of data flow.
 * Request schemas break when they get stricter; response schemas break when they get looser or
 * lose data.
 */
export function diffSchema(
  base: Schema | undefined,
  head: Schema | undefined,
  loc: Loc,
  emit: Emit,
  direction: Direction,
  scope: string,
): void {
  const state: State = {
    emit: (...args) => {
      state.emitted += 1;
      emit(...args);
    },
    direction,
    scope,
    active: new Map(),
    clean: new Map(),
    emitted: 0,
  };
  compareSchemas(base ?? ANY_SCHEMA, head ?? ANY_SCHEMA, loc, [], state, 0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function display(path: string[]): string {
  if (path.length === 0) return "value";
  let text = "";
  for (const segment of path) {
    if (segment === "[]") text = `${text || "value"}[]`;
    else text = text ? `${text}.${segment}` : segment;
  }
  return `"${text}"`;
}

/** A property may be declared by several `allOf` members; compare them as one schema. */
function merged(list: Schema[]): Schema {
  return list.length === 1 && list[0] ? list[0] : { allOf: list };
}

function visibleProperties(view: SchemaView, direction: Direction): Map<string, Schema> {
  const hidden = direction === "request" ? "readOnly" : "writeOnly";
  const result = new Map<string, Schema>();
  for (const [name, list] of view.properties) {
    const schema = merged(list);
    if (!describeSchema(schema)[hidden]) result.set(name, schema);
  }
  return result;
}

function typesSubset(a: SchemaView, b: SchemaView): boolean {
  if (b.anyType) return true;
  if (a.anyType) return false;
  return [...a.types].every((t) => b.types.has(t) || (t === "integer" && b.types.has("number")));
}

function typesDisjoint(a: SchemaView, b: SchemaView): boolean {
  if (a.anyType || b.anyType) return false;
  const related = (t: string, other: Set<string>) =>
    other.has(t) ||
    (t === "integer" && other.has("number")) ||
    (t === "number" && other.has("integer"));
  return [...a.types].every((t) => !related(t, b.types));
}

function sameTypes(a: SchemaView, b: SchemaView): boolean {
  return (
    a.anyType === b.anyType &&
    a.types.size === b.types.size &&
    [...a.types].every((t) => b.types.has(t))
  );
}

// ---------------------------------------------------------------------------
// Recursive comparison
// ---------------------------------------------------------------------------

function compareSchemas(
  base: Schema,
  head: Schema,
  loc: Loc,
  path: string[],
  state: State,
  depth: number,
): void {
  const seen = state.active.get(base);
  // A pair already being compared higher up counts as equal for this branch.
  if (seen?.has(head) || state.clean.get(base)?.has(head)) return;
  if (depth > MAX_DEPTH) {
    state.emit(
      "UNSUPPORTED_CONSTRUCT",
      loc,
      {
        what: `nesting deeper than ${MAX_DEPTH} levels`,
        at: display(path),
      },
      { scope: state.scope },
    );
    return;
  }
  const set = seen ?? new Set<Schema>();
  set.add(head);
  state.active.set(base, set);
  const before = state.emitted;
  try {
    compareContents(base, head, loc, path, state, depth);
  } finally {
    set.delete(head);
  }
  if (state.emitted === before) {
    const clean = state.clean.get(base) ?? new Set<Schema>();
    clean.add(head);
    state.clean.set(base, clean);
  }
}

function compareContents(
  base: Schema,
  head: Schema,
  loc: Loc,
  path: string[],
  state: State,
  depth: number,
): void {
  const b = describeSchema(base);
  const h = describeSchema(head);
  const at = display(path);
  const emit = (id: RuleId, where: Loc, params: Record<string, string>, severity?: Severity) =>
    state.emit(id, where, { at, ...params }, { scope: state.scope, severity });

  compareTypes(b, h, loc, emit, state.direction);
  compareNullability(b, h, loc, emit, state.direction);
  compareUnsupported(b, h, loc, emit);
  if (typesDisjoint(b, h)) return;

  compareEnums(b, h, loc, emit, state.direction);
  compareConstraints(b, h, loc, emit, state.direction);

  if (b.types.has("object") && h.types.has("object")) {
    compareObjects(b, h, loc, path, state, depth, emit);
  }
  if (b.types.has("array") && h.types.has("array") && b.items.length > 0 && h.items.length > 0) {
    compareSchemas(
      merged(b.items),
      merged(h.items),
      loc.child("items"),
      [...path, "[]"],
      state,
      depth + 1,
    );
  }
}

type LocalEmit = (
  id: RuleId,
  where: Loc,
  params: Record<string, string>,
  severity?: Severity,
) => void;

// ---------------------------------------------------------------------------
// Types and nullability
// ---------------------------------------------------------------------------

function compareTypes(
  b: SchemaView,
  h: SchemaView,
  loc: Loc,
  emit: LocalEmit,
  direction: Direction,
): void {
  if (sameTypes(b, h)) return;
  // Request: safe when the new type accepts every old value. Response: safe when it produces a subset.
  const compatible = direction === "request" ? typesSubset(b, h) : typesSubset(h, b);
  emit(
    "TYPE_CHANGED",
    loc,
    { from: typeLabel(b), to: typeLabel(h) },
    compatible ? "safe" : "breaking",
  );
}

function compareNullability(
  b: SchemaView,
  h: SchemaView,
  loc: Loc,
  emit: LocalEmit,
  direction: Direction,
): void {
  // Untyped schemas accept null implicitly; their type change is reported by TYPE_CHANGED.
  if (b.anyType || h.anyType || b.nullable === h.nullable) return;
  if (direction === "request") {
    emit(h.nullable ? "REQ_BECAME_NULLABLE" : "REQ_BECAME_NON_NULLABLE", loc, {});
  } else {
    emit(h.nullable ? "RESP_BECAME_NULLABLE" : "RESP_BECAME_NON_NULLABLE", loc, {});
  }
}

// ---------------------------------------------------------------------------
// Enums
// ---------------------------------------------------------------------------

function listValues(values: Iterable<unknown>): string {
  return [...values]
    .map((v) => canonicalJson(v))
    .sort()
    .join(", ");
}

function compareEnums(
  b: SchemaView,
  h: SchemaView,
  loc: Loc,
  emit: LocalEmit,
  direction: Direction,
): void {
  const be = b.enumValues;
  const he = h.enumValues;
  if (!be && !he) return;
  const request = direction === "request";
  const narrowed = request ? "REQ_ENUM_NARROWED" : "RESP_ENUM_NARROWED";
  const widened = request ? "REQ_ENUM_WIDENED" : "RESP_ENUM_WIDENED";
  if (!be && he) {
    emit(narrowed, loc, { detail: `enum constraint added (${listValues(he.values())})` });
  } else if (be && !he) {
    emit(widened, loc, { detail: `enum constraint removed (was ${listValues(be.values())})` });
  } else if (be && he) {
    const removed = [...be].filter(([key]) => !he.has(key)).map(([, v]) => v);
    const added = [...he].filter(([key]) => !be.has(key)).map(([, v]) => v);
    if (removed.length > 0) emit(narrowed, loc, { detail: `removed ${listValues(removed)}` });
    if (added.length > 0) emit(widened, loc, { detail: `added ${listValues(added)}` });
  }
}

// ---------------------------------------------------------------------------
// Constraints
// ---------------------------------------------------------------------------

type Verdict = "tighter" | "looser" | "changed";

interface ConstraintChange {
  constraint: string;
  verdict: Verdict;
  text: string;
}

const MAX_KEYS = new Set(["maxLength", "maxItems", "maxProperties"]);
const MIN_KEYS = new Set(["minLength", "minItems", "minProperties"]);

function showBound(bound: Bound): string {
  return bound.exclusive ? `${bound.value} (exclusive)` : String(bound.value);
}

function describeChange(
  verdict: Verdict,
  from: string | undefined,
  to: string | undefined,
): string {
  if (from === undefined) return `added (${String(to)})`;
  if (to === undefined) return `removed (was ${from})`;
  const word = verdict === "tighter" ? "tightened" : verdict === "looser" ? "loosened" : "changed";
  return `${word} from ${from} to ${to}`;
}

function numericChange(
  constraint: string,
  from: number | undefined,
  to: number | undefined,
  upper: boolean,
  unsetValue: number,
): ConstraintChange | undefined {
  if (from === to) return undefined;
  const effectiveFrom = from ?? unsetValue;
  const effectiveTo = to ?? unsetValue;
  if (effectiveFrom === effectiveTo) return undefined;
  const tighter = upper ? effectiveTo < effectiveFrom : effectiveTo > effectiveFrom;
  const verdict = tighter ? "tighter" : "looser";
  return {
    constraint,
    verdict,
    text: describeChange(verdict, from?.toString(), to?.toString()),
  };
}

function boundChange(
  constraint: string,
  from: Bound | undefined,
  to: Bound | undefined,
  upper: boolean,
): ConstraintChange | undefined {
  if (!from && !to) return undefined;
  if (from && to && from.value === to.value && from.exclusive === to.exclusive) return undefined;
  let verdict: Verdict;
  if (!from) verdict = "tighter";
  else if (!to) verdict = "looser";
  else if (from.value !== to.value) {
    verdict = (upper ? to.value < from.value : to.value > from.value) ? "tighter" : "looser";
  } else {
    verdict = to.exclusive ? "tighter" : "looser";
  }
  return {
    constraint,
    verdict,
    text: describeChange(verdict, from && showBound(from), to && showBound(to)),
  };
}

function opaqueChange(
  constraint: string,
  from: unknown,
  to: unknown,
): ConstraintChange | undefined {
  if (from === undefined && to === undefined) return undefined;
  if (canonicalJson(from) === canonicalJson(to)) return undefined;
  const verdict: Verdict = from === undefined ? "tighter" : to === undefined ? "looser" : "changed";
  return {
    constraint,
    verdict,
    text: describeChange(
      verdict,
      from === undefined ? undefined : canonicalJson(from),
      to === undefined ? undefined : canonicalJson(to),
    ),
  };
}

function constraintChanges(b: SchemaView, h: SchemaView): ConstraintChange[] {
  const out: (ConstraintChange | undefined)[] = [];
  for (const key of SCALAR_CONSTRAINTS) {
    const from = b.constraints.get(key);
    const to = h.constraints.get(key);
    if (MAX_KEYS.has(key) || MIN_KEYS.has(key)) {
      out.push(
        numericChange(
          key,
          typeof from === "number" ? from : undefined,
          typeof to === "number" ? to : undefined,
          MAX_KEYS.has(key),
          MAX_KEYS.has(key) ? Infinity : 0,
        ),
      );
    } else if (key === "uniqueItems") {
      if ((from === true) !== (to === true)) {
        const verdict: Verdict = to === true ? "tighter" : "looser";
        out.push({
          constraint: key,
          verdict,
          text: describeChange(verdict, String(from === true), String(to === true)),
        });
      }
    } else {
      out.push(opaqueChange(key, from, to));
    }
  }
  out.push(
    boundChange("maximum", b.upper, h.upper, true),
    boundChange("minimum", b.lower, h.lower, false),
  );
  return out.filter((c): c is ConstraintChange => c !== undefined);
}

function compareConstraints(
  b: SchemaView,
  h: SchemaView,
  loc: Loc,
  emit: LocalEmit,
  direction: Direction,
): void {
  for (const { constraint, verdict, text } of constraintChanges(b, h)) {
    const params = { constraint, change: text };
    if (direction === "request") {
      if (verdict === "looser") emit("REQ_CONSTRAINT_LOOSENED", loc, params);
      else
        emit(
          "REQ_CONSTRAINT_TIGHTENED",
          loc,
          params,
          verdict === "changed" ? "warning" : undefined,
        );
    } else if (verdict === "tighter") {
      emit("RESP_CONSTRAINT_TIGHTENED", loc, params);
    } else {
      emit("RESP_CONSTRAINT_LOOSENED", loc, params, verdict === "changed" ? "warning" : undefined);
    }
  }
}

// ---------------------------------------------------------------------------
// Objects
// ---------------------------------------------------------------------------

/** Property names that matter in this direction, with hidden (readOnly/writeOnly) ones dropped. */
function relevantNames(
  b: SchemaView,
  h: SchemaView,
  bProps: Map<string, Schema>,
  hProps: Map<string, Schema>,
): string[] {
  // Properties that never travel in this direction are ignored, including their `required` entries.
  const hidden = (name: string, props: Map<string, Schema>, view: SchemaView) =>
    view.properties.has(name) && !props.has(name);
  return [...new Set([...bProps.keys(), ...hProps.keys(), ...b.required, ...h.required])]
    .filter((name) => !hidden(name, bProps, b) && !hidden(name, hProps, h))
    .sort();
}

function compareObjects(
  b: SchemaView,
  h: SchemaView,
  loc: Loc,
  path: string[],
  state: State,
  depth: number,
  emit: LocalEmit,
): void {
  const direction = state.direction;
  const bProps = visibleProperties(b, direction);
  const hProps = visibleProperties(h, direction);

  for (const name of relevantNames(b, h, bProps, hProps)) {
    const bs = bProps.get(name);
    const hs = hProps.get(name);
    const where = [...path, name];
    const at = display(where);
    if (bs && !hs) {
      const id = direction === "request" ? "REQ_PROPERTY_REMOVED" : "RESP_PROPERTY_REMOVED";
      emit(id, loc.removed("properties", name), { at });
    } else if (!bs && hs) {
      emitPropertyAdded(h.required.has(name), loc.added("properties", name), at, direction, emit);
    } else {
      if (bs && hs) {
        const here = loc.descend(["properties", name], ["properties", name]);
        compareSchemas(bs, hs, here, where, state, depth + 1);
      }
      const was = b.required.has(name);
      compareRequired(was, h.required.has(name), loc.child("required"), at, direction, emit);
    }
  }

  compareAdditionalProperties(b, h, loc, path, state, depth, emit);
}

function emitPropertyAdded(
  required: boolean,
  loc: Loc,
  at: string,
  direction: Direction,
  emit: LocalEmit,
): void {
  if (direction === "response") emit("RESP_PROPERTY_ADDED", loc, { at });
  else if (required) emit("REQ_PROPERTY_REQUIRED_ADDED", loc, { at, what: "added as required" });
  else emit("REQ_PROPERTY_ADDED", loc, { at });
}

function compareRequired(
  was: boolean,
  now: boolean,
  loc: Loc,
  at: string,
  direction: Direction,
  emit: LocalEmit,
): void {
  if (was === now) return;
  if (direction === "request") {
    if (now) emit("REQ_PROPERTY_REQUIRED_ADDED", loc, { at, what: "is now required" });
    else emit("REQ_PROPERTY_REQUIRED_REMOVED", loc, { at });
  } else {
    emit(now ? "RESP_PROPERTY_BECAME_REQUIRED" : "RESP_PROPERTY_BECAME_OPTIONAL", loc, { at });
  }
}

function additionalOf(view: SchemaView): false | Schema | undefined {
  if (view.additionalProperties === false) return false;
  if (Array.isArray(view.additionalProperties)) return merged(view.additionalProperties);
  return undefined; // true or absent: anything goes
}

function compareAdditionalProperties(
  b: SchemaView,
  h: SchemaView,
  loc: Loc,
  path: string[],
  state: State,
  depth: number,
  emit: LocalEmit,
): void {
  const from = additionalOf(b);
  const to = additionalOf(h);
  if (from === false && to === false) return;
  if (from === false || to === false) {
    if (state.direction === "request") {
      emit(
        to === false ? "REQ_ADDITIONAL_PROPERTIES_DISALLOWED" : "REQ_ADDITIONAL_PROPERTIES_ALLOWED",
        loc.child("additionalProperties"),
        {},
      );
    }
    return;
  }
  if (from === undefined && to === undefined) return;
  compareSchemas(
    from ?? ANY_SCHEMA,
    to ?? ANY_SCHEMA,
    loc.child("additionalProperties"),
    [...path, "*"],
    state,
    depth + 1,
  );
}

// ---------------------------------------------------------------------------
// Unsupported keywords
// ---------------------------------------------------------------------------

function compareUnsupported(b: SchemaView, h: SchemaView, loc: Loc, emit: LocalEmit): void {
  for (const keyword of UNSUPPORTED_KEYWORDS) {
    const from = b.unsupported.get(keyword);
    const to = h.unsupported.get(keyword);
    if (!from && !to) continue;
    if (from && to && canonicalJson(from) === canonicalJson(to)) continue;
    const where = !from ? loc.added(keyword) : !to ? loc.removed(keyword) : loc.child(keyword);
    emit("UNSUPPORTED_CONSTRUCT", where, { what: `"${keyword}" differs between versions` });
  }
}
