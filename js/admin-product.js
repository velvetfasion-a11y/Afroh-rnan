import { requireAdmin, signOut, getFirebaseAuth } from './firebase-auth.js';
import { getProduct, saveProduct, deleteProduct } from './firebase-db.js';
import { normalizeColors, slugifyColorId, normalizeStock, totalFromStock } from './products.js';

const params = new URLSearchParams(window.location.search);
const productId = params.get('id');
const isEdit = Boolean(productId);

let existingImages = [];
let pendingImages = [];
let loadedProductTitle = '';
let colorVariants = [];

function setFormError(message) {
  const el = document.getElementById('formError');
  if (!message) {
    el.hidden = true;
    el.textContent = '';
    return;
  }
  el.hidden = false;
  el.textContent = message;
}

function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function totalImageCount() {
  return existingImages.length + pendingImages.length;
}

function normalizeImageFile(file, index = 0) {
  if (!file || !(file instanceof Blob)) return null;
  if (!file.type.startsWith('image/')) return null;

  if (file instanceof File && file.name) return file;

  const ext = file.type === 'image/png' ? 'png' : file.type === 'image/webp' ? 'webp' : 'jpg';
  return new File([file], `image-${Date.now()}-${index}.${ext}`, {
    type: file.type || 'image/jpeg',
  });
}

function addImageFiles(fileList) {
  const files = [...(fileList || [])];
  let added = 0;

  files.forEach((rawFile, index) => {
    const file = normalizeImageFile(rawFile, index);
    if (!file) return;
    pendingImages.push({
      id: crypto.randomUUID(),
      file,
      previewUrl: URL.createObjectURL(file),
    });
    added += 1;
  });

  if (added) {
    renderImageGallery();
    renderColorVariants();
  }
}

function getAllImageOptions() {
  const options = [];
  existingImages.forEach((url, index) => {
    options.push({ url, label: `Bild ${index + 1}` });
  });
  pendingImages.forEach((item, index) => {
    options.push({ url: item.previewUrl, label: `Ny bild ${index + 1}` });
  });
  return options;
}

function syncInventoryField() {
  const field = document.getElementById('fieldInventory');
  const hint = document.getElementById('inventoryHint');
  const fittjaWrap = document.getElementById('fieldStockFittjaWrap');
  const marstaWrap = document.getElementById('fieldStockMarstaWrap');
  const hasColors = colorVariants.length > 0;
  if (!field) return;

  if (hasColors) {
    const total = colorVariants.reduce(
      (sum, color) => sum + Math.max(0, Number(color.stockFittja) || 0) + Math.max(0, Number(color.stockMarsta) || 0),
      0,
    );
    field.value = String(total);
    if (hint) hint.hidden = false;
    if (fittjaWrap) fittjaWrap.hidden = true;
    if (marstaWrap) marstaWrap.hidden = true;
    return;
  }

  if (fittjaWrap) fittjaWrap.hidden = false;
  if (marstaWrap) marstaWrap.hidden = false;
  if (hint) hint.hidden = true;

  const fittja = Number.parseInt(document.getElementById('fieldStockFittja')?.value, 10) || 0;
  const marsta = Number.parseInt(document.getElementById('fieldStockMarsta')?.value, 10) || 0;
  field.value = String(Math.max(0, fittja) + Math.max(0, marsta));
}

function wireStockFields() {
  ['fieldStockFittja', 'fieldStockMarsta'].forEach((id) => {
    document.getElementById(id)?.addEventListener('input', syncInventoryField);
  });
}

function resolveColorImageUrl(color) {
  if (color?.imageUrl) return color.imageUrl;
  if (existingImages[0]) return existingImages[0];
  if (pendingImages[0]?.previewUrl) return pendingImages[0].previewUrl;
  return '';
}

function renderColorThumb(imageUrl) {
  if (imageUrl) {
    return `<img src="${escapeHtml(imageUrl)}" alt="" loading="lazy">`;
  }
  return '<span class="admin-color-thumb-empty">Välj bild</span>';
}

