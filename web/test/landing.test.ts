import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { buildView, compareTexts } from "../src/engine";
import { EXAMPLES } from "../src/examples";

const read = (...parts: string[]) =>
  readFileSync(join(import.meta.dirname, "..", ...parts), "utf8");
const landing = read("index.html");

function plainText(html: string): string {
  return html
    .replace(/<[^>]+>/g, "")
    .replaceAll("&lt;", "<")
    .replaceAll("&gt;", ">")
    .replaceAll("&quot;", '"')
    .replaceAll("&#39;", "'")
    .replaceAll("&amp;", "&");
}

describe("landing page", () => {
  it("shows the real engine output for the preloaded example", async () => {
    const ex = EXAMPLES[0]!;
    const view = buildView(await compareTexts(ex.before, ex.after), {
      includeSafe: false,
      failOn: "breaking",
      ignore: "",
    });
    const shown = plainText(landing);
    // The first three lines name the files and differ by file name; everything after must match.
    const body = view.text.split("\n").slice(3).join("\n");
    expect(shown).toContain(body.trimEnd());
  });

  it("has Open Playground and View on GitHub actions", () => {
    expect(landing).toMatch(
      /<a class="btn primary large" href="\.\/playground\/">Open Playground<\/a>/,
    );
    expect(landing).toContain('href="https://github.com/yagnang-vyas/spec-diff">View on GitHub');
  });

  it("links only to the repository, anchors and the Playground", () => {
    const hrefs = [...landing.matchAll(/href="([^"]+)"/g)].map((m) => m[1]!);
    for (const href of hrefs) {
      expect(
        href.startsWith("#") ||
          href.startsWith("./") ||
          href.startsWith("/favicon") ||
          href.startsWith("https://github.com/yagnang-vyas/spec-diff"),
        href,
      ).toBe(true);
    }
  });

  it("every in-page anchor has a target", () => {
    for (const [, id] of landing.matchAll(/href="#([^"]+)"/g)) {
      expect(landing).toContain(`id="${id}"`);
    }
  });

  it("does not invent a live demo URL or metrics", () => {
    expect(landing).not.toMatch(/netlify\.app|https?:\/\/(?!github\.com)/);
  });
});
