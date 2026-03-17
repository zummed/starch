"""MkDocs plugin for rendering starch diagrams from fenced code blocks."""

import re
from mkdocs.plugins import BasePlugin
from mkdocs.config import config_options

STARCH_CDN = "https://unpkg.com/@bitsnbobs/starch/dist/starch-embed.iife.js"

FENCE_RE = re.compile(
    r'```starch\s*\n(.*?)```',
    re.DOTALL,
)


class StarchPlugin(BasePlugin):
    config_scheme = (
        ("cdn", config_options.Type(str, default=STARCH_CDN)),
        ("autoplay", config_options.Type(bool, default=True)),
    )

    def on_page_content(self, html, page, config, files):
        """Replace starch code blocks in rendered HTML with <starch-diagram> elements."""
        # Match <pre><code class="language-starch">...</code></pre> blocks
        pattern = re.compile(
            r'<pre><code class="language-starch">(.*?)</code></pre>',
            re.DOTALL,
        )

        def replace_block(match):
            dsl = match.group(1)
            # Unescape HTML entities
            dsl = dsl.replace("&lt;", "<").replace("&gt;", ">").replace("&amp;", "&").replace("&quot;", '"')
            autoplay = ' autoplay' if self.config["autoplay"] else ''
            return f'<starch-diagram{autoplay}>\n{dsl}\n</starch-diagram>'

        return pattern.sub(replace_block, html)

    def on_page_context(self, context, page, config, nav):
        """Inject the starch embed script into extra_javascript if not already present."""
        cdn = self.config["cdn"]
        extra_js = config.get("extra_javascript", [])
        # Check if already included (as string or dict with path key)
        urls = [js if isinstance(js, str) else js.get("path", "") for js in extra_js]
        if cdn not in urls and "starch-embed" not in " ".join(urls):
            extra_js.append(cdn)
        return context
