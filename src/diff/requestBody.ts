import type { NormalizedBody } from "../model.js";
import type { Emit, Loc } from "./context.js";
import { diffSchema } from "./schema.js";

export function diffRequestBody(
  base: NormalizedBody | undefined,
  head: NormalizedBody | undefined,
  loc: Loc,
  emit: Emit,
): void {
  if (!base || !head) {
    if (head) {
      emit(head.required ? "REQ_BODY_BECAME_REQUIRED" : "REQ_BODY_ADDED", loc.added("requestBody"));
    } else if (base) {
      emit("REQ_BODY_REMOVED", loc.removed("requestBody"));
    }
    return;
  }

  const here = loc.child("requestBody");
  if (!base.required && head.required) emit("REQ_BODY_BECAME_REQUIRED", here.child("required"));
  if (base.required && !head.required) emit("REQ_BODY_BECAME_OPTIONAL", here.child("required"));

  const content = here.child("content");
  for (const [mediaType, entry] of base.content) {
    if (!head.content.has(mediaType)) {
      emit("REQ_MEDIA_TYPE_REMOVED", content.removed(entry.key), { mediaType: entry.key });
    }
  }
  for (const [mediaType, entry] of head.content) {
    const before = base.content.get(mediaType);
    if (!before) {
      emit("REQ_MEDIA_TYPE_ADDED", content.added(entry.key), { mediaType: entry.key });
      continue;
    }
    diffSchema(
      before.schema,
      entry.schema,
      content.descend([before.key, "schema"], [entry.key, "schema"]),
      emit,
      "request",
      `request body ${entry.key}`,
    );
  }
}
