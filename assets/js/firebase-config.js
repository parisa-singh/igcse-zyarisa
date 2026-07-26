/* firebase-config.js — cross-device sync configuration.
 *
 * ⚠️ THIS FILE IS PUBLIC. It ships to every visitor's browser and lives in a
 * public GitHub repo. The values below are safe to expose (they are public
 * identifiers, NOT secrets). DO NOT put any personal email addresses here.
 *
 * WHO CAN ACCESS is decided entirely by the Firestore security rules in the
 * Firebase console (see /firestore.rules for the template). The app does NOT
 * keep an email list — after someone signs in with Google, it detects their
 * role by testing what the rules let them do:
 *     can write → editor,  can only read → viewer,  can't read → no access.
 * So the family's emails stay private, only in the console rules.
 *
 * ── TO ADD A PERSON ──────────────────────────────────────────────────────────
 *   Firebase console → Firestore → Rules → add their email to editors() (can
 *   edit) or viewers() (view only) → Publish. Nothing to change in this repo.
 *   Tip: they can sign in once first (they'll be turned away); their email then
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
})();
