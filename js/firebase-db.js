import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  onSnapshot,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';
import { getFirebaseApp, getFirestoreDb, isFirebaseConfigured } from './firebase-auth.js';

export { isFirebaseConfigured };

let storage = null;

export function getFirebaseStorage() {
  if (!storage) storage = getStorage(getFirebaseApp());
  return storage;
}

export { getFirestoreDb };

export async function fetchAllProducts() {
  const snap = await getDocs(collection(getFirestoreDb(), 'products'));
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .sort((a, b) => productSortKey(b) - productSortKey(a));
}

export function subscribeAllProducts(onData, onError) {
  return onSnapshot(
    collection(getFirestoreDb(), 'products'),
    (snap) => {
      const products = snap.docs
        .map((d) => ({ id: d.id, ...d.data() }))
        .sort((a, b) => productSortKey(b) - productSortKey(a));
      onData(products);
    },
    (err) => {
      if (onError) onError(err);
    },
  );
}

export async function getProduct(productId) {
  const snap = await getDoc(doc(getFirestoreDb(), 'products', productId));
  if (!snap.exists()) return null;
  return { id: snap.id, ...snap.data() };
}

export async function uploadProductImage(file, productId) {
  if (!file || !(file instanceof Blob)) {
    throw new Error('Ogiltig bildfil.');
  }
  const rawName =
    (typeof file.name === 'string' && file.name.trim()) ||
    `image-${Date.now()}.jpg`;
  const safeName = rawName.replace(/[^a-zA-Z0-9._-]/g, '_');
  const path = `products/${productId}/${Date.now()}-${safeName}`;
  const storageRef = ref(getFirebaseStorage(), path);
  await uploadBytes(storageRef, file);
  return getDownloadURL(storageRef);
}

export async function saveProduct(productId, fields, imageFiles = []) {
  const dbRef = getFirestoreDb();
  const isNew = !productId;
  const docRef = isNew ? doc(collection(dbRef, 'products')) : doc(dbRef, 'products', productId);
  const id = docRef.id;

  let images = [...(fields.existingImages || [])];
  const files = (Array.isArray(imageFiles) ? imageFiles : imageFiles ? [imageFiles] : [])
    .filter((file) => file && file instanceof Blob);
  for (const file of files) {
    const url = await uploadProductImage(file, id);
    images.push(url);
  }

  const colors = Array.isArray(fields.colors)
    ? fields.colors
        .map((color) => {
          const stock = {
            fittja: Math.max(0, Number(color.stock?.fittja ?? color.stockFittja) || 0),
            marsta: Math.max(0, Number(color.stock?.marsta ?? color.stockMarsta) || 0),
          };
          const inventory = (stock.fittja || 0) + (stock.marsta || 0);
          return {
            id: color.id,
            name: color.name,
            hex: color.hex || '',
            sku: color.sku || '',
            price: color.price != null && color.price !== '' ? Number(color.price) : null,
            inventory,
            stock,
            image: color.image || '',
          };
        })
        .filter((color) => color.name)
    : [];

  const productStock = fields.stock
    ? {
        fittja: Math.max(0, Number(fields.stock.fittja) || 0),
        marsta: Math.max(0, Number(fields.stock.marsta) || 0),
      }
    : {
        fittja: Math.max(0, Number(fields.stockFittja) || 0),
        marsta: Math.max(0, Number(fields.stockMarsta) || 0),
      };

  const inventory = colors.length
    ? colors.reduce((sum, color) => sum + Math.max(0, Number(color.inventory) || 0), 0)
    : productStock.fittja + productStock.marsta;

  const payload = {
    title: fields.title,
    sku: fields.sku,
    barcode: fields.barcode,
    price: fields.price,
    inventory,
    stock: productStock,
    images,
    category: fields.category,
    subtitle: fields.brand || '',
    description: fields.description || '',
    colors,
  };

  if (isNew) {
    await setDoc(docRef, {
      ...payload,
      categories: [fields.category],
      totalSold: 0,
      featured: false,
      createdAt: Timestamp.now(),
    });
  } else {
    await updateDoc(docRef, {
      ...payload,
      categories: [fields.category],
    });
  }

  return id;
}

export async function deleteProduct(productId) {
  if (!productId) throw new Error('Inget produkt-ID.');
  await deleteDoc(doc(getFirestoreDb(), 'products', productId));
}

function productSortKey(product) {
  const created = product.createdAt;
  if (created?.toMillis) return created.toMillis();
  if (created?.seconds) return created.seconds * 1000;
  if (typeof created === 'number') return created;
  return 0;
}
