# Firebase setup (Squad Central)

Live data can be served from **Firestore** instead of waiting for a `data.json` git push. The site still falls back to `data.json` if Firebase is off or unreachable.

## 1. Register the web app

1. Open [Firebase Console](https://console.firebase.google.com/) → project **squadcentral-12a3d**
2. **Project overview → Add app → Web** (</> icon)
3. App nickname: **Squad Central**
4. Register app (Hosting optional for now)
5. Copy the `firebaseConfig` values into **`firebase-config.js`**
6. Set **`enabled: true`**

## 2. Enable Firestore

1. **Build → Firestore Database → Create database**
2. Start in **production mode**
3. Choose a region (e.g. `asia-southeast1`)
4. Deploy rules from this repo (requires [Firebase CLI](https://firebase.google.com/docs/cli)):

   ```bash
   npm install -g firebase-tools
   firebase login
   firebase use squadcentral-12a3d
   firebase deploy --only firestore:rules
   ```

   Or paste **`firestore.rules`** manually in the console **Rules** tab.

## 3. Enable admin sign-in

1. **Build → Authentication → Get started**
2. **Sign-in method → Email/Password → Enable**
3. **Users → Add user** — create the admin email/password you will use in admin

## 4. Publish data

1. Run **`serve.bat`** → open **admin.html**
2. Log in with your admin PIN
3. **Overview → Publish to Firebase** — sign in with the Firebase admin user
4. Click **Publish live to Firebase**

Visitors load the newest source by **`dataRevision`** (Firebase vs `data.json`).

Publish writes several documents under collection **`published`** (Firestore’s limit is **1 MB per document**):

| Document ID   | Contents                                      |
|---------------|-----------------------------------------------|
| `site`        | leagues, teams, standings, scorers, meta, …   |
| `players`     | `players[]`                                   |
| `matches`     | `matches[]`                                   |
| `transfers`   | `transfers[]`                                 |

If Publish fails with a size error, hard-refresh admin (so the latest `firebase-sync.js` loads) and try again. You can always **Download data.json** and use GitHub Pages as a backup.

## 5. First upload (optional)

If Firestore is empty, use **Publish live to Firebase** in admin (preferred). Manual console import of a single huge `data.json` into `published/site` will hit the 1 MB limit — use admin Publish instead so data is split automatically.

## Load order

1. Built-in seed (`app.js`)
2. **Firestore** `published/site` + chunk docs (`players`, `matches`, `transfers`) if configured
3. **`data.json`** (GitHub Pages)
4. **localStorage** (admin browser only)

## 6. GitHub Pages (required for admin sign-in)

If admin shows **`auth/requests-from-referer-…-are-blocked`** on  
`https://firrdausalii.github.io/SquadCentral/admin.html`, the Firebase **browser API key** only allows localhost.

### A. Google Cloud — API key website restrictions

1. [Google Cloud Console](https://console.cloud.google.com/) → project **squadcentral-12a3d**
2. **APIs & Services → Credentials**
3. Open **Browser key (auto created by Firebase)**
4. **Application restrictions → Websites**
5. **Add** (keep local dev entries):

   ```
   https://firrdausalii.github.io/*
   http://127.0.0.1/*
   http://localhost/*
   ```

6. **Save** — changes can take a few minutes to apply.

### B. Firebase — authorized domain

1. [Firebase Console](https://console.firebase.google.com/) → **Authentication → Settings → Authorized domains**
2. **Add domain:** `firrdausalii.github.io`

Then reload admin and sign in again.

## Security notes

- Client Firebase keys are public by design; protect writes with **Firestore rules** + **Auth**.
- Do not open write access without `request.auth != null`.
- Keep a **`data.json` backup** on GitHub even when using Firebase.
