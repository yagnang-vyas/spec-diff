import type { Change } from "../../src/diff/context";
import { RULES, SEVERITY_ORDER, type Severity } from "../../src/rules";
import {
  buildView,
  compareTexts,
  InputErrors,
  MAX_INPUT_BYTES,
  SIDE_LABEL,
  type Comparison,
  type FailOn,
  type Side,
  type View,
} from "./engine";
import { DEFAULT_EXAMPLE, EXAMPLES, type Example } from "./examples";
import { excerpt, locate } from "./locate";

type ReportTab = "text" | "markdown" | "json";
type TabId = "changes" | ReportTab;

function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props: Record<string, string> = {},
  ...children: (Node | string)[]
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) node.setAttribute(key, value);
  node.append(...children);
  return node;
}

function byId<T extends HTMLElement>(id: string): T {
  const node = document.getElementById(id);
  if (!node) throw new Error(`missing #${id}`);
  return node as T;
}

function formatBytes(text: string): string {
  const bytes = new TextEncoder().encode(text).length;
  return bytes < 1024 ? `${bytes} B` : `${(bytes / 1024).toFixed(1)} KB`;
}

function plural(count: number, noun: string): string {
  return `${count} ${noun}${count === 1 ? "" : "s"}`;
}

export function mountPlayground(): void {
  const before = byId<HTMLTextAreaElement>("before");
  const after = byId<HTMLTextAreaElement>("after");
  const select = byId<HTMLSelectElement>("example-select");
  const failOn = byId<HTMLSelectElement>("fail-on");
  const ignore = byId<HTMLInputElement>("ignore");
  const results = byId("results");
  const alertBox = byId("alert");
  const stale = byId("stale");
  const compareButton = byId<HTMLButtonElement>("compare");

  let example: Example = DEFAULT_EXAMPLE;
  let comparison: Comparison | undefined;
  let view: View | undefined;
  let selected: Change | undefined;
  let tab: TabId = "changes";
  let includeSafeInReport = false;
  const hiddenSeverities = new Set<Severity>();

  for (const ex of EXAMPLES) select.append(h("option", { value: ex.id }, ex.title));

  const sides = (): Record<Side, HTMLTextAreaElement> => ({ before, after });

  function updateCounts(): void {
    for (const side of ["before", "after"] as const) {
      const text = sides()[side].value;
      byId(`${side}-info`).textContent = text === "" ? "empty" : formatBytes(text);
    }
  }

  function clearProblems(): void {
    for (const side of ["before", "after"] as const) {
      byId(`editor-${side}`).classList.remove("invalid");
      sides()[side].removeAttribute("aria-invalid");
      byId(`${side}-problem`).textContent = "";
    }
    alertBox.hidden = true;
    alertBox.replaceChildren();
  }

  function showAlert(title: string, lines: string[]): void {
    alertBox.className = "alert";
    alertBox.replaceChildren(h("h2", {}, title), h("ul", {}, ...lines.map((l) => h("li", {}, l))));
    alertBox.hidden = false;
  }

  function loadExample(ex: Example): void {
    example = ex;
    select.value = ex.id;
    before.value = ex.before;
    after.value = ex.after;
    byId("example-description").textContent = ex.description.replaceAll("`", "");
    clearProblems();
    updateCounts();
  }

  function resetAll(): void {
    loadExample(DEFAULT_EXAMPLE);
    failOn.value = "breaking";
    ignore.value = "";
    includeSafeInReport = false;
    hiddenSeverities.clear();
    tab = "changes";
    comparison = undefined;
    view = undefined;
    selected = undefined;
    stale.hidden = true;
    results.replaceChildren();
  }

  function visible(): Change[] {
    return view ? view.changes.filter((c) => !hiddenSeverities.has(c.severity)) : [];
  }

  function rebuildView(): boolean {
    if (!comparison) return false;
    try {
      view = buildView(comparison, {
        includeSafe: includeSafeInReport,
        failOn: failOn.value as FailOn,
        ignore: ignore.value,
      });
    } catch (error) {
      showAlert("Cannot apply options", [error instanceof Error ? error.message : String(error)]);
      return false;
    }
    alertBox.hidden = true;
    if (selected && !view.changes.includes(selected)) selected = undefined;
    return true;
  }

  async function runCompare(scroll: boolean): Promise<void> {
    clearProblems();
    compareButton.disabled = true;
    compareButton.textContent = "Comparing…";
    // Yield so the button state paints before the synchronous parse/diff work.
    await new Promise((resolve) => setTimeout(resolve, 0));
    try {
      comparison = await compareTexts(before.value, after.value);
      selected = undefined;
      stale.hidden = true;
      if (rebuildView()) {
        selected = visible()[0];
        render();
        if (scroll) results.scrollIntoView?.({ block: "nearest" });
      }
    } catch (error) {
      comparison = undefined;
      view = undefined;
      results.replaceChildren();
      if (error instanceof InputErrors) {
        for (const p of error.problems) {
          byId(`editor-${p.side}`).classList.add("invalid");
          sides()[p.side].setAttribute("aria-invalid", "true");
          byId(`${p.side}-problem`).textContent = "Needs attention";
        }
        showAlert(
          "Nothing was compared. Your input is unchanged.",
          error.problems.map((p) => `${SIDE_LABEL[p.side]}: ${p.message}`),
        );
      } else {
        showAlert("Unexpected error. Your input is unchanged.", [
          error instanceof Error ? error.message : String(error),
        ]);
      }
    } finally {
      compareButton.disabled = false;
      compareButton.textContent = "Compare";
    }
  }

  function renderStatus(v: View): HTMLElement {
    const fail = v.exitCode === 1;
    const { summary } = v;
    const title = fail
      ? "Fails the gate: the CLI would exit 1"
      : summary.total === 0
        ? "No API changes detected: the CLI would exit 0"
        : "Passes the gate: the CLI would exit 0";
    const threshold =
      failOn.value === "never" ? "--fail-on never never fails" : `--fail-on ${failOn.value}`;
    return h(
      "div",
      { class: `status ${fail ? "fail" : "pass"}` },
      h("h2", {}, title),
      h(
        "p",
        {},
        `${plural(summary.total, "change")} (${threshold}). Compared ${v.report.base.title} ${v.report.base.version} with ${v.report.head.title} ${v.report.head.version}.`,
      ),
    );
  }

  function renderChips(v: View): HTMLElement {
    const box = h("div", { class: "chips", role: "group", "aria-label": "Filter by severity" });
    for (const severity of SEVERITY_ORDER) {
      const chip = h(
        "button",
        {
          type: "button",
          class: "chip",
          "data-severity": severity,
          "aria-pressed": String(!hiddenSeverities.has(severity)),
        },
        h("span", { class: `dot ${severity}` }),
        severity,
        h("b", {}, String(v.summary[severity])),
      );
      chip.addEventListener("click", () => {
        if (hiddenSeverities.has(severity)) hiddenSeverities.delete(severity);
        else hiddenSeverities.add(severity);
        if (selected && hiddenSeverities.has(selected.severity)) selected = visible()[0];
        render();
        byId("results").querySelector<HTMLElement>(`[data-severity="${severity}"]`)?.focus();
      });
      box.append(chip);
    }
    return box;
  }

  function renderList(items: Change[]): HTMLElement {
    const list = h("div", { class: "list", id: "change-list" });
    let operation: string | undefined;
    let ul: HTMLUListElement | undefined;
    for (const change of items) {
      if (change.operation !== operation) {
        operation = change.operation;
        list.append(h("h3", {}, operation));
        ul = h("ul");
        list.append(ul);
      }
      const button = h(
        "button",
        { type: "button", class: "item", "data-id": change.id },
        h("span", { class: `sev sev-${change.severity}` }, change.severity),
        h("span", { class: "rule" }, change.id),
        h("span", { class: "msg" }, change.message),
      );
      if (change === selected) button.setAttribute("aria-current", "true");
      button.addEventListener("click", () => select_(change));
      button.addEventListener("keydown", (event) => {
        const delta = event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
        if (delta === 0) return;
        event.preventDefault();
        const next = items[items.indexOf(change) + delta];
        if (next) select_(next, true);
      });
      ul?.append(h("li", {}, button));
    }
    return list;
  }

  function select_(change: Change, focus = false): void {
    selected = change;
    render();
    if (focus) {
      byId("change-list").querySelector<HTMLElement>('[aria-current="true"]')?.focus();
    }
  }

  function pane(kind: "removed" | "added", title: string, location: string | null, doc: unknown) {
    const located = locate(doc, location);
    const box = h("div", { class: `pane ${kind}` }, h("h4", {}, h("span", {}, title)));
    if (location === null) {
      box.append(h("p", { class: "absent" }, "Not present in this version."));
    } else if (located.found) {
      box.append(h("pre", {}, excerpt(located.value)));
    } else {
      box.append(
        h("p", { class: "absent" }, "This location is not a single value in the document."),
      );
    }
    return box;
  }

  function renderDetail(items: Change[]): HTMLElement {
    const detail = h("div", { class: "detail", id: "change-detail" });
    if (!selected || !comparison) {
      detail.append(h("p", { class: "meta" }, "Select a change to see its details."));
      return detail;
    }
    const change = selected;
    const index = items.indexOf(change);
    const prev = h("button", { type: "button", class: "btn small", id: "prev-change" }, "Previous");
    const next = h("button", { type: "button", class: "btn small", id: "next-change" }, "Next");
    if (index <= 0) prev.setAttribute("disabled", "");
    if (index < 0 || index >= items.length - 1) next.setAttribute("disabled", "");
    prev.addEventListener("click", () => items[index - 1] && select_(items[index - 1] as Change));
    next.addEventListener("click", () => items[index + 1] && select_(items[index + 1] as Change));
    detail.append(
      h(
        "div",
        { class: "nav-row" },
        prev,
        next,
        h("span", { class: "count" }, `${index + 1} of ${items.length}`),
      ),
      h("h3", {}, change.message),
      h(
        "p",
        { class: "meta" },
        h("span", { class: `sev-${change.severity}` }, change.severity.toUpperCase()),
        ` · ${change.id} · ${RULES[change.id].summary}`,
      ),
      h(
        "dl",
        {},
        h("dt", {}, "Operation"),
        h("dd", {}, change.operation),
        h("dt", {}, "Before"),
        h("dd", {}, h("code", {}, change.location.base ?? "(absent)")),
        h("dt", {}, "After"),
        h("dd", {}, h("code", {}, change.location.head ?? "(absent)")),
      ),
      h(
        "div",
        { class: "compare" },
        pane("removed", "Before", change.location.base, comparison.base.document),
        pane("added", "After", change.location.head, comparison.head.document),
      ),
      h(
        "p",
        { class: "privacy" },
        "Values are shown from the dereferenced documents, so $refs are expanded.",
      ),
    );
    return detail;
  }

  function renderChanges(v: View): HTMLElement {
    const items = visible();
    if (v.changes.length === 0) {
      return h(
        "div",
        { class: "empty" },
        "No API changes detected. The two documents are equivalent under SpecDiff's rules.",
      );
    }
    if (items.length === 0) {
      return h("div", { class: "empty" }, "No changes match the selected severities.");
    }
    return h("div", { class: "split" }, renderList(items), renderDetail(items));
  }

  function renderReport(v: View, kind: ReportTab): HTMLElement {
    const text = v[kind];
    const wrap = h("div");
    const copy = h("button", { type: "button", class: "btn small", id: "copy-report" }, "Copy");
    copy.addEventListener("click", () => {
      navigator.clipboard
        .writeText(text)
        .then(() => (copy.textContent = "Copied"))
        .catch(() => (copy.textContent = "Copy failed"));
    });
    const ext = { text: "txt", markdown: "md", json: "json" }[kind];
    const download = h(
      "button",
      { type: "button", class: "btn small", id: "download-report" },
      "Download",
    );
    download.addEventListener("click", () => {
      const url = URL.createObjectURL(new Blob([text], { type: "text/plain" }));
      const a = h("a", { href: url, download: `specdiff-report.${ext}` });
      a.click();
      URL.revokeObjectURL(url);
    });
    const safe = h("input", { type: "checkbox", id: "report-safe" });
    safe.checked = includeSafeInReport;
    safe.addEventListener("change", () => {
      includeSafeInReport = safe.checked;
      if (rebuildView()) render();
    });
    wrap.append(
      h(
        "div",
        { class: "report-actions" },
        copy,
        download,
        h("label", { class: "check" }, safe, "Include safe changes (like --include-safe)"),
      ),
      h("pre", { class: "code report", tabindex: "0", "aria-label": `${kind} report` }, text),
    );
    return wrap;
  }

  const TABS: [TabId, string][] = [
    ["changes", "Changes"],
    ["text", "Text report"],
    ["markdown", "Markdown report"],
    ["json", "JSON report"],
  ];

  function render(): void {
    if (!view) return;
    const tabs = h("div", { class: "tabs", role: "tablist", "aria-label": "Result views" });
    for (const [id, label] of TABS) {
      const button = h(
        "button",
        {
          type: "button",
          class: "tab",
          role: "tab",
          id: `tab-${id}`,
          "aria-selected": String(tab === id),
        },
        label,
      );
      button.addEventListener("click", () => {
        tab = id;
        render();
        byId(`tab-${id}`).focus();
      });
      tabs.append(button);
    }
    results.replaceChildren(
      renderStatus(view),
      renderChips(view),
      tabs,
      h(
        "div",
        { role: "tabpanel", "aria-labelledby": `tab-${tab}` },
        tab === "changes" ? renderChanges(view) : renderReport(view, tab),
      ),
    );
  }

  async function readFile(side: Side, input: HTMLInputElement): Promise<void> {
    const file = input.files?.[0];
    input.value = "";
    if (!file) return;
    if (file.size > MAX_INPUT_BYTES) {
      showAlert("File not loaded", [
        `${file.name} is ${(file.size / 1_000_000).toFixed(1)} MB; the Playground accepts up to ${MAX_INPUT_BYTES / 1_000_000} MB. Use the CLI for larger files.`,
      ]);
      return;
    }
    sides()[side].value = await file.text();
    clearProblems();
    updateCounts();
    markStale();
  }

  function markStale(): void {
    if (comparison) stale.hidden = false;
  }

  byId("load-example").addEventListener("click", () => {
    const ex = EXAMPLES.find((e) => e.id === select.value) ?? DEFAULT_EXAMPLE;
    loadExample(ex);
    markStale();
  });
  select.addEventListener("change", () => {
    const ex = EXAMPLES.find((e) => e.id === select.value);
    if (ex) byId("example-description").textContent = ex.description.replaceAll("`", "");
  });
  byId("reset").addEventListener("click", resetAll);
  compareButton.addEventListener("click", () => void runCompare(true));
  for (const side of ["before", "after"] as const) {
    sides()[side].addEventListener("input", () => {
      updateCounts();
      markStale();
    });
    byId(`clear-${side}`).addEventListener("click", () => {
      sides()[side].value = "";
      updateCounts();
      markStale();
      sides()[side].focus();
    });
    const input = byId<HTMLInputElement>(`${side}-file`);
    input.addEventListener("change", () => void readFile(side, input));
  }
  failOn.addEventListener("change", () => rebuildView() && render());
  ignore.addEventListener("change", () => rebuildView() && render());

  resetAll();
  void runCompare(false);
}

if (typeof document !== "undefined" && document.getElementById("compare")) mountPlayground();
