import { describe, expect, it } from "vitest";
import { Loc, createEmitter, type Change } from "../../src/diff/context.js";
import { sortChanges } from "../../src/diff/index.js";
import { describeSecurity } from "../../src/diff/security.js";

function change(operation: string, id: Change["id"], head: string | null, message = "m"): Change {
  return {
    id,
    severity: "safe",
    operation,
    location: { base: null, head },
    message,
  };
}

describe("sortChanges", () => {
  it("orders by path, then method, then location, rule and message", () => {
    const sorted = sortChanges([
      change("POST /b", "OP_ADDED", "paths./b.post"),
      change("GET /b", "OP_ADDED", "paths./b.get"),
      change("DELETE /a", "OP_ADDED", "paths./a.delete"),
      change("/a", "PATH_ADDED", "paths./a"),
      change("GET /a", "OP_ADDED", "paths./a.get.z"),
      change("GET /a", "OP_ADDED", "paths./a.get.y", "b"),
      change("GET /a", "OP_ADDED", "paths./a.get.y", "a"),
      change("GET /a", "PATH_ADDED", "paths./a.get.y", "a"),
      change("TEAPOT /a", "OP_ADDED", "paths./a.teapot"),
    ]);
    expect(sorted.map((c) => `${c.operation} ${c.location.head} ${c.id} ${c.message}`)).toEqual([
      "/a paths./a PATH_ADDED m",
      "GET /a paths./a.get.y OP_ADDED a",
      "GET /a paths./a.get.y OP_ADDED b",
      "GET /a paths./a.get.y PATH_ADDED a",
      "GET /a paths./a.get.z OP_ADDED m",
      "DELETE /a paths./a.delete OP_ADDED m",
      "TEAPOT /a paths./a.teapot OP_ADDED m",
      "GET /b paths./b.get OP_ADDED m",
      "POST /b paths./b.post OP_ADDED m",
    ]);
  });

  it("falls back to the base location and breaks ties on it", () => {
    const a = { ...change("GET /a", "OP_REMOVED", null), location: { base: "x", head: null } };
    const b = { ...change("GET /a", "OP_REMOVED", null), location: { base: "y", head: null } };
    expect(sortChanges([b, a])).toEqual([a, b]);
    const c = { ...a, location: { base: "q", head: "same" } };
    const d = { ...a, location: { base: "p", head: "same" } };
    expect(sortChanges([c, d])).toEqual([d, c]);
  });
});

describe("Loc and emitter", () => {
  it("tracks both documents independently", () => {
    const root = new Loc(["paths", "/a/{id}"], ["paths", "/a/{userId}"]);
    expect(root.child("get").toJSON()).toEqual({
      base: "paths./a/{id}.get",
      head: "paths./a/{userId}.get",
    });
    expect(root.child("x", "y").toJSON()).toEqual({
      base: "paths./a/{id}.x",
      head: "paths./a/{userId}.y",
    });
    expect(root.removed("a", "b").toJSON()).toEqual({ base: "paths./a/{id}.a.b", head: null });
    expect(root.added("a").toJSON()).toEqual({ base: null, head: "paths./a/{userId}.a" });
    expect(root.removed("a").child("z").toJSON()).toEqual({
      base: "paths./a/{id}.a.z",
      head: null,
    });
    expect(root.added("a").child("z").removed("q").toJSON()).toEqual({ base: null, head: null });
    expect(root.descend(["p"], ["q", "r"]).toJSON()).toEqual({
      base: "paths./a/{id}.p",
      head: "paths./a/{userId}.q.r",
    });
  });

  it("applies severity and scope overrides", () => {
    const changes: Change[] = [];
    const emit = createEmitter(changes, "GET /a");
    emit(
      "PATH_ADDED",
      new Loc(null, ["paths", "/a"]),
      { path: "/a" },
      { severity: "warning", scope: "200" },
    );
    expect(changes).toEqual([
      {
        id: "PATH_ADDED",
        severity: "warning",
        operation: "GET /a",
        location: { base: null, head: "paths./a" },
        message: "200: path /a added",
      },
    ]);
  });
});

describe("describeSecurity", () => {
  it("renders alternatives", () => {
    expect(describeSecurity([])).toBe("none");
    expect(
      describeSecurity([
        new Map(),
        new Map([
          ["a", []],
          ["b", ["x", "y"]],
        ]),
      ]),
    ).toBe("anonymous | a + b[x,y]");
  });
});
