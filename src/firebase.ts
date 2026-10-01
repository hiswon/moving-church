// src/firebase.ts
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

// 화면에 제공된 파이어베이스 설정값
const firebaseConfig = {
  apiKey: "AIzaSyDXMKjK3HTEMxvRm3es9US3ov3IYTXpyUE",
  authDomain: "cweb-ab8f3.firebaseapp.com",
  projectId: "cweb-ab8f3",
  storageBucket: "cweb-ab8f3.firebasestorage.app",
  messagingSenderId: "494231598047",
  appId: "1:494231598047:web:fb3abc1e2961a14c95ca6a",
  measurementId: "G-8GZY7SV0L2"
};

// 파이어베이스 및 Firestore 초기화
const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);