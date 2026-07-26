/* firebase-sync.js — OPTIONAL cross-device sync for the tracker (window.Sync).
 *
 * Mirrors every tracker to a SHARED Firestore collection so any signed-in,
 * allowlisted person sees the same data live, on any device, anywhere.
 * The tracker keeps working fully offline with localStorage; this layer just
 * pushes/pulls on top. Stays completely DORMANT unless firebase-config.js has a
 * real apiKey — with no config, isConfigured() is false and nothing loads.
 *
 * Data model (one shared space, no per-user split):
 *   trackers/{slug}  = { version, meta, slug, structure, ratings, savedAt, savedBy, updatedAt }
 *   activity/{auto}  = { slug, subjectName, by, greenPct, total, at }   (append-only feed)
 *
 * Roles come from window.SYNC_ALLOWLIST (editors edit, viewers read-only). The
 * REAL enforcement is the Firestore security rules — this is just for UX.
 *
 * Exposes window.Sync:
 *   Sync.isConfigured()                      -> bool (config present?)
 *   Sync.init()                              -> Promise (loads SDK, restores session)
 *   Sync.signIn() / Sync.signOut()           -> Promise
 *   Sync.state()                             -> { ready, signedIn, email, role }
 *   Sync.myEmail()                           -> string|null
 *   Sync.role()                              -> 'editor' | 'viewer' | null
 *   Sync.canWrite()                          -> bool (signed-in editor)
 *   Sync.pushTracker(slug, payload)          -> Promise (editors only)
 *   Sync.deleteTracker(slug)                 -> Promise (editors only)
 *   Sync.logActivity(entry)                  -> Promise (editors only, best-effort)
 *   Sync.subscribe(onDoc, onRemove)          -> unsubscribe fn  (live tracker changes)
 *   Sync.recentActivity(limitN)              -> Promise<[entry]>
 *   Sync.onStatus(cb)                        -> subscribe to state changes
 */
