/**
 * Starch MkDocs integration.
 *
 * Uses the embed script's Starch.scan() to find starch code blocks and
 * replace them with live <starch-diagram> elements.
 *
 * Setup in mkdocs.yml:
 *
 *   markdown_extensions:
 *     - pymdownx.superfences:
 *         custom_fences:
 *           - name: starch
 *             class: starch
 *             format: !!python/name:pymdownx.superfences.fence_div_format
 *
 *   extra_javascript:
 *     - https://unpkg.com/@bitsnbobs/starch/dist/starch-embed.iife.js
 *     - js/starch-init.js
 */
(function () {
  function init() {
    if (window.Starch) {
      window.Starch.scan(document);
    }
  }

  // Material for MkDocs uses document$ for instant navigation
  if (window.document$) {
    window.document$.subscribe(init);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