function renderColorVariants() {
  const list = document.getElementById('colorVariantsList');
  if (!list) return;

  const imageOptions = getAllImageOptions();
  const imageSelect = (selectedUrl, index) => {
    const options = ['<option value="">Standardbild</option>']
      .concat(
        imageOptions.map(
          (option) =>
            `<option value="${escapeHtml(option.url)}"${option.url === selectedUrl ? ' selected' : ''}>${escapeHtml(option.label)}</option>`,
        ),
      )
      .join('');
    return `<select class="admin-color-image" data-field="image" data-index="${index}" aria-label="Bild för färg">${options}</select>`;
  };

  if (!colorVariants.length) {
    list.innerHTML = '<p class="admin-color-empty">Inga färgvarianter ännu. Lägg till en eller flera färger.</p>';
    syncInventoryField();
    return;
  }

  list.innerHTML = colorVariants
    .map((color, index) => {
      const imageUrl = resolveColorImageUrl(color);
      return `
        <div class="admin-color-row" data-index="${index}">
          <div class="admin-color-thumb" aria-hidden="true">${renderColorThumb(imageUrl)}</div>
          <div class="admin-color-fields">
            <div class="admin-field full">
              <label>Produktbild</label>
              ${imageSelect(color.imageUrl, index)}
            </div>
            <div class="admin-field">
              <label>Färgnamn</label>
              <input type="text" class="admin-color-name" data-field="name" data-index="${index}" value="${escapeHtml(color.name)}" placeholder="t.ex. Svart" required>
            </div>
            <div class="admin-field">
              <label>Lager Fittja</label>
              <input type="number" class="admin-color-stock-fittja" data-field="stockFittja" data-index="${index}" min="0" step="1" value="${Number(color.stockFittja) || 0}">
            </div>
            <div class="admin-field">
              <label>Lager Märsta</label>
              <input type="number" class="admin-color-stock-marsta" data-field="stockMarsta" data-index="${index}" min="0" step="1" value="${Number(color.stockMarsta) || 0}">
            </div>
          </div>
          <button type="button" class="admin-color-remove" data-remove-color="${index}" aria-label="Ta bort färg">×</button>
        </div>`;
    })
    .join('');

  list.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const index = Number(event.target.dataset.index);
      const field = event.target.dataset.field;
      const color = colorVariants[index];
      if (!color) return;

      if (field === 'name') color.name = event.target.value;
      if (field === 'stockFittja') {
        color.stockFittja = Number.parseInt(event.target.value, 10) || 0;
        syncInventoryField();
      }
      if (field === 'stockMarsta') {
        color.stockMarsta = Number.parseInt(event.target.value, 10) || 0;
        syncInventoryField();
      }
      if (field === 'image') {
        color.imageUrl = event.target.value;
        const row = list.querySelector(`.admin-color-row[data-index="${index}"]`);
        const thumb = row?.querySelector('.admin-color-thumb');
        if (thumb) thumb.innerHTML = renderColorThumb(resolveColorImageUrl(color));
      }
    });

    if (input.dataset.field === 'image') {
      input.addEventListener('change', (event) => {
        const index = Number(event.target.dataset.index);
        const color = colorVariants[index];
        if (!color) return;
        color.imageUrl = event.target.value;
        const row = list.querySelector(`.admin-color-row[data-index="${index}"]`);
        const thumb = row?.querySelector('.admin-color-thumb');
        if (thumb) thumb.innerHTML = renderColorThumb(resolveColorImageUrl(color));
      });
    }
  });

  list.querySelectorAll('[data-remove-color]').forEach((btn) => {
    btn.addEventListener('click', () => {
      colorVariants.splice(Number(btn.dataset.removeColor), 1);
      renderColorVariants();
    });
  });

  syncInventoryField();
}