(function () {
  'use strict';

  var SDK = 'https://www.gstatic.com/firebasejs/12.16.0/';

  var cfg = window.FIREBASE_CONFIG || null;
  var allow = window.SYNC_ALLOWLIST || { editors: [], viewers: [] };
  var editors = (allow.editors || []).map(lc);
  var viewers = (allow.viewers || []).map(lc);

  function lc(s) { return String(s || '').trim().toLowerCase(); }
  function isConfigured() {
    return !!(cfg && cfg.apiKey && cfg.apiKey.indexOf('REPLACE') !== 0 && cfg.projectId);
  }

  var fb = null;          // resolved SDK module handles
  var app = null, auth = null, db = null;
  var current = { ready: false, signedIn: false, email: null, role: null };
  var statusCbs = [];
  var initPromise = null;

  function emit() { statusCbs.forEach(function (cb) { try { cb(state()); } catch (e) {} }); }
  function onStatus(cb) { statusCbs.push(cb); if (current.ready) { try { cb(state()); } catch (e) {} } }
  function state() { return { ready: current.ready, signedIn: current.signedIn, email: current.email, role: current.role }; }
  function myEmail() { return current.email; }
  function role() { return current.role; }
  function canWrite() { return current.signedIn && current.role === 'editor'; }

  function roleFor(email) {
    var e = lc(email);
    if (editors.indexOf(e) !== -1) return 'editor';
    if (viewers.indexOf(e) !== -1) return 'viewer';
    return null;
  }

  /* Load the Firebase modular SDK (ESM) via dynamic import — no build step. */
  function loadSDK() {
    return Promise.all([
      import(SDK + 'firebase-app.js'),
      import(SDK + 'firebase-auth.js'),
      import(SDK + 'firebase-firestore.js')
    ]).then(function (mods) {
      fb = { app: mods[0], auth: mods[1], store: mods[2] };
      return fb;
    });
  }

  function init() {
    if (!isConfigured()) return Promise.resolve(state());
    if (initPromise) return initPromise;
    initPromise = loadSDK().then(function () {
      app = fb.app.initializeApp(cfg);
      auth = fb.auth.getAuth(app);
      db = fb.store.getFirestore(app);
      // Persist the session across reloads/devices-of-the-same-browser.
      return fb.auth.setPersistence(auth, fb.auth.browserLocalPersistence).catch(function () {});
    }).then(function () {
      return new Promise(function (resolve) {
        fb.auth.onAuthStateChanged(auth, function (user) {
          if (user && user.email) {
            current.signedIn = true;
            current.email = lc(user.email);
            current.role = roleFor(user.email);
          } else {
            current.signedIn = false; current.email = null; current.role = null;
          }
          current.ready = true;
          emit();
          resolve(state());
        });
      });
    }).catch(function (e) {
      current.ready = true; emit();
      throw e;
    });
    return initPromise;
  }

  function signIn() {
    return init().then(function () {
      var provider = new fb.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return fb.auth.signInWithPopup(auth, provider).then(function (res) {
        var email = res && res.user && res.user.email;
        if (!roleFor(email)) {
          // Signed in with Google fine, but not on the allowlist. Sign back out.
          return fb.auth.signOut(auth).then(function () {
            throw new Error(email + ' is not on the access list yet. Ask the owner to add this address.');
          });
        }
        return state();
      });
    });
  }

  function signOut() {
    if (!auth) return Promise.resolve();
    return fb.auth.signOut(auth);
  }

  /* ---- writes (editors only) --------------------------------------------- */
  function pushTracker(slug, payload) {
    if (!canWrite() || !db) return Promise.resolve();
    var ref = fb.store.doc(db, 'trackers', slug);
    var doc = {
      version: payload.version || 1,
      meta: payload.meta || null,
      slug: slug,
      structure: payload.structure || null,
      ratings: payload.ratings || { topic: {}, objective: {} },
      savedAt: payload.savedAt || new Date().toISOString(),
      savedBy: current.email,
      updatedAt: fb.store.serverTimestamp()
    };
    return fb.store.setDoc(ref, doc).catch(function (e) {
      // Sync is best-effort — a failed push must never break local saving.
      if (window.console) console.warn('[Sync] push failed:', e && e.message);
    });
  }

  function deleteTracker(slug) {
    if (!canWrite() || !db) return Promise.resolve();
    return fb.store.deleteDoc(fb.store.doc(db, 'trackers', slug)).catch(function (e) {
      if (window.console) console.warn('[Sync] delete failed:', e && e.message);
    });
  }

  function logActivity(entry) {
    if (!canWrite() || !db) return Promise.resolve();
    var e = {
      slug: entry.slug || '',
      subjectName: entry.subjectName || '',
      by: current.email,
      greenPct: typeof entry.greenPct === 'number' ? entry.greenPct : null,
      total: typeof entry.total === 'number' ? entry.total : null,
      at: fb.store.serverTimestamp()
    };
    return fb.store.addDoc(fb.store.collection(db, 'activity'), e).catch(function () {});
  }

  /* ---- live reads --------------------------------------------------------- */
  /* onDoc(slug, data) fires per added/changed tracker; onRemove(slug) per delete. */
  function subscribe(onDoc, onRemove) {
    if (!db) return function () {};
    var col = fb.store.collection(db, 'trackers');
    return fb.store.onSnapshot(col, function (snap) {
      snap.docChanges().forEach(function (chg) {
        var data = chg.doc.data();
        var slug = chg.doc.id;
        if (chg.type === 'removed') { if (onRemove) onRemove(slug); }
        else { if (onDoc) onDoc(slug, data); }
      });
    }, function (err) {
      if (window.console) console.warn('[Sync] subscribe error:', err && err.message);
    });
  }

  function recentActivity(limitN) {
    if (!db) return Promise.resolve([]);
    var q = fb.store.query(
      fb.store.collection(db, 'activity'),
      fb.store.orderBy('at', 'desc'),
      fb.store.limit(limitN || 20)
    );
    return fb.store.getDocs(q).then(function (snap) {
      var out = [];
      snap.forEach(function (d) {
        var v = d.data();
        var ts = v.at && v.at.toDate ? v.at.toDate() : null;
        out.push({ slug: v.slug, subjectName: v.subjectName, by: v.by, greenPct: v.greenPct, total: v.total, at: ts });
      });
      return out;
    }).catch(function () { return []; });
  }

  window.Sync = {
    isConfigured: isConfigured,
    init: init,
    signIn: signIn,
    signOut: signOut,
    state: state,
    myEmail: myEmail,
    role: role,
    canWrite: canWrite,
    pushTracker: pushTracker,
    deleteTracker: deleteTracker,
    logActivity: logActivity,
    subscribe: subscribe,
    recentActivity: recentActivity,
    onStatus: onStatus
  };
})();
