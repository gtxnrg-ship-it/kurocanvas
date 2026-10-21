import type { ReactNode } from "react";

type MessageBlock =
  | { kind: "paragraph"; content: string }
  | { kind: "heading"; level: number; content: string }
  | { kind: "code"; language: string; content: string }
  | { kind: "list"; ordered: boolean; items: string[] }
  | { kind: "quote"; content: string }
  | { kind: "rule" }
  | { kind: "table"; header: string[]; rows: string[][] };

function isHeading(line: string): boolean {
  return /^\s{0,3}#{1,6}\s+/.test(line);
}

function isRule(line: string): boolean {
  return /^\s{0,3}(?:-{3,}|\*{3,}|_{3,})\s*$/.test(line);
}

function isList(line: string): boolean {
  return /^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)/.test(line);
}

function isQuote(line: string): boolean {
  return /^\s{0,3}>\s?/.test(line);
}

function isTable(lines: string[], index: number): boolean {
  return index + 1 < lines.length
    && lines[index].includes("|")
    && /^\s*\|?\s*:?-{3,}:?\s*(?:\|\s*:?-{3,}:?\s*)+\|?\s*$/.test(lines[index + 1]);
}

function cells(line: string): string[] {
  return line.trim().replace(/^\|/, "").replace(/\|$/, "").split("|").map(cell => cell.trim());
}

function startsBlock(lines: string[], index: number): boolean {
  const line = lines[index] ?? "";
  return /^\s{0,3}```/.test(line)
    || isHeading(line)
    || isRule(line)
    || isList(line)
    || isQuote(line)
    || isTable(lines, index);
}

export function parseMessageBlocks(source: string): MessageBlock[] {
  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const blocks: MessageBlock[] = [];
  let index = 0;

  while (index < lines.length) {
    const line = lines[index];
    if (!line.trim()) {
      index++;
      continue;
    }

    if (/^\s{0,3}```/.test(line)) {
      const language = line.replace(/^\s{0,3}```/, "").trim().split(/\s+/)[0] ?? "";
      const code: string[] = [];
      index++;
      while (index < lines.length && !/^\s{0,3}```\s*$/.test(lines[index])) {
        code.push(lines[index++]);
      }
      if (index < lines.length) index++;
      blocks.push({ kind: "code", language: /^[a-z\d_+-]{1,30}$/i.test(language) ? language : "", content: code.join("\n") });
      continue;
    }

    const heading = line.match(/^\s{0,3}(#{1,6})\s+(.+?)\s*#*\s*$/);
    if (heading) {
      blocks.push({ kind: "heading", level: heading[1].length, content: heading[2] });
      index++;
      continue;
    }

    if (isRule(line)) {
      blocks.push({ kind: "rule" });
      index++;
      continue;
    }

    if (isTable(lines, index)) {
      const header = cells(lines[index]);
      index += 2;
      const rows: string[][] = [];
      while (index < lines.length && lines[index].includes("|") && lines[index].trim()) {
        rows.push(cells(lines[index]));
        index++;
      }
      blocks.push({ kind: "table", header, rows });
      continue;
    }

    if (isQuote(line)) {
      const quoted: string[] = [];
      while (index < lines.length && isQuote(lines[index])) {
        quoted.push(lines[index].replace(/^\s{0,3}>\s?/, ""));
        index++;
      }
      blocks.push({ kind: "quote", content: quoted.join("\n") });
      continue;
    }

    if (isList(line)) {
      const first = line.match(/^\s{0,3}(\d+)[.)]\s+/);
      const ordered = !!first;
      const items: string[] = [];
      while (index < lines.length && isList(lines[index])) {
        const itemMatch = lines[index].match(/^\s{0,3}(?:[-*+]\s+|\d+[.)]\s+)(.*)$/);
        if (!itemMatch) break;
        const thisOrdered = /^\s{0,3}\d+[.)]\s+/.test(lines[index]);
        if (thisOrdered !== ordered) break;
        items.push(itemMatch[1]);
        index++;
      }
      blocks.push({ kind: "list", ordered, items });
      continue;
    }

    const paragraph = [line.trim()];
    index++;
    while (index < lines.length && lines[index].trim() && !startsBlock(lines, index)) {
      paragraph.push(lines[index].trim());
      index++;
    }
    blocks.push({ kind: "paragraph", content: paragraph.join(" ") });
  }

  return blocks;
}