function addColorVariant(data = {}) {
  colorVariants.push({
    id: data.id || crypto.randomUUID(),
    name: data.name || '',
    stockFittja: data.stockFittja ?? 0,
    stockMarsta: data.stockMarsta ?? 0,
    imageUrl: data.imageUrl || existingImages[0] || pendingImages[0]?.previewUrl || '',
  });
  renderColorVariants();
}

function readColorVariants() {
  const rows = document.querySelectorAll('.admin-color-row');
  return [...rows]
    .map((row, index) => {
      const name = row.querySelector('.admin-color-name')?.value.trim() || '';
      if (!name) return null;
      const source = colorVariants[index] || {};
      const stockFittja = Number.parseInt(row.querySelector('.admin-color-stock-fittja')?.value, 10) || 0;
      const stockMarsta = Number.parseInt(row.querySelector('.admin-color-stock-marsta')?.value, 10) || 0;
      return {
        id: source.id || slugifyColorId(name, index),
        name,
        hex: row.querySelector('.admin-color-hex')?.value || '#888888',
        stock: { fittja: stockFittja, marsta: stockMarsta },
        image: row.querySelector('.admin-color-image')?.value || '',
      };
    })
    .filter(Boolean);
}

function wireImageDropZone() {
  const zone = document.getElementById('imageDropZone');
  if (!zone || zone.dataset.dropWired === '1') return;
  zone.dataset.dropWired = '1';

  const prevent = (event) => {
    event.preventDefault();
    event.stopPropagation();
  };

  zone.addEventListener('dragenter', (event) => {
    prevent(event);
    zone.classList.add('is-dragover');
  });

  zone.addEventListener('dragover', (event) => {
    prevent(event);
    if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy';
    zone.classList.add('is-dragover');
  });

  zone.addEventListener('dragleave', (event) => {
    prevent(event);
    if (zone.contains(event.relatedTarget)) return;
    zone.classList.remove('is-dragover');
  });

  zone.addEventListener('drop', (event) => {
    prevent(event);
    zone.classList.remove('is-dragover');

    const fromList = [...(event.dataTransfer?.files || [])];
    if (fromList.length) {
      addImageFiles(fromList);
      return;
    }

    const fromItems = [...(event.dataTransfer?.items || [])]
      .filter((item) => item.kind === 'file')
      .map((item) => item.getAsFile())
      .filter(Boolean);
    addImageFiles(fromItems);
  });
}

function renderImageGallery() {
  const gallery = document.getElementById('imageGallery');
  if (!gallery) return;

  const thumbs = [];

  existingImages.forEach((url, index) => {
    thumbs.push({ src: url, type: 'existing', index });
  });

  pendingImages.forEach((item, index) => {
    thumbs.push({ src: item.previewUrl, type: 'pending', index });
  });

  const tiles = thumbs
    .map((thumb, displayIndex) => {
      const primary = displayIndex === 0;
      return `
        <div class="admin-image-thumb">
          <img src="${escapeHtml(thumb.src)}" alt="Produktbild ${displayIndex + 1}" loading="lazy">
          ${primary ? '<span class="admin-image-primary">Huvudbild</span>' : ''}
          <button type="button" class="admin-image-remove" data-remove="${thumb.type}" data-index="${thumb.index}" aria-label="Ta bort bild">×</button>
        </div>`;
    })
    .join('');

  gallery.innerHTML =
    tiles +
    `
    <button type="button" class="admin-image-add" id="imageAddBtn" aria-label="Lägg till bild">
      <span class="admin-image-icon">📷</span>
      <span>Lägg till bild</span>
      <span class="admin-image-hint">eller dra hit</span>
    </button>`;

  gallery.querySelectorAll('[data-remove]').forEach((btn) => {
    btn.addEventListener('click', (event) => {
      event.stopPropagation();
      const type = btn.dataset.remove;
      const index = Number(btn.dataset.index);
      if (type === 'existing') {
        existingImages.splice(index, 1);
      } else {
        const item = pendingImages[index];
        if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
        pendingImages.splice(index, 1);
      }
      renderImageGallery();
      renderColorVariants();
    });
  });

  document.getElementById('imageAddBtn')?.addEventListener('click', () => {
    document.getElementById('fieldImage').click();
  });
}

