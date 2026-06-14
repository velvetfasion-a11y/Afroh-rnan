# Afrohörnan

Afrikansk skönhet, mat och kryddor – webbplats för butikerna i Stockholm Fittja och Uppsala Gottsunda.

## Firebase (login)

1. Copy `.env.example` to `.env`
2. Paste your Firebase web app config and admin email (`VITE_ADMIN_EMAIL`)
3. Generate config files:

```bash
node scripts/generate-env.mjs
```

This writes:
- `js/firebase-config.js` — Firebase connection (safe to commit)
- `js/admin-gate.js` — admin access hash only, **gitignored** (no plaintext email)

`.env` is gitignored and never pushed to GitHub.

### Login flow

| Account | After login |
|---------|-------------|
| Customer | [profile.html](profile.html) — stays logged in |
| Admin (`VITE_ADMIN_EMAIL` in `.env`) | `admin.html` — not linked from the public site |

Admin works with **Google or email/password** as long as the Firebase account uses the admin email.

## Lokal förhandsvisning

```bash
node scripts/generate-env.mjs   # if you changed .env
python3 -m http.server 8000
```

Öppna [http://localhost:8000](http://localhost:8000).

## GitHub Pages (live webbplats)

1. Gå till **Settings → Pages** i repot på GitHub.
2. Under **Build and deployment**, välj **Deploy from a branch**.
3. Branch: **main**, mapp: **/ (root)**.
4. Spara. Efter någon minut finns sidan på:  
   `https://velvetfasion-a11y.github.io/Afroh-rnan/`

## Pusha ändringar

```bash
git add .
git commit -m "Beskriv din ändring"
git push origin main
```