function renderInline(text: string, keyPrefix: string): ReactNode[] {
  // Only links with explicit HTTP(S) or mailto schemes are clickable; raw HTML is text.
  const tokens = /(\!\[([^\]]*)\]\((https?:\/\/[^\s)]+)\))|(\[([^\]]+)\]\((https?:\/\/[^\s)]+|mailto:[^\s)]+)\))|(`([^`]+)`)|(\*\*(.+?)\*\*)|(__(.+?)__)|(~~(.+?)~~)|(\*([^*\n]+)\*)|(_([^_\n]+)_)|(https?:\/\/[^\s<]+)/g;
  const nodes: ReactNode[] = [];
  let lastIndex = 0;
  let tokenIndex = 0;
  let match: RegExpExecArray | null;

  while ((match = tokens.exec(text)) !== null) {
    if (match.index > lastIndex) nodes.push(text.slice(lastIndex, match.index));
    const key = keyPrefix + "-" + tokenIndex++;
    if (match[1] !== undefined) {
      // Avoid silently fetching arbitrary external images while rendering an AI answer.
      nodes.push(<a key={key} href={match[3]} target="_blank" rel="noreferrer noopener">Image reference: {match[2] || "open image"}</a>);
    } else if (match[4] !== undefined) {
      nodes.push(<a key={key} href={match[6]} target="_blank" rel="noreferrer noopener">{match[5]}</a>);
    } else if (match[7] !== undefined) {
      nodes.push(<code key={key} className="message-inline-code">{match[8]}</code>);
    } else if (match[9] !== undefined) {
      nodes.push(<strong key={key}>{match[10]}</strong>);
    } else if (match[11] !== undefined) {
      nodes.push(<strong key={key}>{match[12]}</strong>);
    } else if (match[13] !== undefined) {
      nodes.push(<del key={key}>{match[14]}</del>);
    } else if (match[15] !== undefined) {
      nodes.push(<em key={key}>{match[16]}</em>);
    } else if (match[17] !== undefined) {
      nodes.push(<em key={key}>{match[18]}</em>);
    } else if (match[19] !== undefined) {
      const url = match[19].replace(/[),.!?;:]+$/, "");
      const punctuation = match[19].slice(url.length);
      nodes.push(<a key={key} href={url} target="_blank" rel="noreferrer noopener">{url}</a>, punctuation);
    }
    lastIndex = tokens.lastIndex;
  }

  if (lastIndex < text.length) nodes.push(text.slice(lastIndex));
  return nodes;
}

export default function MessageRenderer({ text }: { text: string }) {
  const blocks = parseMessageBlocks(text);
  return <div className="message-markdown">
    {blocks.map((block, index) => {
      const key = "block-" + index;
      switch (block.kind) {
        case "heading": {
          const content = renderInline(block.content, key);
          if (block.level === 1) return <h1 key={key}>{content}</h1>;
          if (block.level === 2) return <h2 key={key}>{content}</h2>;
          if (block.level === 3) return <h3 key={key}>{content}</h3>;
          if (block.level === 4) return <h4 key={key}>{content}</h4>;
          if (block.level === 5) return <h5 key={key}>{content}</h5>;
          return <h6 key={key}>{content}</h6>;
        }
        case "paragraph":
          return <p key={key}>{renderInline(block.content, key)}</p>;
        case "code":
          return <pre key={key} className="message-code-block"><code className={block.language ? "language-" + block.language : undefined}>{block.content}</code></pre>;
        case "quote":
          return <blockquote key={key}>{block.content.split("\n").map((part, partIndex) => <span key={partIndex}>{partIndex > 0 && <br />}{renderInline(part, key + "-q" + partIndex)}</span>)}</blockquote>;
        case "rule":
          return <hr key={key} />;
        case "list": {
          const Tag = block.ordered ? "ol" : "ul";
          return <Tag key={key}>{block.items.map((item, itemIndex) => {
            const task = item.match(/^\[([ xX])\]\s*(.*)$/);
            return <li key={itemIndex}>{task && <span className="message-task-marker" aria-label={task[1].trim() ? "completed task" : "task"}>{task[1].trim() ? "☑" : "☐"}</span>}{renderInline(task ? task[2] : item, key + "-li" + itemIndex)}</li>;
          })}</Tag>;
        }
        case "table":
          return <div key={key} className="message-table-wrap"><table><thead><tr>{block.header.map((cell, i) => <th key={i}>{renderInline(cell, key + "-h" + i)}</th>)}</tr></thead><tbody>{block.rows.map((row, rowIndex) => <tr key={rowIndex}>{block.header.map((_, cellIndex) => <td key={cellIndex}>{renderInline(row[cellIndex] ?? "", key + "-r" + rowIndex + "c" + cellIndex)}</td>)}</tr>)}</tbody></table></div>;
      }
    })}
  </div>;
}
