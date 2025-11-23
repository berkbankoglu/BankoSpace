import { initializeApp } from 'firebase/app';
import { getAuth, GoogleAuthProvider, setPersistence, browserLocalPersistence } from 'firebase/auth';
import { getFirestore } from 'firebase/firestore';

// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAjY7zPq8EKDW5vKujm_FvtJZ3_34UY9eE",
  authDomain: "bankospace.firebaseapp.com",
  projectId: "bankospace",
  storageBucket: "bankospace.firebasestorage.app",
  messagingSenderId: "939497245072",
  appId: "1:939497245072:web:437cf87d46d24de82a0b15"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Firebase Authentication and get a reference to the service
export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// Set persistence to LOCAL (stays logged in even after closing app)
setPersistence(auth, browserLocalPersistence)
  .then(() => {
    console.log('Firebase persistence set to LOCAL');
  })
  .catch((error) => {
    console.error('Error setting persistence:', error);
  });

// Initialize Cloud Firestore and get a reference to the service
export const db = getFirestore(app);

export default app;
