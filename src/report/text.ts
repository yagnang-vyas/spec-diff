import { describeSpec, groupByOperation, summarize, visibleChanges, type Report } from "./index.js";

export function renderText(report: Report): string {
  const visible = visibleChanges(report);
  const summary = summarize(report.changes);
  const idWidth = Math.max(0, ...visible.map((c) => c.id.length));
  const lines = [
    `${report.tool.name} ${report.tool.version}`,
    `base: ${describeSpec(report.base)}`,
    `head: ${describeSpec(report.head)}`,
    "",
  ];

  if (visible.length === 0) lines.push("No API changes detected.", "");
  for (const [operation, changes] of groupByOperation(visible)) {
    lines.push(operation);
    for (const c of changes) {
      lines.push(`  ${c.severity.toUpperCase().padEnd(8)}  ${c.id.padEnd(idWidth)}  ${c.message}`);
    }
    lines.push("");
  }

  const parts = [`${summary.breaking} breaking`, `${summary.warning} warning`];
  if (report.includeSafe) parts.push(`${summary.safe} safe`);
  parts.push(`${summary.info} info`);
  let line = `Summary: ${parts.join(", ")}`;
  if (!report.includeSafe && summary.safe > 0) {
    line += ` (${summary.safe} safe hidden, use --include-safe to list them)`;
  }
  lines.push(line);
  return `${lines.join("\n")}\n`;
}
