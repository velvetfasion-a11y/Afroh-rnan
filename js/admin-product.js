import { requireAdmin, signOut, getFirebaseAuth } from './firebase-auth.js';
import { getProduct, saveProduct } from './firebase-db.js';

const params = new URLSearchParams(window.location.search);
const productId = params.get('id');
const isEdit = Boolean(productId);

let existingImages = [];
let previewObjectUrl = null;

function productImage(product) {
  if (Array.isArray(product?.images) && product.images[0]) return product.images[0];
  if (typeof product?.image === 'string' && product.image) return product.image;
  return '';
}

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

function setPreview(url) {
  const img = document.getElementById('imagePreview');
  const placeholder = document.getElementById('imagePlaceholder');
  if (url) {
    img.src = url;
    img.hidden = false;
    placeholder.hidden = true;
  } else {
    img.hidden = true;
    img.removeAttribute('src');
    placeholder.hidden = false;
  }
}

function readForm() {
  const title = document.getElementById('fieldTitle').value.trim();
  const sku = document.getElementById('fieldSku').value.trim();
  const barcode = document.getElementById('fieldBarcode').value.trim();
  const price = Number(document.getElementById('fieldPrice').value);
  const inventory = Number.parseInt(document.getElementById('fieldInventory').value, 10);
  const imageFile = document.getElementById('fieldImage').files[0] || null;

  if (!title) throw new Error('Ange ett produktnamn.');
  if (!sku) throw new Error('Ange ett SKU.');
  if (Number.isNaN(price) || price < 0) throw new Error('Ange ett giltigt pris.');
  if (Number.isNaN(inventory) || inventory < 0) throw new Error('Ange ett giltigt lagersaldo.');

  return { title, sku, barcode, price, inventory, imageFile };
}

async function loadProduct() {
  if (!isEdit) return;

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

    existingImages = Array.isArray(product.images) ? product.images : [];
    const url = productImage(product);
    if (url) setPreview(url);
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

  if (!isEdit && !fields.imageFile && !existingImages.length) {
    setFormError('Ladda upp en produktbild.');
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
        existingImages,
      },
      fields.imageFile,
    );

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
  loadProduct();
});

document.getElementById('adminLogout').addEventListener('click', async () => {
  await signOut(getFirebaseAuth());
  window.location.href = 'index.html';
});

document.getElementById('productForm').addEventListener('submit', handleSubmit);

document.getElementById('fieldImage').addEventListener('change', (event) => {
  const file = event.target.files[0];
  if (previewObjectUrl) {
    URL.revokeObjectURL(previewObjectUrl);
    previewObjectUrl = null;
  }
  if (!file) {
    setPreview(productImage({ images: existingImages }) || '');
    return;
  }
  previewObjectUrl = URL.createObjectURL(file);
  setPreview(previewObjectUrl);
});

document.getElementById('imageUploadArea').addEventListener('click', () => {
  document.getElementById('fieldImage').click();
});

document.getElementById('imageUploadArea').addEventListener('keydown', (event) => {
  if (event.key === 'Enter' || event.key === ' ') {
    event.preventDefault();
    document.getElementById('fieldImage').click();
  }
});
