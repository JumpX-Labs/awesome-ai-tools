import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.join(__dirname, "..");
const readmePath = path.join(root, "README.md");
const outPath = path.join(root, "public", "tools.json");

const ITEM_RE = /^-\s+\[([^\]]*)\]\(([^)]*)\)\s*-\s*(.+)$/;

/**
 * @param {string} content
 * @param {{ strict: boolean }} opts
 */
function parseReadme(content, opts) {
  const strict = opts.strict;
  const lines = content.split(/\r?\n/);
  /** @type {{ siteTitle: string; tagline: string; categories: { name: string; items: { name: string; url: string; description: string }[] }[] }} */
  const result = {
    siteTitle: "Tools",
    tagline: "",
    categories: [],
  };

  let state = "seek_h1"; // intro | category
  /** @type {{ name: string; items: { name: string; url: string; description: string }[] } | null} */
  let currentCat = null;
  const introParts = [];

  for (let i = 0; i < lines.length; i++) {
    const raw = lines[i];
    const line = raw;
    const trimmed = line.trim();

    if (state === "seek_h1") {
      if (/^#\s+/.test(line) && !/^##/.test(line)) {
        result.siteTitle = line.replace(/^#\s+/, "").trim();
        state = "intro";
      }
      continue;
    }

    if (state === "intro") {
      if (/^##\s+/.test(line)) {
        const name = line.replace(/^##\s+/, "").trim();
        currentCat = { name, items: [] };
        result.categories.push(currentCat);
        state = "category";
        continue;
      }
      if (!trimmed) continue;
      if (/^#\s+/.test(line) && !/^##/.test(line)) {
        if (strict) throw new Error(`Line ${i + 1}: unexpected second H1`);
        continue;
      }
      introParts.push(trimmed);
      continue;
    }

    if (state === "category") {
      if (/^##\s+/.test(line)) {
        const name = line.replace(/^##\s+/, "").trim();
        currentCat = { name, items: [] };
        result.categories.push(currentCat);
        continue;
      }
      if (!trimmed) continue;
      const m = trimmed.match(ITEM_RE);
      if (m) {
        if (!currentCat) {
          if (strict) throw new Error(`Line ${i + 1}: tool line before any category`);
          continue;
        }
        currentCat.items.push({
          name: m[1].trim(),
          url: m[2].trim(),
          description: m[3].trim(),
        });
        continue;
      }
      if (trimmed.startsWith("```")) {
        if (strict) console.warn(`Line ${i + 1}: skipping fenced block start (avoid in tool sections)`);
        // skip until closing fence
        i++;
        while (i < lines.length && !lines[i].trim().startsWith("```")) i++;
        continue;
      }
      if (strict) {
        throw new Error(
          `Line ${i + 1}: invalid line under category "${currentCat?.name ?? "?"}". Expected: - [名称](URL) - 描述\nGot: ${trimmed.slice(0, 120)}`,
        );
      }
    }
  }

  result.tagline = introParts.map((p) => p.replace(/\*\*([^*]+)\*\*/g, "$1").replace(/\*([^*]+)\*/g, "$1")).join(" ");

  if (strict && result.categories.length === 0) {
    throw new Error("No categories (##) found in README");
  }

  for (const cat of result.categories) {
    if (strict && cat.items.length === 0) {
      throw new Error(`Category "${cat.name}" has no tool entries`);
    }
  }

  return result;
}

function main() {
  const validate = process.argv.includes("--validate");
  if (!fs.existsSync(readmePath)) {
    console.error("Missing README.md at repo root");
    process.exit(1);
  }
  const content = fs.readFileSync(readmePath, "utf8");
  try {
    const data = parseReadme(content, { strict: validate });
    fs.mkdirSync(path.dirname(outPath), { recursive: true });
    fs.writeFileSync(outPath, JSON.stringify(data, null, 2), "utf8");
    console.log(`Wrote ${path.relative(root, outPath)} (${data.categories.length} categories)`);
  } catch (e) {
    console.error(validate ? "Validation failed:" : "Parse failed:", e instanceof Error ? e.message : e);
    process.exit(1);
  }
}

main();
