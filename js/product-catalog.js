export const PRODUCT_CATALOG = {
  'shea-butter': {
    slug: 'shea-butter',
    name: 'Oraffinerad Shea Butter 100% naturell 200 g',
    brand: 'Sheabutter',
    cat: 'kosmetika',
    catLabel: 'Hudvård',
    price: 129,
    emoji: '🧴',
    url: 'products/shea-butter.html',
    image: 'https://images.unsplash.com/photo-1608248543803-ba4f8c70ae0b?w=400&auto=format&fit=crop&q=80',
  },
  'svart-tval': {
    slug: 'svart-tval',
    name: 'Afrikansk Svart Tvål – Rå & Naturlig 150 g',
    brand: 'Tvål',
    cat: 'kosmetika',
    catLabel: 'Hudvård',
    price: 89,
    emoji: '🧼',
    url: 'products/svart-tval.html',
    image: 'https://images.unsplash.com/photo-1612817288484-6f916006741a?w=400&auto=format&fit=crop&q=80',
  },
  'arganolja': {
    slug: 'arganolja',
    name: 'Marockansk Arganolja Kallpressad 100 ml',
    brand: 'Hårolja',
    cat: 'kosmetika',
    catLabel: 'Hudvård',
    price: 149,
    emoji: '💇',
    url: 'products/arganolja.html',
    image: 'https://images.unsplash.com/photo-1590439471364-192aa70c0b53?w=400&auto=format&fit=crop&q=80',
  },
  'kokosolja': {
    slug: 'kokosolja',
    name: 'Virgin Kokosolja Hudvård & Hår 250 ml',
    brand: 'Kokosolja',
    cat: 'kosmetika',
    catLabel: 'Hudvård',
    price: 99,
    emoji: '🥥',
    url: 'products/kokosolja.html',
    image: 'https://images.unsplash.com/photo-1631730486784-74757a1e7f24?w=400&auto=format&fit=crop&q=80',
  },
  'berbere': {
    slug: 'berbere',
    name: 'Berbere – Etiopisk Kryddblandning 200 g',
    brand: 'Kryddblandning',
    cat: 'mat',
    catLabel: 'Mat & Kryddor',
    price: 89,
    emoji: '🌶️',
    url: 'products/berbere.html',
    image: 'https://images.unsplash.com/photo-1532336414038-cf19250c5757?w=400&auto=format&fit=crop&q=80',
  },
  'rooibos-chai': {
    slug: 'rooibos-chai',
    name: 'Rooibos Chai – Sydafrikanskt Te 100 g',
    brand: 'Te',
    cat: 'mat',
    catLabel: 'Mat & Kryddor',
    price: 65,
    emoji: '🍃',
    url: 'products/rooibos-chai.html',
    image: 'https://images.unsplash.com/photo-1544787219-7f47ccb76574?w=400&auto=format&fit=crop&q=80',
  },
  'suya-spice': {
    slug: 'suya-spice',
    name: 'Suya Spice – Nigeriansk Grillkrydda 150 g',
    brand: 'Grillkrydda',
    cat: 'mat',
    catLabel: 'Mat & Kryddor',
    price: 75,
    emoji: '🌶️',
    url: 'products/suya-spice.html',
    image: 'https://images.unsplash.com/photo-1601050690597-df0568f70950?w=400&auto=format&fit=crop&q=80',
  },
  'baobab-snacks': {
    slug: 'baobab-snacks',
    name: 'Baobab Snacks – Superfrukt Chips 80 g',
    brand: 'Superfood',
    cat: 'mat',
    catLabel: 'Mat & Kryddor',
    price: 55,
    emoji: '🥜',
    url: 'products/baobab-snacks.html',
    image: 'https://images.unsplash.com/photo-1569718212165-3a8278d5f624?w=400&auto=format&fit=crop&q=80',
  },
};

export function getStoredFavoriteSlugs() {
  const slugs = [];
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i);
    if (key?.startsWith('fav-')) slugs.push(key.slice(4));
  }
  return slugs;
}

export function getFavoriteProducts() {
  return getStoredFavoriteSlugs()
    .map((slug) => PRODUCT_CATALOG[slug])
    .filter(Boolean);
}

export function removeFavorite(slug) {
  localStorage.removeItem('fav-' + slug);
}
