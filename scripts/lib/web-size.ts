// What a visitor downloads for the web app, measured on the production export. Pure helpers, so the
// root tests can run them; the file reading and the report are in scripts/web-size.ts.

// The script files a page loads, from its HTML. Next writes them as /_next/static/... paths, both
// as <script src> tags and inside the inline payload (where quotes are escaped as \").
export function referencedScripts(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\/_next\/static\/[A-Za-z0-9_\-./]+?\.js/g)) found.add(match[0]);
  return [...found].sort();
}

export function referencedStyles(html: string): string[] {
  const found = new Set<string>();
  for (const match of html.matchAll(/\/_next\/static\/[A-Za-z0-9_\-./]+?\.css/g)) found.add(match[0]);
  return [...found].sort();
}

// Labels for what a file contains, read from strings that only that code has, so a renamed chunk is
// still recognised. A file can have several labels (the bundler may put modules together).
export function labelsFor(source: string): string[] {
  const labels: string[] = [];
  if (source.includes("SIM_RESOLUTION") || source.includes("DENSITY_DISSIPATION")) labels.push("water effect");
  if (source.includes("feDisplacementMap")) labels.push("liquid glass");
  if (source.includes("Minified React error") || source.includes("react.transitional.element")) labels.push("react");
  if (source.includes("/api/chat")) labels.push("chat client");
  return labels;
}

export function kb(bytes: number): string {
  return (bytes / 1024).toFixed(1);
}

export interface FileSize {
  name: string;
  raw: number;
  gzip: number;
  labels: string[];
}

export function totals(files: readonly FileSize[]): { raw: number; gzip: number } {
  return { raw: files.reduce((sum, file) => sum + file.raw, 0), gzip: files.reduce((sum, file) => sum + file.gzip, 0) };
}
