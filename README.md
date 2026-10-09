# RVP Webflow

Data, assets and scripts for the Rhapsody Venture Partners Webflow site.

## Structure

```
data/      JSON content the site reads (data/portfolio.json, ...)
js/        Front-end scripts, one file per feature (js/portfolio.js, ...)
assets/    Images and files, grouped by feature (assets/portfolio/logos/, ...)
```

Add new features the same way: `data/<feature>.json`, `js/<feature>.js`, `assets/<feature>/`.

## URLs

Everything is read straight from this repo through raw.githubusercontent.com, so a commit is live on the site within about 5 minutes. No CDN cache to clear.

- Data: `https://raw.githubusercontent.com/deeptechagency/rvp-webflow/main/data/<file>.json`
- Assets: `https://raw.githubusercontent.com/deeptechagency/rvp-webflow/main/assets/<path>`
- Scripts are loaded by a small inline loader (below), since GitHub serves .js as plain text.

## Portfolio

Webflow page code. Head:

```html
<style>[data-cms-layout="cms_list"]:not([data-cms-ready]) > *{visibility:hidden}</style>
```

Before `</body>`:

```html
<script>
(function(d){fetch('https://raw.githubusercontent.com/deeptechagency/rvp-webflow/main/js/portfolio.js',{cache:'no-cache'}).then(function(r){return r.text()}).then(function(t){var s=d.createElement('script');s.textContent=t;d.body.appendChild(s)})})(document);
</script>
```

Edit companies in `data/portfolio.json`:

```json
{
  "name": "Adden Energy",
  "slug": "adden-energy",
  "industries": ["Energy"],
  "exited": false,
  "featured": true,
  "order": 25,
  "url": "https://addenenergy.com/",
  "description": "Card text, about one sentence.",
  "about": ["Full description, one string per paragraph."],
  "logo": "assets/portfolio/logos/adden-energy.png",
  "logoHover": "assets/portfolio/logos/adden-energy-color.png"
}
```

- Companies show in alphabetical order by `name`.
- Filter pills are built from `industries`, so a new industry gets its own pill automatically.
- Use `null` for `logo` / `logoHover` when there is no logo.
- After replacing logo files, bump `assetsVersion` at the top of `data/portfolio.json` so browsers load the new images.
- Logos are 128px tall PNGs (shown at 64px) with the mono and colour versions at identical sizes.

Optional attributes on the `cms_list` element: `data-cms-page-size` (default 9, `0` shows all), `data-cms-animate="false"`, `data-cms-hover="false"`.
Optional on `filter-list`: `data-cms-all-label`, `data-cms-exited-label` (adds an Exited pill).
