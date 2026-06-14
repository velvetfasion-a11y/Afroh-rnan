# Afrohörnan

Afrikansk skönhet, mat och kryddor – webbplats för butikerna i Stockholm Fittja och Uppsala Gottsunda.

## Firebase (login)

1. Copy `.env.example` to `.env`
2. Paste your Firebase web app config from **Firebase Console → Project settings → Your apps**
3. Generate the config file:

```bash
node scripts/generate-firebase-config.mjs
```

This writes `js/firebase-config.js` (safe to commit — Firebase web keys are public and restricted by domain).

`.env` is gitignored and never pushed to GitHub.

## Lokal förhandsvisning

```bash
node scripts/generate-firebase-config.mjs   # if you changed .env
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
