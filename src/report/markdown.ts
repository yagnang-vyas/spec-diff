import { describeSpec, groupByOperation, summarize, visibleChanges, type Report } from "./index.js";

/** Escape text for a Markdown table cell (and for inline text generally). */
export function escapeMarkdown(text: string): string {
  return text.replace(/\r?\n/g, " ").replace(/[\\`*_[\]<>&|]/g, (ch) => {
    if (ch === "<") return "&lt;";
    if (ch === ">") return "&gt;";
    if (ch === "&") return "&amp;";
    return `\\${ch}`;
  });
}

function codeSpan(text: string): string {
  const escaped = text.replace(/\|/g, "\\|");
  return text.includes("`") ? `\`\` ${escaped} \`\`` : `\`${escaped}\``;
}

const LABELS = { breaking: "Breaking", warning: "Warning", safe: "Safe", info: "Info" } as const;

export function renderMarkdown(report: Report): string {
  const visible = visibleChanges(report);
  const summary = summarize(report.changes);
  const lines = [
    "## SpecDiff report",
    "",
    `Base: ${codeSpan(describeSpec(report.base))}  `,
    `Head: ${codeSpan(describeSpec(report.head))}`,
    "",
    "| Severity | Changes |",
    "| --- | ---: |",
    `| Breaking | ${summary.breaking} |`,
    `| Warning | ${summary.warning} |`,
    `| Safe | ${summary.safe}${report.includeSafe || summary.safe === 0 ? "" : " (hidden)"} |`,
    `| Info | ${summary.info} |`,
    "",
  ];

  if (visible.length === 0) lines.push("No API changes detected.", "");
  for (const [operation, changes] of groupByOperation(visible)) {
    lines.push(
      `### ${codeSpan(operation)}`,
      "",
      "| Severity | Rule | Change |",
      "| --- | --- | --- |",
    );
    for (const c of changes) {
      lines.push(`| ${LABELS[c.severity]} | ${codeSpan(c.id)} | ${escapeMarkdown(c.message)} |`);
    }
    lines.push("");
  }
  return `${lines.join("\n").trimEnd()}\n`;
}
