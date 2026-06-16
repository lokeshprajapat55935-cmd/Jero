import { initializeApp, getApps, getApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyAkR_OfIWsN8mtJQiIee9ZO7MuSJ98zhes",
  authDomain: "apnora-fc153.firebaseapp.com",
  projectId: "apnora-fc153",
  storageBucket: "apnora-fc153.firebasestorage.app",
  messagingSenderId: "357759516440",
  appId: "1:357759516440:web:05c029a6b8d82b8326e86d",
  measurementId: "G-EE8BWJTNH3"
};

export const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();
export const auth = getAuth(app);
