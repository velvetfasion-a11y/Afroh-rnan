import { wireNavProfile } from './firebase-auth.js?v=13';

const basePath = window.location.pathname.includes('/products/') ? '../' : '';
wireNavProfile({ basePath });
