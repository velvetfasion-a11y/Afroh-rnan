import { writeFileSync, mkdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const productsDir = join(root, 'products');
mkdirSync(productsDir, { recursive: true });

const products = [
  {
    slug: 'shea-butter',
    title: 'Oraffinerad Shea Butter',
    fullTitle: 'Oraffinerad Shea Butter 100% naturell',
    brand: 'Sheabutter',
    size: '200 g',
    price: 129,
    image: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=800&auto=format&fit=crop&q=80',
    alt: 'Shea Butter',
    badge: 'Populär',
    badgeClass: '',
    section: 'kosmetika',
    sectionLabel: 'Kosmetika & Hudvård',
    description:
      '100 % oraffinerad shea butter från Västafrika – rik på vitaminer A och E. Perfekt för torr hud, hårbotten och läppar. Smälter in i huden och ger långvarig återfuktning.',
    tags: ['Naturlig', 'Vegansk', 'Ursprung: Västafrika'],
  },
  {
    slug: 'svart-tval',
    title: 'Afrikansk Svart Tvål',
    fullTitle: 'Afrikansk Svart Tvål – Rå & Naturlig',
    brand: 'Tvål',
    size: '150 g',
    price: 89,
    image: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=800&auto=format&fit=crop&q=80',
    alt: 'Afrikansk svart tvål',
    badge: 'Nyhet',
    badgeClass: 'gold',
    section: 'kosmetika',
    sectionLabel: 'Kosmetika & Hudvård',
    description:
      'Traditionell afrikansk svart tvål tillverkad av kakaoskalaska och shea butter. Milt rengörande för ansikte, kropp och hår – lämpar sig för känslig hud.',
    tags: ['Handgjord', 'Utan parabener', 'Ursprung: Ghana'],
  },
  {
    slug: 'arganolja',
    title: 'Marockansk Arganolja',
    fullTitle: 'Marockansk Arganolja Kallpressad',
    brand: 'Hårolja',
    size: '100 ml',
    price: 149,
    image: 'https://images.unsplash.com/photo-1590439471364-192aa70c0b53?w=800&auto=format&fit=crop&q=80',
    alt: 'Arganolja',
    badge: '',
    badgeClass: '',
    section: 'kosmetika',
    sectionLabel: 'Kosmetika & Hudvård',
    description:
      'Kallpressad arganolja från Marocko – en klassiker för glansigt hår, starka naglar och mjuk hud. Absorberas snabbt utan att kännas fet.',
    tags: ['Kallpressad', 'Multianvändning', 'Ursprung: Marocko'],
  },
  {
    slug: 'kokosolja',
    title: 'Virgin Kokosolja',
    fullTitle: 'Virgin Kokosolja Hudvård & Hår',
    brand: 'Kokosolja',
    size: '250 ml',
    price: 99,
    image: 'https://images.unsplash.com/photo-1631730486784-74757a1e7f24?w=800&auto=format&fit=crop&q=80',
    alt: 'Kokosolja',
    badge: 'Ekologisk',
    badgeClass: '',
    section: 'kosmetika',
    sectionLabel: 'Kosmetika & Hudvård',
    description:
      'Ekologisk virgin kokosolja med naturlig doft av kokos. Idealisk som hårinpackning, kroppsolja eller smörjmedel i köket.',
    tags: ['Ekologisk', 'Cold-pressed', 'Ursprung: Sri Lanka'],
  },
  {
    slug: 'berbere',
    title: 'Berbere – Etiopisk Kryddblandning',
    fullTitle: 'Berbere – Etiopisk Kryddblandning',
    brand: 'Kryddblandning',
    size: '200 g',
    price: 89,
    image: 'https://images.unsplash.com/photo-1532336414038-cf19250c5757?w=800&auto=format&fit=crop&q=80',
    alt: 'Berbere krydda',
    badge: 'Bästsäljare',
    badgeClass: '',
    section: 'mat',
    sectionLabel: 'Mat & Kryddor',
    description:
      'En autentisk etiopisk kryddblandning med djupa, varma toner av chili, kummin, koriander och kryddnejlika. Perfekt till linsgryta, kött och marinader.',
    tags: ['Glutenfri', 'Vegansk', 'Ursprung: Etiopien'],
  },
  {
    slug: 'rooibos-chai',
    title: 'Rooibos Chai',
    fullTitle: 'Rooibos Chai – Sydafrikanskt Te',
    brand: 'Te',
    size: '100 g',
    price: 65,
    image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=800&auto=format&fit=crop&q=80',
    alt: 'Rooibos te',
    badge: 'Nyhet',
    badgeClass: 'gold',
    section: 'mat',
    sectionLabel: 'Mat & Kryddor',
    description:
      'Koffeinfritt rooibos blandat med klassiska chaikryddor – kanel, kardemumma och ingefära. Mjukt, aromatiskt och perfekt med mjölk eller honung.',
    tags: ['Koffeinfritt', 'Naturlig', 'Ursprung: Sydafrika'],
  },
  {
    slug: 'suya-spice',
    title: 'Suya Spice',
    fullTitle: 'Suya Spice – Nigeriansk Grillkrydda',
    brand: 'Grillkrydda',
    size: '150 g',
    price: 75,
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=800&auto=format&fit=crop&q=80',
    alt: 'Suya krydda',
    badge: '',
    badgeClass: '',
    section: 'mat',
    sectionLabel: 'Mat & Kryddor',
    description:
      'Den klassiska nigerianska grillkryddan med jordnötter, chili och aromatiska kryddor. Strö över kött, kyckling eller grönsaker innan grilling.',
    tags: ['Glutenfri', 'Grill', 'Ursprung: Nigeria'],
  },
  {
    slug: 'baobab-snacks',
    title: 'Baobab Snacks',
    fullTitle: 'Baobab Snacks – Superfrukt Chips',
    brand: 'Superfood',
    size: '80 g',
    price: 55,
    image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=800&auto=format&fit=crop&q=80',
    alt: 'Baobab snacks',
    badge: 'Ekologisk',
    badgeClass: '',
    section: 'mat',
    sectionLabel: 'Mat & Kryddor',
    description:
      'Krispiga chips av baobabfrukt – rika på C-vitamin och fiber. Ett nyttigt mellanmål med lätt syrlig smak direkt från den afrikanska savannen.',
    tags: ['Ekologisk', 'Superfood', 'Ursprung: Senegal'],
  },
];

function page(p) {
  const sectionAnchor = p.section === 'mat' ? 'mat-products' : 'kosmetika-products';
  const badgeHtml = p.badge
    ? `<span class="product-badge${p.badgeClass ? ' ' + p.badgeClass : ''}">${p.badge}</span>`
    : '';
  const tagsHtml = p.tags.map((t) => `<span class="product-tag">${t}</span>`).join('\n        ');

  return `<!DOCTYPE html>
<html lang="sv">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${p.title} – Afrohörnan</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Cormorant+Garamond:ital,wght@0,600;0,700;1,600;1,700&family=Outfit:wght@300;400;500;600&display=swap" rel="stylesheet">
<link rel="stylesheet" href="../shared.css">
<link rel="stylesheet" href="product.css">
</head>
<body>

<nav>
  <a href="../index.html" class="logo">Afro<em>hörnan</em></a>
  <ul class="nav-links">
    <li><a href="../index.html#kosmetika-products">Kosmetika</a></li>
    <li><a href="../index.html#mat-products">Mat &amp; Kryddor</a></li>
    <li><a href="../index.html#butiker">Butiker</a></li>
    <li><a href="../index.html#kontakt">Kontakt</a></li>
  </ul>
  <div class="nav-right">
    <a href="../login.html" class="nav-profile" aria-label="Logga in">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg>
    </a>
    <button class="nav-cart-btn" type="button" aria-label="Varukorg">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="21" r="1"/><circle cx="20" cy="21" r="1"/><path d="M1 1h4l2.68 13.39a2 2 0 0 0 2 1.61h9.72a2 2 0 0 0 2-1.61L23 6H6"/></svg>
      <span class="cart-badge" id="cartCount">0</span>
    </button>
  </div>
</nav>

<main class="product-main">
  <nav class="breadcrumb" aria-label="Brödsmulor">
    <a href="../index.html">Hem</a> /
    <a href="../index.html#${sectionAnchor}">${p.sectionLabel}</a> /
    <span>${p.title}</span>
  </nav>

  <div class="product-layout">
    <div class="product-gallery">
      <div class="product-gallery-img">
        <img src="${p.image}" alt="${p.alt}">
        ${badgeHtml}
      </div>
    </div>

    <div class="product-details">
      <p class="product-brand">${p.brand}</p>
      <h1>${p.fullTitle}</h1>
      <p class="product-size">${p.size}</p>
      <p class="product-price">${p.price} kr</p>

      <hr class="product-divider">

      <p class="product-desc">${p.description}</p>
      <div class="product-tags">
        ${tagsHtml}
      </div>

      <hr class="product-divider">

      <p class="product-qty-label">Antal</p>
      <div class="product-qty-row">
        <button type="button" class="qty-btn" id="qtyMinus" aria-label="Minska antal">−</button>
        <span id="qty">1</span>
        <button type="button" class="qty-btn" id="qtyPlus" aria-label="Öka antal">+</button>
        <span id="total">${p.price} kr totalt</span>
      </div>

      <button type="button" class="btn-buy-product" id="buyBtn">Köp nu</button>
    </div>
  </div>

  <a href="../index.html#${sectionAnchor}" class="back-shop">← Tillbaka till sortimentet</a>
</main>

<footer>
  <span class="fl">Afrohörnan</span>
  Stockholm Fittja &nbsp;·&nbsp; Uppsala Gottsunda<br>
  <a href="mailto:info@afrohörnan.se">info@afrohörnan.se</a><br><br>
  © 2026 Afrohörnan. Alla rättigheter förbehållna.
</footer>

<script src="../js/cart.js"></script>
<script>
  const price = ${p.price};
  let qty = 1;
  const qtyEl = document.getElementById('qty');
  const totalEl = document.getElementById('total');
  const buyBtn = document.getElementById('buyBtn');

  function updateTotal() {
    qtyEl.textContent = qty;
    totalEl.textContent = (qty * price) + ' kr totalt';
  }

  document.getElementById('qtyMinus').addEventListener('click', () => {
    qty = Math.max(1, qty - 1);
    updateTotal();
  });
  document.getElementById('qtyPlus').addEventListener('click', () => {
    qty += 1;
    updateTotal();
  });

  buyBtn.addEventListener('click', () => {
    AfroCart.add(qty);
    buyBtn.textContent = '✓ Lagt till';
    buyBtn.classList.add('added');
    setTimeout(() => {
      buyBtn.textContent = 'Köp nu';
      buyBtn.classList.remove('added');
    }, 1800);
  });
</script>
</body>
</html>
`;
}

for (const p of products) {
  writeFileSync(join(productsDir, `${p.slug}.html`), page(p));
  console.log('Wrote', p.slug + '.html');
}
