import { promises as fs } from "node:fs";
import path from "node:path";

/**
 * Serves the full page render for a question.
 *
 * Figure crops are derived from a model's guess at where the diagram sits on the
 * page, and that guess is sometimes short - it can cut off an option or land on
 * blank paper. The reviewer needs the whole page to check against, and the
 * pipeline already writes one PNG per page, so this just exposes it.
 */
const YEAR_RE = /^\d{4}$/;
const PAGE_RE = /^\d{1,4}$/;

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ year: string; page: string }> },
) {
  // Local only, and the most important of the three: these are whole pages of
  // the source PDFs, including the coaching companies' worked solutions, which
  // CLAUDE.md says we may not republish. Enforced here as well as in middleware
  // so it cannot be defeated by a matcher change.
  if (process.env.NODE_ENV === "production") {
    return new Response("Not found", { status: 404 });
  }

  const { year, page } = await params;

  if (!YEAR_RE.test(year) || !PAGE_RE.test(page)) {
    return new Response("Not found", { status: 404 });
  }

  const dir = path.join(process.cwd(), "data", "extracted", year, "pages");
  const name = `p${String(Number(page)).padStart(3, "0")}.png`;
  const file = path.resolve(dir, name);
  if (path.relative(dir, file).includes("..")) {
    return new Response("Not found", { status: 404 });
  }

  try {
    const bytes = await fs.readFile(file);
    return new Response(new Uint8Array(bytes), {
      headers: { "Content-Type": "image/png", "Cache-Control": "no-cache" },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
