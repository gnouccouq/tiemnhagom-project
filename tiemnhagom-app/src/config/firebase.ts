import { initializeApp, getApps, getApp } from 'firebase/app';
import * as FirebaseAuth from 'firebase/auth';
import type { Auth } from 'firebase/auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getFirestore, Firestore } from 'firebase/firestore';
import { getStorage, FirebaseStorage } from 'firebase/storage';

const firebaseConfig = {
  apiKey: "AIzaSyAl-Hlzfu4naiUMIuwJTnw8bXsDB4wY7zs",
  authDomain: "tiemnhagom-project.firebaseapp.com",
  projectId: "tiemnhagom-project",
  storageBucket: "tiemnhagom-project.firebasestorage.app",
  messagingSenderId: "571834989973",
  appId: "1:571834989973:web:4cf2d4e9aa832327afca9c",
  measurementId: "G-4FNKRZ13JC",
  databaseURL: "https://tiemnhagom-project-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Khởi tạo Firebase App singleton
const app = getApps().length === 0 ? initializeApp(firebaseConfig) : getApp();

// Khởi tạo Auth với AsyncStorage Persistence cho React Native
let auth: FirebaseAuth.Auth;
try {
  const getRNP = (FirebaseAuth as any).getReactNativePersistence;
  if (typeof getRNP === 'function') {
    auth = FirebaseAuth.initializeAuth(app, {
      persistence: getRNP(AsyncStorage),
    });
  } else {
    auth = FirebaseAuth.getAuth(app);
  }
} catch {
  auth = FirebaseAuth.getAuth(app);
}

const db: Firestore = getFirestore(app);
const storage: FirebaseStorage = getStorage(app);

export { app, auth, db, storage, firebaseConfig };
