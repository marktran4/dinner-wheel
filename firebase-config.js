/*
 * Dinner Wheel sync config.
 *
 * While this is null the app runs in single-phone mode (each phone keeps its
 * own list). To turn on shared sync between phones, create a free Firebase
 * project (see README.md) and replace null with the web-app config object,
 * e.g.:
 *
 * window.FIREBASE_CONFIG = {
 *   apiKey: "...",
 *   authDomain: "dinner-wheel-xxxxx.firebaseapp.com",
 *   databaseURL: "https://dinner-wheel-xxxxx-default-rtdb.asia-southeast1.firebasedatabase.app",
 *   projectId: "dinner-wheel-xxxxx",
 *   storageBucket: "dinner-wheel-xxxxx.appspot.com",
 *   messagingSenderId: "...",
 *   appId: "..."
 * };
 *
 * (This config is safe to publish — Firebase web configs are public by design.
 * Access is limited by the database rules plus the kitchen code in the URL.)
 */
window.FIREBASE_CONFIG = {
  apiKey: "AIzaSyC82HNLrOUK16wDnJhCWFqw4PEk4tbPhak",
  authDomain: "dinner-wheel-7de5f.firebaseapp.com",
  databaseURL: "https://dinner-wheel-7de5f-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "dinner-wheel-7de5f",
  storageBucket: "dinner-wheel-7de5f.firebasestorage.app",
  messagingSenderId: "150821649337",
  appId: "1:150821649337:web:de89845c28b03e6a31d468",
  measurementId: "G-CLP3TXFH1Q"
};
