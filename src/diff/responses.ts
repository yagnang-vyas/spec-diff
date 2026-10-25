import type { NormalizedOperation } from "../model.js";
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
      continue;
    }
    if (!b && h) {
      emit("RESP_STATUS_ADDED", loc.added("responses", h.key), { status: h.key });
      continue;
    }
    if (!b || !h) continue;

    const here = loc.descend(["responses", b.key], ["responses", h.key]);
    const content = here.child("content");
    for (const [mediaType, entry] of b.content) {
      if (!h.content.has(mediaType)) {
        emit(
          "RESP_MEDIA_TYPE_REMOVED",
          content.removed(entry.key),
          { mediaType: entry.key },
          { scope: h.key },
        );
      }
    }
    for (const [mediaType, entry] of h.content) {
      const before = b.content.get(mediaType);
      if (!before) {
        emit(
          "RESP_MEDIA_TYPE_ADDED",
          content.added(entry.key),
          { mediaType: entry.key },
          { scope: h.key },
        );
        continue;
      }
      diffSchema(
        before.schema,
        entry.schema,
        content.descend([before.key, "schema"], [entry.key, "schema"]),
        emit,
        "response",
        `${h.key} ${entry.key}`,
      );
    }
  }
}
