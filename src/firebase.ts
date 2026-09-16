import { initializeApp } from "@firebase/app";
import { getFirestore } from "@firebase/firestore";

// 파이어베이스 프로젝트 설정 정보
const firebaseConfig = {
  apiKey: "AIzaSyDXMKjK3HTEMxvRm3es9US3ov3IYTXpyUE",
  authDomain: "cweb-ab8f3.firebaseapp.com",
  databaseURL: "https://cweb-ab8f3-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "cweb-ab8f3",
  storageBucket: "cweb-ab8f3.firebasestorage.app",
  messagingSenderId: "494231598047",
  appId: "1:494231598047:web:5307bfec01f3306a95ca6a",
  measurementId: "G-3RXDNZBVL0"
};

// 파이어베이스 앱 초기화
const app = initializeApp(firebaseConfig);

// 데이터베이스(Firestore) 객체 내보내기 (App.tsx에서 사용함)
export const db = getFirestore(app);