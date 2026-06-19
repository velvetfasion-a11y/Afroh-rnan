import { wireNavProfile } from './firebase-auth.js?v=20';

const basePath = window.location.pathname.includes('/products/') ? '../' : '';
wireNavProfile({ basePath });
