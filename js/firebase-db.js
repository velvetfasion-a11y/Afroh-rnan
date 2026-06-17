import { initializeApp, getApps } from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-app.js';
import {
  getFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  onSnapshot,
  Timestamp,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-firestore.js';
import {
  getStorage,
  ref,
  uploadBytes,
  getDownloadURL,
} from 'https://www.gstatic.com/firebasejs/11.6.0/firebase-storage.js';
import { isFirebaseConfigured } from './firebase-auth.js';

let db = null;
let storage = null;

function getFirebaseApp() {
  if (!isFirebaseConfigured()) {
    throw new Error('Firebase is not configured.');
  }
  const config = window.firebaseConfig;
  return getApps().length ? getApps()[0] : initializeApp(config);
}

export function getFirestoreDb() {
  if (!db) db = getFirestore(getFirebaseApp());
  return db;
}

export function getFirebaseStorage() {
  if (!storage) storage = getStorage(getFirebaseApp());
  return storage;
}

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

  const payload = {
    title: fields.title,
    sku: fields.sku,
    barcode: fields.barcode,
    price: fields.price,
    inventory: fields.inventory,
    images,
    category: fields.category,
    subtitle: fields.brand || '',
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

function productSortKey(product) {
  const created = product.createdAt;
  if (created?.toMillis) return created.toMillis();
  if (created?.seconds) return created.seconds * 1000;
  if (typeof created === 'number') return created;
  return 0;
}
