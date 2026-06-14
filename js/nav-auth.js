import { wireNavProfile } from './firebase-auth.js';

const basePath = window.location.pathname.includes('/products/') ? '../' : '';
wireNavProfile({ basePath });
