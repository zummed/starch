/**
 * Starch MkDocs integration.
 *
 * Finds starch code blocks and replaces them with live <starch-diagram> elements.
 * Works with:
 *   - Standard MkDocs: <pre><code class="language-starch">
 *   - Material for MkDocs + pymdownx.superfences: <div class="starch">
 *   - Material instant navigation (document$ observable)
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
    var blocks = document.querySelectorAll(
      'div.starch, div.language-starch, code.language-starch'
    );
    blocks.forEach(function (el) {
      var dsl = el.textContent || '';
      if (!dsl.trim() || !dsl.includes('objects:')) return;

      var diagram = document.createElement('starch-diagram');
      diagram.textContent = dsl.trim();
      diagram.setAttribute('autoplay', '');

      // Replace the block (or its <pre> parent for <code> elements)
      var target = el.tagName === 'CODE' && el.parentElement && el.parentElement.tagName === 'PRE'
        ? el.parentElement
        : el;
      target.replaceWith(diagram);
    });
  }

  // Material for MkDocs uses document$ for instant navigation
  if (typeof document$ !== 'undefined') {
    document$.subscribe(init);
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