function readForm() {
  const title = document.getElementById('fieldTitle').value.trim();
  const category = document.getElementById('fieldCategory').value;
  const brand = document.getElementById('fieldBrand').value.trim();
  const description = document.getElementById('fieldDescription')?.value.trim() || '';
  const sku = document.getElementById('fieldSku').value.trim();
  const barcode = document.getElementById('fieldBarcode').value.trim();
  const price = Number(document.getElementById('fieldPrice').value);
  const stockFittja = Number.parseInt(document.getElementById('fieldStockFittja')?.value, 10) || 0;
  const stockMarsta = Number.parseInt(document.getElementById('fieldStockMarsta')?.value, 10) || 0;
  const inventory = Number.parseInt(document.getElementById('fieldInventory').value, 10);

  if (!title) throw new Error('Ange ett produktnamn.');
  if (!category) throw new Error('Välj en kategori.');
  if (!sku) throw new Error('Ange ett SKU.');
  if (Number.isNaN(price) || price < 0) throw new Error('Ange ett giltigt pris.');
  if (Number.isNaN(inventory) || inventory < 0) throw new Error('Ange ett giltigt lagersaldo.');
  if (colorVariants.length && !readColorVariants().length) {
    throw new Error('Ange minst ett färgnamn eller ta bort färgvarianterna.');
  }

  return {
    title,
    category,
    brand,
    description,
    sku,
    barcode,
    price,
    inventory,
    stock: { fittja: stockFittja, marsta: stockMarsta },
  };
}

async function loadProduct() {
  if (!isEdit) {
    renderImageGallery();
    renderColorVariants();
    return;
  }

  document.getElementById('formLoading').hidden = false;
  try {
    const product = await getProduct(productId);
    if (!product) {
      setFormError('Produkten hittades inte.');
      document.getElementById('productForm').hidden = true;
      return;
    }

    document.getElementById('pageTitle').textContent = 'Redigera produkt';
    document.getElementById('pageSub').textContent = `ID: ${product.id}`;

    loadedProductTitle = product.title || product.name || 'denna produkt';
    document.getElementById('deleteBtn').hidden = false;

    document.getElementById('fieldTitle').value = product.title || product.name || '';
    document.getElementById('fieldSku').value = product.sku || '';
    document.getElementById('fieldBarcode').value = product.barcode || '';
    document.getElementById('fieldPrice').value = product.price ?? '';
    const stock = normalizeStock(product, product.inventory ?? 0);
    document.getElementById('fieldStockFittja').value = stock.fittja;
    document.getElementById('fieldStockMarsta').value = stock.marsta;
    document.getElementById('fieldInventory').value = totalFromStock(stock);
    document.getElementById('fieldBrand').value = product.subtitle || product.brand || '';
    document.getElementById('fieldDescription').value = product.description || '';

    const category =
      product.category ||
      (Array.isArray(product.categories) && product.categories[0]) ||
      'kosmetika';
    const normalized = String(category).toLowerCase();
    const fieldCategory = document.getElementById('fieldCategory');
    if (['har', 'kosmetika', 'mat'].includes(normalized)) {
      fieldCategory.value = normalized;
    } else if (normalized.includes('hår') || normalized.includes('har') || normalized.includes('hårvård')) {
      fieldCategory.value = 'har';
    } else if (normalized.includes('mat') || normalized.includes('krydd')) {
      fieldCategory.value = 'mat';
    } else {
      fieldCategory.value = 'kosmetika';
    }

    existingImages = Array.isArray(product.images) ? [...product.images] : [];
    colorVariants = normalizeColors(product).map((color) => ({
      id: color.id,
      name: color.name,
      hex: color.hex || '#888888',
      stockFittja: color.stock?.fittja ?? 0,
      stockMarsta: color.stock?.marsta ?? 0,
      imageUrl: color.image || '',
    }));
    renderImageGallery();
    renderColorVariants();
  } catch (err) {
    setFormError(`Kunde inte ladda produkten: ${err.message || 'Okänt fel'}`);
    document.getElementById('productForm').hidden = true;
  } finally {
    document.getElementById('formLoading').hidden = true;
  }
}

