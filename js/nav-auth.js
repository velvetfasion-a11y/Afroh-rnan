import { wireNavProfile } from './firebase-auth.js?v=10';

const basePath = window.location.pathname.includes('/products/') ? '../' : '';
wireNavProfile({ basePath });
