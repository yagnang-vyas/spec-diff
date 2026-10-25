import type { NormalizedSpec } from "../model.js";
import { Loc, createEmitter, type Change } from "./context.js";
import { diffPathOperations } from "./operations.js";

/** Match paths by template shape and diff everything under them. */
export function diffPaths(base: NormalizedSpec, head: NormalizedSpec, changes: Change[]): void {
  const keys = [...new Set([...base.paths.keys(), ...head.paths.keys()])].sort();
  for (const key of keys) {
    const b = base.paths.get(key);
    const h = head.paths.get(key);
    if (b && !h) {
      createEmitter(changes, b.template)("PATH_REMOVED", new Loc(["paths", b.template], null), {
        path: b.template,
      });
    } else if (h && !b) {
      createEmitter(changes, h.template)("PATH_ADDED", new Loc(null, ["paths", h.template]), {
        path: h.template,
      });
    } else if (b && h) {
      const loc = new Loc(["paths", b.template], ["paths", h.template]);
      if (b.template !== h.template) {
        createEmitter(changes, h.template)("PATH_PARAM_RENAMED", loc, {
          from: b.template,
          to: h.template,
        });
      }
      diffPathOperations(b, h, loc, changes);
    }
  }
}
