import katex from "katex";

const ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#39;",
};

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ESCAPES[c]);
}

/** Plain segments get escaped first, so extracted text can never inject markup. */
function renderProse(s: string): string {
  return escapeHtml(s)
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\n/g, "<br />");
}

function renderMath(tex: string, displayMode: boolean): string {
  try {
    return katex.renderToString(tex, {
      displayMode,
      throwOnError: false,
      strict: false,
      output: "html",
    });
  } catch {
    // A question with broken LaTeX still has to be reviewable, so show the raw
    // source flagged rather than crashing the page.
    return `<code class="text-incorrect">${escapeHtml(tex)}</code>`;
  }
}

/** $$...$$ for display maths, $...$ for inline. */
const MATH_RE = /\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/g;

export function renderMathText(input: string): string {
  if (!input) return "";
  let out = "";
  let last = 0;
  for (const m of input.matchAll(MATH_RE)) {
    const at = m.index ?? 0;
    out += renderProse(input.slice(last, at));
    const display = m[1] !== undefined;
    out += renderMath((display ? m[1] : m[2]).trim(), display);
    last = at + m[0].length;
  }
  out += renderProse(input.slice(last));
  return out;
}

export function MathText({
  children,
  className,
}: {
  children: string;
  className?: string;
}) {
  return (
    <span
      className={className}
      dangerouslySetInnerHTML={{ __html: renderMathText(children) }}
    />
  );
}
