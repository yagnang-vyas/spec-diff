// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { EXAMPLES } from "../src/examples";

const page = readFileSync(join(import.meta.dirname, "..", "playground", "index.html"), "utf8");
const body = /<body>([\s\S]*)<\/body>/.exec(page)![1]!.replace(/<script[\s\S]*?<\/script>/g, "");

const $ = <T extends HTMLElement>(selector: string) => document.querySelector(selector) as T;
const $$ = (selector: string) => [...document.querySelectorAll<HTMLElement>(selector)];

async function settle() {
  await vi.waitFor(() => {
    expect($<HTMLButtonElement>("#compare").disabled).toBe(false);
  });
}

async function compare() {
  $("#compare").click();
  await settle();
}

function type(id: string, value: string) {
  const area = $<HTMLTextAreaElement>(`#${id}`);
  area.value = value;
  area.dispatchEvent(new Event("input", { bubbles: true }));
}

beforeEach(async () => {
  document.body.innerHTML = body;
  const { mountPlayground } = await import("../src/playground");
  mountPlayground();
  await settle();
});

describe("playground", () => {
  it("loads the default example and shows real results on open", () => {
    expect($<HTMLTextAreaElement>("#before").value).toBe(EXAMPLES[0]!.before);
    expect($<HTMLTextAreaElement>("#after").value).toBe(EXAMPLES[0]!.after);
    expect($(".status").textContent).toContain("the CLI would exit 1");
    const counts = Object.fromEntries(
      $$(".chip").map((c) => [c.dataset.severity, c.querySelector("b")!.textContent]),
    );
    expect(counts).toEqual({ breaking: "10", warning: "1", safe: "2", info: "0" });
    expect($$(".item")).toHaveLength(13);
  });

  it("labels both editors and gives every action a working control", () => {
    expect($("label[for=before]").textContent).toContain("Before");
    expect($("label[for=after]").textContent).toContain("After");
    for (const id of ["compare", "reset", "load-example", "clear-before", "clear-after"]) {
      expect($(`#${id}`)).toBeTruthy();
    }
  });

  it("selects a change and shows its before and after values", () => {
    const removed = $$(".item").find((i) => i.dataset.id === "OP_REMOVED")!;
    removed.click();
    expect($(".detail h3").textContent).toBe("operation DELETE /orders/{orderId} removed");
    expect($$(".pane")[0]!.textContent).toContain("deleteOrder");
    expect($$(".pane")[1]!.textContent).toContain("Not present in this version.");
    expect($(".item[aria-current=true]")).toBe(
      $$(".item").find((i) => i.dataset.id === "OP_REMOVED"),
    );
  });

  it("navigates with Previous and Next", () => {
    expect($(".detail .count").textContent).toBe("1 of 13");
    expect($<HTMLButtonElement>("#prev-change").disabled).toBe(true);
    $("#next-change").click();
    expect($(".detail .count").textContent).toBe("2 of 13");
    $("#prev-change").click();
    expect($(".detail .count").textContent).toBe("1 of 13");
  });

  it("moves selection with the arrow keys", () => {
    $$(".item")[0]!.dispatchEvent(
      new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }),
    );
    expect($(".detail .count").textContent).toBe("2 of 13");
  });

  it("filters by severity", () => {
    $('.chip[data-severity="breaking"]').click();
    expect($('.chip[data-severity="breaking"]').getAttribute("aria-pressed")).toBe("false");
    expect($$(".item")).toHaveLength(3);
    expect($$(".item").every((i) => i.dataset.id !== "OP_REMOVED")).toBe(true);
  });

  it("recomputes the gate from the fail-on and ignore options", () => {
    const failOn = $<HTMLSelectElement>("#fail-on");
    failOn.value = "never";
    failOn.dispatchEvent(new Event("change"));
    expect($(".status").textContent).toContain("Passes the gate");

    failOn.value = "breaking";
    failOn.dispatchEvent(new Event("change"));
    const ignore = $<HTMLInputElement>("#ignore");
    ignore.value =
      "PARAM_BECAME_REQUIRED, REQ_PROPERTY_REQUIRED_ADDED, REQ_CONSTRAINT_TIGHTENED, RESP_PROPERTY_REMOVED, TYPE_CHANGED, OP_REMOVED";
    ignore.dispatchEvent(new Event("change"));
    expect($(".status").textContent).toContain("Passes the gate");
    expect($(".chip[data-severity=breaking] b").textContent).toBe("0");

    failOn.value = "warning";
    failOn.dispatchEvent(new Event("change"));
    expect($(".status").textContent).toContain("Fails the gate");
  });

  it("rejects unknown ignore rule IDs without losing results", () => {
    const ignore = $<HTMLInputElement>("#ignore");
    ignore.value = "NOPE";
    ignore.dispatchEvent(new Event("change"));
    expect($("#alert").hidden).toBe(false);
    expect($("#alert").textContent).toContain("unknown rule ID");
    expect($$(".item")).toHaveLength(13);
  });

  it("shows the CLI reports and their text", () => {
    $("#tab-text").click();
    expect($(".report").textContent).toContain(
      "Summary: 10 breaking, 1 warning, 0 info (2 safe hidden",
    );
    $("#tab-json").click();
    const json = JSON.parse($(".report").textContent!) as { summary: { breaking: number } };
    expect(json.summary.breaking).toBe(10);
    $("#tab-markdown").click();
    expect($(".report").textContent).toContain("## SpecDiff report");
  });

  it("shows the no-differences state for equivalent documents", async () => {
    $<HTMLSelectElement>("#example-select").value = "nullable";
    $("#load-example").click();
    await compare();
    expect($(".status").textContent).toContain("No API changes detected");
    expect($(".empty").textContent).toContain("No API changes detected");
  });

  it("treats identical inputs as unchanged", async () => {
    type("after", $<HTMLTextAreaElement>("#before").value);
    await compare();
    expect($(".empty")).toBeTruthy();
    expect($$(".item")).toHaveLength(0);
  });

  it("flags empty input, keeps the text, and recovers", async () => {
    type("before", "");
    const afterText = $<HTMLTextAreaElement>("#after").value;
    await compare();
    expect($("#alert").hidden).toBe(false);
    expect($("#alert").textContent).toContain("Before: the specification is empty");
    expect($("#editor-before").classList.contains("invalid")).toBe(true);
    expect($("#before").getAttribute("aria-invalid")).toBe("true");
    expect($("#results").children).toHaveLength(0);
    expect($<HTMLTextAreaElement>("#after").value).toBe(afterText);

    $("#reset").click();
    await compare();
    expect($("#alert").hidden).toBe(true);
    expect($$(".item")).toHaveLength(13);
  });

  it("reports malformed and unsupported input without discarding it", async () => {
    type("before", "openapi: 3.0.3\n  bad: [unclosed");
    type("after", 'swagger: "2.0"\ninfo: {title: t, version: "1"}\npaths: {}\n');
    await compare();
    const text = $("#alert").textContent!;
    expect(text).toContain("Before: not valid YAML or JSON");
    expect(text).toContain("After: unsupported specification");
    expect($<HTMLTextAreaElement>("#before").value).toContain("unclosed");
  });

  it("marks results stale after an edit", async () => {
    expect($("#stale").hidden).toBe(true);
    type("after", $<HTMLTextAreaElement>("#after").value + "\n# edit\n");
    expect($("#stale").hidden).toBe(false);
    await compare();
    expect($("#stale").hidden).toBe(true);
  });

  it("loads each example and reset restores the default state", async () => {
    for (const ex of EXAMPLES) {
      $<HTMLSelectElement>("#example-select").value = ex.id;
      $("#load-example").click();
      expect($<HTMLTextAreaElement>("#before").value).toBe(ex.before);
      expect($<HTMLTextAreaElement>("#after").value).toBe(ex.after);
    }
    $<HTMLInputElement>("#ignore").value = "OP_REMOVED";
    $("#reset").click();
    expect($<HTMLTextAreaElement>("#before").value).toBe(EXAMPLES[0]!.before);
    expect($<HTMLSelectElement>("#fail-on").value).toBe("breaking");
    expect($<HTMLInputElement>("#ignore").value).toBe("");
    expect($("#results").children).toHaveLength(0);
  });

  it("compares the bookstore example", async () => {
    $<HTMLSelectElement>("#example-select").value = "bookstore";
    $("#load-example").click();
    await compare();
    expect($(".status").textContent).toContain("Fails the gate");
    expect($$(".item").length).toBeGreaterThan(60);
  });

  it("renders user text as text, never as markup", async () => {
    const hostile = (title: string) =>
      `openapi: 3.0.3\ninfo: {title: "${title}", version: "1"}\npaths: {}\n`;
    type("before", hostile("<img src=x onerror=alert(1)>"));
    type("after", hostile("<b>two</b>"));
    await compare();
    expect($("#results img")).toBeNull();
    expect($("#results b:not(.chip b)")).toBeNull();
    expect($(".status").textContent).toContain("<img src=x onerror=alert(1)>");
  });
});