async function handleSubmit(event) {
  event.preventDefault();
  setFormError('');

  const saveBtn = document.getElementById('saveBtn');
  let fields;

  try {
    fields = readForm();
  } catch (err) {
    setFormError(err.message);
    return;
  }

  if (!totalImageCount()) {
    setFormError('Ladda upp minst en produktbild.');
    return;
  }

  saveBtn.disabled = true;
  saveBtn.textContent = 'Sparar…';

  try {
    const id = await saveProduct(
      productId,
      {
        title: fields.title,
        sku: fields.sku,
        barcode: fields.barcode,
        price: fields.price,
        inventory: fields.inventory,
        stock: fields.stock,
        category: fields.category,
        brand: fields.brand,
        description: fields.description,
        existingImages,
        colors: readColorVariants(),
      },
      pendingImages
        .map((item) => item.file)
        .filter((file) => file && file instanceof Blob),
    );

    pendingImages.forEach((item) => {
      if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
    });
    pendingImages = [];

    window.location.href = `admin-products.html?saved=${encodeURIComponent(id)}`;
  } catch (err) {
    const msg =
      err?.code === 'permission-denied'
        ? 'Åtkomst nekad. Kontrollera att du är inloggad som admin och att Storage/Firestore-reglerna tillåter skrivning.'
        : err?.code === 'storage/unauthorized'
          ? 'Kunde inte ladda upp bilden. Kontrollera Storage-reglerna.'
          : `Kunde inte spara: ${err.message || 'Okänt fel'}`;
    setFormError(msg);
    saveBtn.disabled = false;
    saveBtn.textContent = 'Spara';
  }
}

async function handleDelete() {
  if (!isEdit || !productId) return;
  setFormError('');

  const title = document.getElementById('fieldTitle').value.trim() || loadedProductTitle || 'denna produkt';
  const confirmed = window.confirm(
    `Vill du ta bort produkten «${title}»?\n\nDetta går inte att ångra.`,
  );
  if (!confirmed) return;

  const deleteBtn = document.getElementById('deleteBtn');
  const saveBtn = document.getElementById('saveBtn');
  deleteBtn.disabled = true;
  saveBtn.disabled = true;
  deleteBtn.textContent = 'Tar bort…';

  try {
    await deleteProduct(productId);
    window.location.href = 'admin-products.html?deleted=1';
  } catch (err) {
    const msg =
      err?.code === 'permission-denied'
        ? 'Åtkomst nekad. Kontrollera att du är inloggad som admin.'
        : `Kunde inte ta bort produkten: ${err.message || 'Okänt fel'}`;
    setFormError(msg);
    deleteBtn.disabled = false;
    saveBtn.disabled = false;
    deleteBtn.textContent = 'Ta bort produkt';
  }
}

requireAdmin((user) => {
  document.getElementById('adminLoading').hidden = true;
  document.getElementById('adminContent').hidden = false;
  document.getElementById('adminEmail').textContent = user.email || '';
  wireImageDropZone();
  wireStockFields();
  loadProduct();
});

document.getElementById('adminLogout').addEventListener('click', async () => {
  await signOut(getFirebaseAuth());
  window.location.href = 'index.html';
});

document.getElementById('fieldBarcode').addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  document.getElementById('fieldPrice').focus();
});

document.getElementById('productForm').addEventListener('submit', handleSubmit);

document.getElementById('deleteBtn').addEventListener('click', handleDelete);

document.getElementById('addColorBtn')?.addEventListener('click', () => {
  addColorVariant();
});

document.getElementById('fieldImage').addEventListener('change', (event) => {
  addImageFiles(event.target.files);
  event.target.value = '';
});

window.addEventListener('beforeunload', () => {
  pendingImages.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
});
