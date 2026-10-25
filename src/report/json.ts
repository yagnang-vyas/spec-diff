import { summarize, visibleChanges, type Report } from "./index.js";

export function renderJson(report: Report): string {
  const visible = visibleChanges(report);
  const summary = summarize(report.changes);
  const output = {
    schemaVersion: 1,
    tool: report.tool,
    base: report.base,
    head: report.head,
    changes: visible.map((c) => ({
      id: c.id,
      severity: c.severity,
      operation: c.operation,
      location: { base: c.location.base, head: c.location.head },
      message: c.message,
    })),
    summary: { ...summary, hiddenSafe: report.includeSafe ? 0 : summary.safe },
  };
  return `${JSON.stringify(output, null, 2)}\n`;
}
