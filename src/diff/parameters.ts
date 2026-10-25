import type { NormalizedOperation, NormalizedParameter } from "../model.js";
import type { Emit, Loc } from "./context.js";

/** Parameters are addressed by `parameters.<in>.<name>` rather than by array index. */
function where(param: NormalizedParameter): string[] {
  return ["parameters", param.in, param.name];
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
  for (const gone of [...removed]) {
    const moved = added.find(
      (p) => p.name.toLowerCase() === gone.name.toLowerCase() && p.in !== gone.in,
    );
    if (!moved) continue;
    removed.splice(removed.indexOf(gone), 1);
    added.splice(added.indexOf(moved), 1);
    emit("PARAM_LOCATION_CHANGED", loc.descend(where(gone), where(moved)), {
      name: gone.name,
      from: gone.in,
      to: moved.in,
    });
  }

  for (const param of removed) {
    emit("PARAM_REMOVED", loc.removed(...where(param)), { in: param.in, name: param.name });
  }
  for (const param of added) {
    emit(
      param.required ? "PARAM_ADDED_REQUIRED" : "PARAM_ADDED_OPTIONAL",
      loc.added(...where(param)),
      { in: param.in, name: param.name },
    );
  }

  for (const [key, b] of base.parameters) {
    const h = head.parameters.get(key);
    if (!h) continue;
    const here = loc.descend(where(b), where(h));
    const names = { in: h.in, name: h.name };
    if (!b.required && h.required) emit("PARAM_BECAME_REQUIRED", here, names);
    if (b.required && !h.required) emit("PARAM_BECAME_OPTIONAL", here, names);
    if (b.serialization !== h.serialization) {
      emit("PARAM_SERIALIZATION_CHANGED", here, {
        ...names,
        from: b.serialization,
        to: h.serialization,
      });
    }
  }
}
