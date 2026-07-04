# Publishing squad data (data.json)

The site loads data in this order:

1. **Built-in seed** — `app.js` (default squads)
2. **Firestore** — `published/site` (optional; see **FIREBASE.md**)
3. **`data.json`** — committed file (GitHub Pages fallback)
4. **localStorage** — your local admin edits (this browser only)

You do **not** paste export JSON into `app.js`. Use **Firebase** and/or **`data.json`**.

## Workflow (GitHub)

1. Run `serve.bat` and open admin (`http://127.0.0.1:…/admin.html`).
2. Make changes in admin (squads, matchweek, standings, scorers, **Transfers** tab).
3. **Overview → Download data.json**
4. Save the file as `data.json` in the project root (replace the old one).
5. Commit and push to GitHub:

   ```bash
   git add data.json
   git commit -m "Update squad data"
   git push
   ```

6. After GitHub Pages deploys, visitors load the new `data.json`.

## Workflow (Firebase — instant live updates)

See **[FIREBASE.md](./FIREBASE.md)**. After setup: admin **Overview → Publish live to Firebase**.

The site uses whichever source has the higher **`dataRevision`** (Firestore vs `data.json`).

## Notes

- **`file://` does not share data** with `http://127.0.0.1` — always use `serve.bat` for editing.
- If your browser still shows old data after a push, use admin **Reset to published seed** or clear site data for your GitHub URL.
- `app.js` stays the fallback when `data.json` is missing or invalid.
