import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import MessageRenderer, { parseMessageBlocks } from "./MessageRenderer";

describe("Kuro message rendering", () => {
  it("parses common structured response blocks", () => {
    const blocks = parseMessageBlocks([
      "# Summary",
      "",
      "A paragraph with **bold text** and `inline code`.",
      "",
      "- First action",
      "- Second action",
      "",
      "| Part | Status |",
      "| --- | --- |",
      "| Memory | Ready |",
      "",
      "```ts",
      "const answer = 42;",
      "```",
    ].join("\n"));

    expect(blocks.map(block => block.kind)).toEqual([
      "heading",
      "paragraph",
      "list",
      "table",
      "code",
    ]);
    expect(blocks[0]).toMatchObject({ kind: "heading", level: 1, content: "Summary" });
  });

  it("renders rich structure and safe links as semantic elements", () => {
    const html = renderToStaticMarkup(<MessageRenderer text={[
      "## What changed",
      "",
      "Use **clear labels**, *emphasis*, and `small snippets`.",
      "",
      "1. First step",
      "2. [Official site](https://example.com/docs)",
      "",
      "> Important note",
      "",
      "```ts",
      "const x = 1;",
      "```",
    ].join("\n")} />);

    expect(html).toContain("<h2>What changed</h2>");
    expect(html).toContain("<strong>clear labels</strong>");
    expect(html).toContain("<em>emphasis</em>");
    expect(html).toContain("<code");
    expect(html).toContain("<ol>");
    expect(html).toContain('href="https://example.com/docs"');
    expect(html).toContain('rel="noreferrer noopener"');
    expect(html).toContain("<blockquote>");
    expect(html).toContain("<pre");
  });

  it("does not execute raw HTML or create links for unsafe schemes", () => {
    const html = renderToStaticMarkup(<MessageRenderer text={'<script>alert("x")</script> [click](javascript:alert(1))'} />);
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).not.toContain('href="javascript:');
  });

  it("does not automatically request externally hosted markdown images", () => {
    const html = renderToStaticMarkup(<MessageRenderer text="![reference](https://images.example.test/art.png)" />);
    expect(html).toContain("Image reference: reference");
    expect(html).toContain('href="https://images.example.test/art.png"');
    expect(html).not.toContain("<img");
  });
});
