/* firebase-sync.js — OPTIONAL cross-device sync for the tracker (window.Sync).
 *
 * Mirrors every tracker to a SHARED Firestore collection so any signed-in,
 * allowlisted person sees the same data live, on any device, anywhere.
 * The tracker keeps working with localStorage; this layer pushes/pulls on top.
 * DORMANT unless firebase-config.js has a real apiKey.
 *
 * PRIVACY: there is NO email list in this (public) code. After Google sign-in the
 * app detects the person's role purely from what the Firestore rules allow:
 *     can write → 'editor',  can only read → 'viewer',  can't read → no access.
 * The real allowlist lives only in the console rules. See /firestore.rules.
 *
 * Data model (one shared space):
 *   trackers/{slug}  = { version, meta, slug, structure, ratings, savedAt, savedBy, updatedAt }
 *   activity/{auto}  = { slug, subjectName, by, greenPct, total, at }
 *   probe/{uid}      = write-only touch used once to detect editor rights
 *
 * Exposes window.Sync:
 *   isConfigured() init() signIn() signOut()
 *   state() -> { ready, signedIn, checking, denied, roleError, email, role }
 *   myEmail() role() canWrite()
 *   pushTracker(slug, payload) deleteTracker(slug) logActivity(entry)
 *   subscribe(onDoc, onRemove) recentActivity(n) onStatus(cb)
 */
(function () {
  'use strict';

  var SDK = 'https://www.gstatic.com/firebasejs/12.16.0/';
  var cfg = window.FIREBASE_CONFIG || null;

  function lc(s) { return String(s || '').trim().toLowerCase(); }
  function isConfigured() {
    return !!(cfg && cfg.apiKey && cfg.apiKey.indexOf('REPLACE') !== 0 && cfg.projectId);
  }

  var fb = null;          // resolved SDK module handles
  var app = null, auth = null, db = null;
  var current = { ready: false, signedIn: false, checking: false, denied: false, roleError: false, email: null, role: null };
  var statusCbs = [];
  var initPromise = null;
  var rolePromise = null;
  var deniedEmail = null;

  function emit() { statusCbs.forEach(function (cb) { try { cb(state()); } catch (e) {} }); }
  function onStatus(cb) { statusCbs.push(cb); if (current.ready) { try { cb(state()); } catch (e) {} } }
  function state() {
    return {
      ready: current.ready, signedIn: current.signedIn, checking: current.checking,
      denied: current.denied, roleError: current.roleError, email: current.email, role: current.role
    };
  }
  function myEmail() { return current.email; }
  function role() { return current.role; }
  function canWrite() { return current.signedIn && current.role === 'editor'; }

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
      return fb.auth.setPersistence(auth, fb.auth.browserLocalPersistence).catch(function () {});
    }).then(function () {
      return new Promise(function (resolve) {
        fb.auth.onAuthStateChanged(auth, function (user) {
          if (user && user.email) {
            current.signedIn = true; current.email = lc(user.email);
            current.role = null; current.denied = false; current.roleError = false; current.ready = true;
            emit();
            ensureRole().catch(function () {}); // role resolves async, emits again
          } else {
            current.signedIn = false; current.email = null; current.role = null;
            current.checking = false; current.roleError = false; current.ready = true;
            emit();
          }
          resolve(state());
        });
      });
    }).catch(function (e) {
      current.ready = true; emit();
      throw e;
    });
    return initPromise;
  }

  /* Detect role from permissions: read allowed? then editor if a probe write works. */
  function detectRole() {
    var trackers = fb.store.collection(db, 'trackers');
    return fb.store.getDocs(fb.store.query(trackers, fb.store.limit(1)))
      .then(function () {
        // Reading works → at least a viewer. Test write to decide editor vs viewer.
        var uid = auth.currentUser && auth.currentUser.uid;
        return fb.store.setDoc(fb.store.doc(db, 'probe', uid), { at: fb.store.serverTimestamp() })
          .then(function () { return 'editor'; })
          .catch(function () { return 'viewer'; });
      })
      .catch(function (err) {
        var m = ((err && err.code) || '') + ' ' + ((err && err.message) || '');
        if (/permission|insufficient|denied/i.test(m)) return null; // not on the allowlist
        throw err; // network/other — don't wrongly deny
      });
  }

  /* Single-flight role resolution for the current session. */
  function ensureRole() {
    if (!current.signedIn) return Promise.resolve(null);
    if (current.role) return Promise.resolve(current.role);
    if (rolePromise) return rolePromise;
    current.checking = true; current.roleError = false; emit();
    rolePromise = detectRole().then(function (r) {
      current.checking = false; rolePromise = null;
      if (!r) {
        deniedEmail = current.email; current.denied = true;
        return fb.auth.signOut(auth).then(function () { return null; }); // triggers signed-out state
      }
      current.role = r; emit();
      return r;
    }).catch(function (err) {
      current.checking = false; current.roleError = true; rolePromise = null; emit();
      throw err;
    });
    return rolePromise;
  }

  function signIn() {
    return init().then(function () {
      var provider = new fb.auth.GoogleAuthProvider();
      provider.setCustomParameters({ prompt: 'select_account' });
      return fb.auth.signInWithPopup(auth, provider);
    }).then(function () {
      return ensureRole().then(function (r) {
        if (!r) throw new Error((deniedEmail || 'That account') + ' isn’t on the access list yet. Ask whoever set this up to add your email.');
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
    var docData = {
      version: payload.version || 1,
      meta: payload.meta || null,
      slug: slug,
      structure: payload.structure || null,
      ratings: payload.ratings || { topic: {}, objective: {} },
      savedAt: payload.savedAt || new Date().toISOString(),
      savedBy: current.email,
      updatedAt: fb.store.serverTimestamp()
    };
    return fb.store.setDoc(fb.store.doc(db, 'trackers', slug), docData).catch(function (e) {
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
      slug: entry.slug || '', subjectName: entry.subjectName || '', by: current.email,
      greenPct: typeof entry.greenPct === 'number' ? entry.greenPct : null,
      total: typeof entry.total === 'number' ? entry.total : null,
      at: fb.store.serverTimestamp()
    };
    return fb.store.addDoc(fb.store.collection(db, 'activity'), e).catch(function () {});
  }

  /* ---- live reads --------------------------------------------------------- */
  function subscribe(onDoc, onRemove) {
    if (!db) return function () {};
    var col = fb.store.collection(db, 'trackers');
    return fb.store.onSnapshot(col, function (snap) {
      snap.docChanges().forEach(function (chg) {
        var slug = chg.doc.id;
        if (chg.type === 'removed') { if (onRemove) onRemove(slug); }
        else { if (onDoc) onDoc(slug, chg.doc.data()); }
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
    isConfigured: isConfigured, init: init, signIn: signIn, signOut: signOut,
    retryRole: ensureRole,
    state: state, myEmail: myEmail, role: role, canWrite: canWrite,
    pushTracker: pushTracker, deleteTracker: deleteTracker, logActivity: logActivity,
    subscribe: subscribe, recentActivity: recentActivity, onStatus: onStatus
  };
})();
