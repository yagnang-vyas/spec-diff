import type { NormalizedOperation, NormalizedResponse } from "../model.js";
import type { Emit, Loc } from "./context.js";
import { diffSchema } from "./schema.js";

export function diffResponses(
  base: NormalizedOperation,
  head: NormalizedOperation,
  loc: Loc,
  emit: Emit,
): void {
  const statuses = [...new Set([...base.responses.keys(), ...head.responses.keys()])].sort();
  for (const status of statuses) {
    const b = base.responses.get(status);
    const h = head.responses.get(status);
    if (b && !h) {
      emit(
        "RESP_STATUS_REMOVED",
        loc.removed("responses", b.key),
        { status: b.key },
        {
          // Only a documented success path is a hard contract; error responses are best-effort.
          severity: status.startsWith("2") ? "breaking" : "warning",
        },
      );
    } else if (!b && h) {
      emit("RESP_STATUS_ADDED", loc.added("responses", h.key), { status: h.key });
    } else if (b && h) {
      diffResponseContent(b, h, loc.descend(["responses", b.key], ["responses", h.key]), emit);
    }
  }
}

function diffResponseContent(
  base: NormalizedResponse,
  head: NormalizedResponse,
  loc: Loc,
  emit: Emit,
): void {
  const content = loc.child("content");
  for (const [mediaType, entry] of base.content) {
    if (!head.content.has(mediaType)) {
      const params = { mediaType: entry.key };
      emit("RESP_MEDIA_TYPE_REMOVED", content.removed(entry.key), params, { scope: head.key });
    }
  }
  for (const [mediaType, entry] of head.content) {
    const before = base.content.get(mediaType);
    if (!before) {
      const params = { mediaType: entry.key };
      emit("RESP_MEDIA_TYPE_ADDED", content.added(entry.key), params, { scope: head.key });
      continue;
    }
    const here = content.descend([before.key, "schema"], [entry.key, "schema"]);
    diffSchema(before.schema, entry.schema, here, emit, "response", `${head.key} ${entry.key}`);
  }
}
