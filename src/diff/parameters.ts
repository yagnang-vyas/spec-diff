import type { NormalizedOperation, NormalizedParameter } from "../model.js";
import type { Emit, Loc } from "./context.js";
import { diffSchema } from "./schema.js";

/** Parameters are addressed by `parameters.<in>.<name>` rather than by array index. */
function where(param: NormalizedParameter): string[] {
  return ["parameters", param.in, param.name];
}

/** Pair up removed and added parameters that share a name but not a location. */
function extractMoves(
  removed: NormalizedParameter[],
  added: NormalizedParameter[],
): [NormalizedParameter, NormalizedParameter][] {
  const moves: [NormalizedParameter, NormalizedParameter][] = [];
  for (const gone of [...removed]) {
    const moved = added.find(
      (p) => p.name.toLowerCase() === gone.name.toLowerCase() && p.in !== gone.in,
    );
    if (!moved) continue;
    removed.splice(removed.indexOf(gone), 1);
    added.splice(added.indexOf(moved), 1);
    moves.push([gone, moved]);
  }
  return moves;
}

export function diffParameters(
  base: NormalizedOperation,
  head: NormalizedOperation,
  loc: Loc,
  emit: Emit,
): void {
  const removed = [...base.parameters.values()].filter((p) => !head.parameters.has(p.key));
  const added = [...head.parameters.values()].filter((p) => !base.parameters.has(p.key));

  // The same name under a different `in` is a move, not a removal plus an addition.
  for (const [from, to] of extractMoves(removed, added)) {
    const params = { name: from.name, from: from.in, to: to.in };
    emit("PARAM_LOCATION_CHANGED", loc.descend(where(from), where(to)), params);
  }
  for (const param of removed) {
    emit("PARAM_REMOVED", loc.removed(...where(param)), { in: param.in, name: param.name });
  }
  for (const param of added) {
    const id = param.required ? "PARAM_ADDED_REQUIRED" : "PARAM_ADDED_OPTIONAL";
    emit(id, loc.added(...where(param)), { in: param.in, name: param.name });
  }

  for (const [key, b] of base.parameters) {
    const h = head.parameters.get(key);
    if (h) diffSharedParameter(b, h, loc, emit);
  }
}

function diffSharedParameter(
  base: NormalizedParameter,
  head: NormalizedParameter,
  loc: Loc,
  emit: Emit,
): void {
  const here = loc.descend(where(base), where(head));
  const names = { in: head.in, name: head.name };
  if (!base.required && head.required) emit("PARAM_BECAME_REQUIRED", here, names);
  if (base.required && !head.required) emit("PARAM_BECAME_OPTIONAL", here, names);
  if (base.serialization !== head.serialization) {
    const params = { ...names, from: base.serialization, to: head.serialization };
    emit("PARAM_SERIALIZATION_CHANGED", here, params);
  }
  diffSchema(
    base.schema,
    head.schema,
    loc.descend([...where(base), ...base.schemaPath], [...where(head), ...head.schemaPath]),
    emit,
    "request",
    `${head.in} parameter "${head.name}"`,
  );
}
