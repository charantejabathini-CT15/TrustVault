import { initializeApp, getApps, getApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import { getAnalytics } from 'firebase/analytics';

// Your web app's Firebase configuration (Blaze plan enabled)
export const firebaseConfig = {
  apiKey: "AIzaSyCIUnzxw9mjyvwvAyydd4DdoL-vwebOxkQ",
  authDomain: "trustvault-pvt.firebaseapp.com",
  projectId: "trustvault-pvt",
  storageBucket: "trustvault-pvt.firebasestorage.app",
  messagingSenderId: "962218513820",
  appId: "1:962218513820:web:406e9b35fb75c1e4c02459",
  measurementId: "G-DTZ13M3W8T"
};

// Initialize Firebase (singleton safe)
export const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export const storage = getStorage(app);
export const analytics = typeof window !== 'undefined' ? getAnalytics(app) : null;
