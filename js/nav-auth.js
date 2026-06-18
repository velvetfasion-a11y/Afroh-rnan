import { wireNavProfile } from './firebase-auth.js?v=15';

const basePath = window.location.pathname.includes('/products/') ? '../' : '';
wireNavProfile({ basePath });
