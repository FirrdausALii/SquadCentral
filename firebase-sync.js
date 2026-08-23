/**
 * Firebase Firestore sync — published site data.
 * Split across docs under `published/` so each stays under Firestore's 1 MiB limit:
 *   site       — leagues, teams, standings, meta, …
 *   players    — players[]
 *   matches    — matches[]
 *   transfers  — transfers[]
 */
(function (global) {
  const PUBLISHED_COL = "published";
  const SITE_DOC = "site";
  /** Large arrays live in their own docs (same collection). */
  const CHUNK_DOCS = ["players", "matches", "transfers"];

  let app = null;
  let db = null;
  let auth = null;
  let initPromise = null;

  function config() {
    return global.FC_FIREBASE_CONFIG ?? {};
  }

  function isConfigured() {
    const c = config();
    return Boolean(c.enabled && c.apiKey && c.projectId && c.appId);
  }

  function col() {
    if (!db) return null;
    return db.collection(PUBLISHED_COL);
  }

  function siteRef() {
    return col()?.doc(SITE_DOC) ?? null;
  }

  function chunkRef(name) {
    return col()?.doc(name) ?? null;
  }

  /** Firestore rejects arrays that contain other arrays (standings/scorer rows). */
  function sanitizeForFirestore(value) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      if (value.some(Array.isArray)) {
        return value.map((row) =>
          Array.isArray(row) ? { __fcTuple: row.map(sanitizeForFirestore) } : sanitizeForFirestore(row),
        );
      }
      return value.map(sanitizeForFirestore);
    }
    if (typeof value === "object") {
      const out = {};
      for (const [key, nested] of Object.entries(value)) {
        out[key] = sanitizeForFirestore(nested);
      }
      return out;
    }
    return value;
  }

  function restoreFromFirestore(value) {
    if (value === null || value === undefined) return value;
    if (Array.isArray(value)) {
      return value.map(restoreFromFirestore);
    }
    if (typeof value === "object") {
      if (Array.isArray(value.__fcTuple)) {
        return value.__fcTuple.map(restoreFromFirestore);
      }
      const out = {};
      for (const [key, nested] of Object.entries(value)) {
        out[key] = restoreFromFirestore(nested);
      }
      return out;
    }
    return value;
  }

  function utf8Size(value) {
    try {
      return new TextEncoder().encode(JSON.stringify(value)).length;
    } catch {
      return 0;
    }
  }

  function sizeLimitError(docId, bytes) {
    const kb = Math.round(bytes / 1024);
    return new Error(
      `Firebase publish blocked: document published/${docId} is ~${kb} KB (limit 1024 KB).\n\n` +
        "Your squad data grew past Firestore’s single-document size limit.\n" +
        "Try Publish again after a refresh — large lists are now split across documents.\n" +
        "If it still fails, download data.json and use GitHub Pages until we can trim unused fields.",
    );
  }

  function assertUnderLimit(docId, body) {
    const bytes = utf8Size(body);
    // Stay a little under 1 MiB for Firestore metadata overhead.
    if (bytes > 1_000_000) throw sizeLimitError(docId, bytes);
    return bytes;
  }

  function init() {
    if (!isConfigured()) return Promise.resolve(false);
    if (initPromise) return initPromise;
    initPromise = (async () => {
      if (typeof firebase === "undefined") {
        console.warn("FCFirebase: Firebase SDK not loaded.");
        return false;
      }
      const c = config();
      if (!global.__FC_FIREBASE_APP__) {
        global.__FC_FIREBASE_APP__ = firebase.initializeApp(c);
      }
      app = global.__FC_FIREBASE_APP__;
      db = firebase.firestore();
      auth = firebase.auth();
      return true;
    })().catch((err) => {
      console.warn("FCFirebase init failed:", err);
      initPromise = null;
      return false;
    });
    return initPromise;
  }

  async function fetchPublished() {
    if (!isConfigured()) return null;
    const ok = await init();
    if (!ok || !siteRef()) return null;
    const siteSnap = await siteRef().get();
    if (!siteSnap.exists) return null;
    const data = restoreFromFirestore(siteSnap.data());
    if (!data || typeof data !== "object") return null;

    // Merge chunk docs (new layout). Older single-doc publishes already include these keys.
    const chunkSnaps = await Promise.all(CHUNK_DOCS.map((name) => chunkRef(name).get()));
    for (let i = 0; i < CHUNK_DOCS.length; i += 1) {
      const name = CHUNK_DOCS[i];
      const snap = chunkSnaps[i];
      if (!snap?.exists) continue;
      const chunk = restoreFromFirestore(snap.data());
      if (!chunk || typeof chunk !== "object") continue;
      if (chunk[name] != null) data[name] = chunk[name];
    }

    return data;
  }

  function currentUser() {
    return auth?.currentUser ?? null;
  }

  function isSignedIn() {
    return Boolean(currentUser());
  }

  async function signIn(email, password) {
    if (!isConfigured()) throw new Error("Firebase is not configured.");
    await init();
    if (!auth) throw new Error("Firebase Auth failed to load.");
    const cred = await auth.signInWithEmailAndPassword(String(email).trim(), String(password));
    return cred.user;
  }

  async function signOut() {
    if (!auth) return;
    await auth.signOut();
  }

  async function publishState(payload) {
    if (!isConfigured()) throw new Error("Firebase is not configured.");
    await init();
    if (!isSignedIn()) throw new Error("Sign in to Firebase before publishing.");
    if (!siteRef()) throw new Error("Firestore is not available.");

    const revision = Date.now();
    const sanitized = sanitizeForFirestore({
      ...payload,
      dataRevision: revision,
      publishedAt: revision,
    });

    const siteBody = { ...sanitized };
    const writes = [];

    for (const name of CHUNK_DOCS) {
      if (siteBody[name] == null) continue;
      const chunkBody = {
        dataRevision: revision,
        publishedAt: revision,
        [name]: siteBody[name],
      };
      assertUnderLimit(name, chunkBody);
      writes.push(chunkRef(name).set(chunkBody));
      // Keep site doc lean — chunks are the source of truth after publish.
      delete siteBody[name];
    }

    assertUnderLimit(SITE_DOC, siteBody);
    writes.push(siteRef().set(siteBody));
    await Promise.all(writes);

    // Reassemble for callers that expect a full payload.
    const merged = { ...siteBody };
    for (const name of CHUNK_DOCS) {
      if (sanitized[name] != null) merged[name] = sanitized[name];
    }
    return restoreFromFirestore(merged);
  }

  function onAuthChange(callback) {
    if (!isConfigured()) return () => {};
    let unsubscribe = () => {};
    init().then((ok) => {
      if (ok && auth) unsubscribe = auth.onAuthStateChanged(callback);
    });
    return () => unsubscribe();
  }

  function statusLabel() {
    if (!isConfigured()) return "Not configured — edit firebase-config.js";
    if (!isSignedIn()) return "Configured · sign in to publish";
    const email = currentUser()?.email ?? "Admin";
    return `Signed in as ${email}`;
  }

  function formatAuthError(err) {
    const code = err?.code ?? "";
    const msg = err?.message ?? String(err ?? "Firebase sign-in failed");
    const host = typeof location !== "undefined" ? location.hostname : "your-site.github.io";

    if (code.includes("requests-from-referer") || msg.includes("requests-from-referer")) {
      return (
        "This domain is blocked by your Google Cloud API key.\n\n" +
        "Google Cloud Console → APIs & Services → Credentials → " +
        '"Browser key (auto created by Firebase)" → Application restrictions → Websites.\n\n' +
        "Add these referrers, then Save:\n" +
        `  https://${host}/*\n` +
        "  http://127.0.0.1/*\n" +
        "  http://localhost/*\n\n" +
        `Also add ${host} in Firebase Console → Authentication → Settings → Authorized domains.\n\n` +
        "See FIREBASE.md section 6."
      );
    }

    if (code === "auth/unauthorized-domain") {
      return (
        `${host} is not an authorized domain.\n\n` +
        "Firebase Console → Authentication → Settings → Authorized domains → Add domain:\n" +
        `  ${host}`
      );
    }

    if (/exceeds the maximum allowed size|cannot be written because its size/i.test(msg)) {
      return (
        "Firestore document is over the 1 MB limit.\n\n" +
        "Hard-refresh admin and Publish again — large lists are split across published/site, " +
        "published/players, published/matches, and published/transfers.\n\n" +
        "Meanwhile you can still Download data.json and push to GitHub Pages."
      );
    }

    return msg;
  }

  global.FCFirebase = {
    init,
    isConfigured,
    fetchPublished,
    publishState,
    signIn,
    signOut,
    isSignedIn,
    currentUser,
    onAuthChange,
    statusLabel,
    formatAuthError,
  };
})(typeof window !== "undefined" ? window : globalThis);
