/* firebase-config.js — cross-device sync configuration.
 *
 * This holds the Firebase web config (safe to ship in client code — these are
 * public identifiers, NOT secrets; real security lives in the Firestore rules)
 * plus the email allowlists that decide who can do what.
 *
 * ── HOW ACCESS WORKS ─────────────────────────────────────────────────────────
 *   editors : sign in with Google → can VIEW and EDIT every tracker + write activity.
 *   viewers : sign in with Google → can VIEW everything, read-only (e.g. parents).
 *   anyone else : bounced, sees nothing.
 *
 * The lists below are the SOURCE OF TRUTH FOR THE UI ONLY (so the app can show
 * "read-only" nicely). The ACTUAL enforcement is the Firestore security rules in
 * /firestore.rules — whenever you change these lists, make the SAME change there
 * and re-publish the rules in the Firebase console, or it won't take effect.
 *
 * ── TO ADD A PERSON ──────────────────────────────────────────────────────────
 *   1. Add their Gmail to editors[] (can edit) or viewers[] (view only) below.
 *   2. Add the same email to the matching list in /firestore.rules.
 *   3. In the Firebase console → Firestore → Rules → paste → Publish.
 *   Tip: they can sign in once first (they'll be bounced); their email then
 *   appears in Firebase console → Authentication → Users, ready to copy.
 */
(function () {
  'use strict';

  // Paste from Firebase console → Project settings ⚙ → Your apps → Web app.
  window.FIREBASE_CONFIG = {
    apiKey: "AIzaSyDW1DnFYuxA7PQwE6CH3grnRmVxBN2Qa84",
    authDomain: "igcse-zyarisa.firebaseapp.com",
    projectId: "igcse-zyarisa",
    storageBucket: "igcse-zyarisa.firebasestorage.app",
    messagingSenderId: "62637365031",
    appId: "1:62637365031:web:589cd5b2984ae43b68fb02",
    measurementId: "G-72Y06PR5F7"
  };

  // Lowercase the emails. Keep in sync with /firestore.rules.
  window.SYNC_ALLOWLIST = {
    // Can view AND edit trackers (you + your sister).
    editors: [
      "parisasingh@gmail.com"                  // ← you (the owner).
      // , "her-new-gmail@gmail.com"           // ← your sister, once you have her new address.
    ],
    // View only — sees all trackers/progress, cannot change anything (parents).
    viewers: [
      // "mom@gmail.com",
      // "dad@gmail.com"
    ]
  };
})();
