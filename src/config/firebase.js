// Firebase configuration and initialization
import { initializeApp } from 'firebase/app';
import { getAuth, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { initializeFirestore, persistentLocalCache, persistentMultipleTabManager } from 'firebase/firestore';

const rawConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Validation
const requiredKeys = [
    'apiKey', 'authDomain', 'projectId', 'storageBucket', 'messagingSenderId', 'appId'
];

const missingKeys = requiredKeys.filter(key => !rawConfig[key]);
export const isFirebaseConfigured = missingKeys.length === 0;

if (!isFirebaseConfigured) {
    console.warn(`[ALTYFLIX] Clés Firebase non configurées (${missingKeys.join(', ')}). La connexion est désactivée tant que la configuration est incomplète.`);
}

// Fallback config to prevent Firebase initialization crash if env vars are unset
const firebaseConfig = {
    apiKey: rawConfig.apiKey || 'AIzaSyFakeKeyForDemoAndStaticBuildOnly',
    authDomain: rawConfig.authDomain || 'altyflix-streaming.firebaseapp.com',
    projectId: rawConfig.projectId || 'altyflix-streaming',
    storageBucket: rawConfig.storageBucket || 'altyflix-streaming.appspot.com',
    messagingSenderId: rawConfig.messagingSenderId || '123456789012',
    appId: rawConfig.appId || '1:123456789012:web:abcdef1234567890',
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase services
export const auth = getAuth(app);
export const db = initializeFirestore(app, {
    localCache: persistentLocalCache({
        tabManager: persistentMultipleTabManager()
    })
});

// Enforce local session persistence explicitly
setPersistence(auth, browserLocalPersistence)
    .catch((error) => console.error("Firebase persistence error:", error));

export default app;
