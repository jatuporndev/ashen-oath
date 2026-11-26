// Firebase project for online co-op (Realtime Database).
// Paste the web-app config from Firebase console → Project settings → Your apps → SDK setup (Config).
// Leave it null to play co-op only through the built-in emulator (tabs of the same browser).
//
// Which backend is used:
//   localhost / 127.0.0.1 / file://      → built-in emulator (never touches the real Firebase)
//   ?net=emu                              → Firebase Local Emulator Suite on 127.0.0.1:9000 (needs Java + `firebase emulators:start`)
//   ?net=firebase  or any other host      → the real project below
window.EW = window.EW || {};
window.EW.FIREBASE_CONFIG = null;
/* example:
window.EW.FIREBASE_CONFIG = {
  apiKey: '...',
  authDomain: 'your-project.firebaseapp.com',
  databaseURL: 'https://your-project-default-rtdb.asia-southeast1.firebasedatabase.app',
  projectId: 'your-project',
  appId: '...',
};
*/
