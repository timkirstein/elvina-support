# Elvina – webbplats (elvina.se)

Jekyll-sajt för elvina.se — marknadsföringssida, blogg, integritetspolicy och villkor.
Svensk motsvarighet till savino-support (savino.no). Elvina tillhandahålls av Savino AS.

## Köra lokalt

Kräver Ruby + Bundler.

```bash
bundle install
bundle exec jekyll serve
```

Öppna [http://localhost:4000](http://localhost:4000).

## Publicera

Sajten publiceras automatiskt via **GitHub Actions → GitHub Pages** vid push till `main`
(och dagligen kl. 05 UTC, så att framtidsdaterade inlägg publiceras när datumet passerat).

## Blogginlägg

Lägg Markdown-filer i `_posts/` (`ÅÅÅÅ-MM-DD-slug.md`). Permalänk: `/blogg/:slug/`.
Vinrekommendationer i inläggen (`dish:` i front matter) är avstängda tills
`blogSearchWines` stöder Systembolaget — se `_plugins/wine_fetcher.rb`.

## Att göra innan lansering

- App Store-länk i `_config.yml` (`app_store_url`) när appen är publicerad.
- `web_app_url` = `https://app.elvina.se` (Elvina-webbappen).
- Svenska skärmbilder (`/screenshots/`) och en og-bild (1200x630).
- Egen Meta-pixel / Google Ads (avstängda i `assets/js/`).
- Lägg till `elvina.se` i reCAPTCHA-nyckelns domänlista (App Check för `ref-tracking.js`).
