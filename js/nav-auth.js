import { wireNavProfile } from './firebase-auth.js?v=18';

const basePath = window.location.pathname.includes('/products/') ? '../' : '';
wireNavProfile({ basePath });
