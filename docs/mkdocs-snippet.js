(function () {
  document.addEventListener('DOMContentLoaded', function () {
    var blocks = document.querySelectorAll('code.language-starch');
    blocks.forEach(function (code) {
      var pre = code.parentElement;
      if (!pre || pre.tagName !== 'PRE') return;

      var dsl = code.textContent || '';
      var diagram = document.createElement('starch-diagram');
      diagram.textContent = dsl;
      diagram.setAttribute('autoplay', '');

      pre.replaceWith(diagram);
    });
  });
})();
