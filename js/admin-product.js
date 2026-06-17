import { requireAdmin, signOut, getFirebaseAuth } from './firebase-auth.js';
import { getProduct, saveProduct } from './firebase-db.js';

const params = new URLSearchParams(window.location.search);
const productId = params.get('id');
const isEdit = Boolean(productId);

let existingImages = [];
let pendingImages = [];

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

  if (added) renderImageGallery();
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
  const sku = document.getElementById('fieldSku').value.trim();
  const barcode = document.getElementById('fieldBarcode').value.trim();
  const price = Number(document.getElementById('fieldPrice').value);
  const inventory = Number.parseInt(document.getElementById('fieldInventory').value, 10);

  if (!title) throw new Error('Ange ett produktnamn.');
  if (!category) throw new Error('Välj en kategori.');
  if (!sku) throw new Error('Ange ett SKU.');
  if (Number.isNaN(price) || price < 0) throw new Error('Ange ett giltigt pris.');
  if (Number.isNaN(inventory) || inventory < 0) throw new Error('Ange ett giltigt lagersaldo.');

  return { title, category, brand, sku, barcode, price, inventory };
}

async function loadProduct() {
  if (!isEdit) {
    renderImageGallery();
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

    document.getElementById('fieldTitle').value = product.title || product.name || '';
    document.getElementById('fieldSku').value = product.sku || '';
    document.getElementById('fieldBarcode').value = product.barcode || '';
    document.getElementById('fieldPrice').value = product.price ?? '';
    document.getElementById('fieldInventory').value = product.inventory ?? 0;
    document.getElementById('fieldBrand').value = product.subtitle || product.brand || '';

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
    renderImageGallery();
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
        category: fields.category,
        brand: fields.brand,
        existingImages,
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

requireAdmin((user) => {
  document.getElementById('adminLoading').hidden = true;
  document.getElementById('adminContent').hidden = false;
  document.getElementById('adminEmail').textContent = user.email || '';
  wireImageDropZone();
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

document.getElementById('fieldImage').addEventListener('change', (event) => {
  addImageFiles(event.target.files);
  event.target.value = '';
});

window.addEventListener('beforeunload', () => {
  pendingImages.forEach((item) => {
    if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
  });
});
