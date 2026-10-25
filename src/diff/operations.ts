import { HTTP_METHODS, type NormalizedOperation, type NormalizedPath } from "../model.js";
import { Loc, createEmitter, type Change, type Emit } from "./context.js";
import { diffParameters } from "./parameters.js";
import { diffRequestBody } from "./requestBody.js";
import { diffResponses } from "./responses.js";
import { diffSecurity } from "./security.js";

/** Diff the operations of one path that exists in both documents. */
export function diffPathOperations(
  base: NormalizedPath,
  head: NormalizedPath,
  pathLoc: Loc,
  changes: Change[],
): void {
  for (const method of HTTP_METHODS) {
    const b = base.operations.get(method);
    const h = head.operations.get(method);
    const label = `${method.toUpperCase()} ${head.template}`;
    const params = { method: method.toUpperCase(), path: head.template };
    if (b && !h) {
      createEmitter(changes, label)("OP_REMOVED", pathLoc.removed(method), params);
    } else if (h && !b) {
      createEmitter(changes, label)("OP_ADDED", pathLoc.added(method), params);
    } else if (b && h) {
      diffOperation(b, h, pathLoc.child(method), createEmitter(changes, label));
    }
  }
}

function diffOperation(
  base: NormalizedOperation,
  head: NormalizedOperation,
  loc: Loc,
  emit: Emit,
): void {
  if (!base.deprecated && head.deprecated) emit("OP_DEPRECATED", loc.child("deprecated"));
  diffParameters(base, head, loc, emit);
  diffRequestBody(base.requestBody, head.requestBody, loc, emit);
  diffResponses(base, head, loc, emit);
  diffSecurity(base, head, loc, emit);
}
