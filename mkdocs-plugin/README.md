# mkdocs-starch

MkDocs plugin for rendering [starch](https://github.com/zummed/starch) animated diagrams from fenced code blocks.

## Install

```bash
pip install mkdocs-starch
```

## Setup

Add to your `mkdocs.yml`:

```yaml
plugins:
  - starch
```

That's it. No other configuration needed.

## Usage

Use fenced code blocks with the `starch` language:

````markdown
```starch
{
  objects: [
    { box: "api", at: [200, 100], colour: "#34d399", text: "API" },
    { box: "db", at: [200, 300], colour: "#a78bfa", text: "DB" },
    { line: "conn", from: "api", to: "db", colour: "#fbbf24", progress: 0 },
  ],
  animate: {
    duration: 3,
    keyframes: [
      { time: 1.5, changes: { conn: { progress: 1, easing: "easeInOut" } } },
    ],
  },
}
```
````

The plugin automatically:
- Replaces starch code blocks with live `<starch-diagram>` elements
- Injects the starch embed script from the CDN

## Options

```yaml
plugins:
  - starch:
      autoplay: true    # default: true
      cdn: "https://unpkg.com/@bitsnbobs/starch/dist/starch-embed.iife.js"
```
