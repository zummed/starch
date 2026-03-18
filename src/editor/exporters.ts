const PKG = '@bitsnbobs/starch';
const CDN = `https://unpkg.com/${PKG}/dist/starch-embed.iife.js`;

export function exportHTML(dsl: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Starch Diagram</title>
  <script src="${CDN}"><\/script>
  <style>
    body { margin: 0; background: #0e1117; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    starch-diagram { width: 800px; height: 500px; }
  </style>
</head>
<body>
  <starch-diagram autoplay>
${dsl}
  </starch-diagram>
</body>
</html>`;
}

export function exportReact(dsl: string): string {
  // Escape backticks in the DSL for template literal
  const escaped = dsl.replace(/`/g, '\\`').replace(/\$/g, '\\$');
  return `import { Diagram } from '${PKG}';

const dsl = \`${escaped}\`;

export function MyDiagram() {
  return <Diagram dsl={dsl} autoplay />;
}`;
}

export function exportMkDocs(dsl: string): string {
  return `\`\`\`starch
${dsl}
\`\`\`

<!-- Setup: pip install mkdocs-starch, then add to mkdocs.yml:
plugins:
  - starch
-->`;
}

export function exportDSL(dsl: string): string {
  return dsl;
}

let cachedEmbedJs: string | null = null;

export async function fetchEmbedJs(): Promise<string> {
  if (cachedEmbedJs) return cachedEmbedJs;
  const resp = await fetch(CDN);
  if (!resp.ok) throw new Error(`Failed to fetch embed script: ${resp.status}`);
  cachedEmbedJs = await resp.text();
  return cachedEmbedJs;
}

export function exportSelfContainedHTML(dsl: string, embedJs: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Starch Diagram</title>
  <script>${embedJs}<\/script>
  <style>
    body { margin: 0; background: #0e1117; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    starch-diagram { width: 800px; height: 500px; }
  </style>
</head>
<body>
  <starch-diagram autoplay>
${dsl}
  </starch-diagram>
</body>
</html>`;
}

export const EXPORT_TARGETS = [
  { id: 'html', label: 'HTML', generate: exportHTML },
  { id: 'react', label: 'React', generate: exportReact },
  { id: 'mkdocs', label: 'MkDocs', generate: exportMkDocs },
  { id: 'dsl', label: 'DSL', generate: exportDSL },
] as const;
