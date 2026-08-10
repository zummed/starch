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
api: rect 140x46 radius=8 fill #34d399 at 200,100
  apiLabel: text "API" size=14
db: rect 140x46 radius=8 fill #a78bfa at 200,250
  dbLabel: text "DB" size=14
conn: arrow api db stroke #fbbf24 label "query"
  draw 0

animate 3 loop
  1.5
    conn.draw: { value: 1, easing: "easeInOut" }
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
