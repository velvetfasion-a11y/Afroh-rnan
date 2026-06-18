import { wireNavProfile } from './firebase-auth.js?v=12';

const basePath = window.location.pathname.includes('/products/') ? '../' : '';
wireNavProfile({ basePath });
