/** A tiny TS/JSON highlighter: enough for snippets, no grammar engine shipped to the browser. */
export type Token = [kind: string, text: string];

const RULES: [string, RegExp][] = [
  ['c', /^\/\/[^\n]*|^\/\*[\s\S]*?\*\//],
  ['s', /^'(?:\\.|[^'\\\n])*'|^"(?:\\.|[^"\\\n])*"|^`(?:\\.|[^`\\])*`/],
  ['n', /^\d[\d_.]*/],
  ['k', /^(?:import|from|export|const|let|return|await|async|new|function|true|false|undefined|null|type|interface|as|if|else)\b/],
  ['f', /^[A-Za-z_$][\w$]*(?=\s*\()/],
  ['p', /^[A-Za-z_$][\w$]*(?=\s*:)/],
  ['i', /^[A-Za-z_$][\w$]*/],
  ['o', /^=>|^[{}()[\],.;:=+\-*/<>!?&|]/],
  ['w', /^\s+/],
];

export function tokenize(src: string): Token[] {
  const out: Token[] = [];
  let rest = src;
  while (rest) {
    let hit = false;
    for (const [kind, re] of RULES) {
      const m = re.exec(rest);
      if (m) { out.push([kind, m[0]]); rest = rest.slice(m[0].length); hit = true; break; }
    }
    if (!hit) { out.push(['o', rest[0]]); rest = rest.slice(1); }
  }
  return out;
}
