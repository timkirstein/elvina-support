(function () {
  var input = document.getElementById('blog-search-input');
  if (!input) return;
  var clear = document.getElementById('blog-search-clear');
  var status = document.getElementById('blog-search-status');
  var empty = document.getElementById('blog-search-empty');
  var cards = Array.prototype.slice.call(document.querySelectorAll('.post-grid-card'));

  function norm(s) {
    return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/ø/g, 'o').replace(/æ/g, 'ae').replace(/å/g, 'a');
  }
  var index = cards.map(function (c) { return norm(c.getAttribute('data-search')); });

  function run() {
    var terms = norm(input.value).split(/\s+/).filter(Boolean);
    var shown = 0;
    cards.forEach(function (c, i) {
      var ok = terms.every(function (t) { return index[i].indexOf(t) !== -1; });
      c.hidden = !ok;
      if (ok) shown++;
    });
    clear.hidden = !input.value;
    empty.hidden = shown > 0 || !terms.length;
    status.textContent = terms.length && shown
      ? (shown === 1 ? input.dataset.one : input.dataset.many.replace('{n}', shown)) : '';
    try {
      var u = new URL(location.href);
      if (input.value) u.searchParams.set('q', input.value); else u.searchParams.delete('q');
      history.replaceState(null, '', u);
    } catch (e) {}
  }

  input.addEventListener('input', run);
  clear.addEventListener('click', function () { input.value = ''; run(); input.focus(); });
  var q = new URLSearchParams(location.search).get('q');
  if (q) { input.value = q; run(); }
})();
