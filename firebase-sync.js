/**
 * Firebase Firestore sync — published site data at published/site.
 */
(function (global) {
  const PUBLISHED_DOC = ["published", "site"];

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

  function docRef() {
    if (!db) return null;
    return db.collection(PUBLISHED_DOC[0]).doc(PUBLISHED_DOC[1]);
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
    if (!ok || !docRef()) return null;
    const snap = await docRef().get();
    if (!snap.exists) return null;
    const data = snap.data();
    if (!data || typeof data !== "object") return null;
    return restoreFromFirestore(data);
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
    if (!docRef()) throw new Error("Firestore is not available.");
    const body = sanitizeForFirestore({
      ...payload,
      dataRevision: Date.now(),
      publishedAt: Date.now(),
    });
    await docRef().set(body);
    return restoreFromFirestore(body);
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
