import { wireNavProfile } from './firebase-auth.js?v=19';

const basePath = window.location.pathname.includes('/products/') ? '../' : '';
wireNavProfile({ basePath });
