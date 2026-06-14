(function () {
  const KEY = 'afrohornan-cart';

  function getCount() {
    return parseInt(localStorage.getItem(KEY) || '0', 10);
  }

  function setCount(n) {
    localStorage.setItem(KEY, String(n));
    document.querySelectorAll('#cartCount').forEach((el) => {
      el.textContent = n;
    });
  }

  window.AfroCart = {
    getCount,
    add(qty) {
      setCount(getCount() + (qty || 1));
    },
    init() {
      setCount(getCount());
    },
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => AfroCart.init());
  } else {
    AfroCart.init();
  }
})();
