import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

// Your web app's Firebase configuration
export const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || "AIzaSyCIUnzxw9mjyvwvAyydd4DdoL-vwebOxkQ",
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || "trustvault-pvt.firebaseapp.com",
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || "trustvault-pvt",
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || "trustvault-pvt.firebasestorage.app",
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || "962218513820",
  appId: import.meta.env.VITE_FIREBASE_APP_ID || "1:962218513820:web:406e9b35fb75c1e4c02459",
  measurementId: import.meta.env.VITE_FIREBASE_MEASUREMENT_ID || "G-DTZ13M3W8T"
};

// Initialize Firebase (singleton safe)
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
