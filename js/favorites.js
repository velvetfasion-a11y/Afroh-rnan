(function () {
  const HEART =
    '<svg viewBox="0 0 24 24" aria-hidden="true">' +
    '<path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>' +
    '</svg>';

  function attachFavorites(root) {
    (root || document).querySelectorAll('.pcard').forEach((card) => {
      const href = card.querySelector('.pcard-link')?.getAttribute('href') || '';
      const id = card.dataset.slug || href.match(/products\/(.+)\.html/)?.[1];
      if (!id) return;
      const img = card.querySelector('.pcard-img');
      if (!img || img.querySelector('.pcard-fav')) return;

      const btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'pcard-fav';
      btn.setAttribute('aria-label', 'Spara favorit');
      btn.dataset.id = id;
      btn.innerHTML = HEART;

      if (localStorage.getItem('fav-' + id)) {
        btn.classList.add('active');
      }

      btn.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        btn.classList.toggle('active');
        if (btn.classList.contains('active')) {
          localStorage.setItem('fav-' + id, '1');
        } else {
          localStorage.removeItem('fav-' + id);
        }
      });

      img.appendChild(btn);
    });
  }

  window.initProductFavorites = attachFavorites;
  attachFavorites(document);
})();
