import { doc, setDoc, getDoc, onSnapshot } from 'firebase/firestore';
import { db } from '../firebase';

export class FirebaseSync {
  constructor(userId) {
    this.userId = userId;
    this.userDocRef = doc(db, 'users', userId);
    this.listeners = [];
  }

  // Save all app data to Firebase
  async saveData(data) {
    try {
      await setDoc(this.userDocRef, {
        todos: data.todos || [],
        goals: data.goals || [],
        reminders: data.reminders || [],
        dailyChecklistItems: data.dailyChecklistItems || [],
        dailyChecklistLastReset: data.dailyChecklistLastReset || new Date().toDateString(),
        achievements: data.achievements || {},
        lastUpdated: new Date().toISOString()
      }, { merge: true });
    } catch (error) {
      console.error('Error saving data to Firebase:', error);
      throw error;
    }
  }

  // Load all app data from Firebase
  async loadData() {
    try {
      const docSnap = await getDoc(this.userDocRef);
      if (docSnap.exists()) {
        return docSnap.data();
      }
      return null;
    } catch (error) {
      console.error('Error loading data from Firebase:', error);
      throw error;
    }
  }

  // Listen to real-time updates
  subscribeToChanges(callback) {
    const unsubscribe = onSnapshot(this.userDocRef, (doc) => {
      if (doc.exists()) {
        callback(doc.data());
      }
    }, (error) => {
      console.error('Error listening to changes:', error);
    });

    this.listeners.push(unsubscribe);
    return unsubscribe;
  }

  // Cleanup listeners
  cleanup() {
    this.listeners.forEach(unsubscribe => unsubscribe());
    this.listeners = [];
  }
}

// Helper function to sync localStorage data to Firebase
export const syncLocalStorageToFirebase = async (userId) => {
  const sync = new FirebaseSync(userId);

  const localData = {
    todos: JSON.parse(localStorage.getItem('todos') || '[]'),
    goals: JSON.parse(localStorage.getItem('goals') || '[]'),
    reminders: JSON.parse(localStorage.getItem('reminders') || '[]'),
    dailyChecklistItems: JSON.parse(localStorage.getItem('dailyChecklistItems') || '[]'),
    dailyChecklistLastReset: localStorage.getItem('dailyChecklistLastReset') || new Date().toDateString(),
    achievements: JSON.parse(localStorage.getItem('achievements') || '{}')
  };

  await sync.saveData(localData);
  return localData;
};

// Helper function to sync Firebase data to localStorage
export const syncFirebaseToLocalStorage = (data) => {
  if (data.todos) localStorage.setItem('todos', JSON.stringify(data.todos));
  if (data.goals) localStorage.setItem('goals', JSON.stringify(data.goals));
  if (data.reminders) localStorage.setItem('reminders', JSON.stringify(data.reminders));
  if (data.dailyChecklistItems) localStorage.setItem('dailyChecklistItems', JSON.stringify(data.dailyChecklistItems));
  if (data.dailyChecklistLastReset) localStorage.setItem('dailyChecklistLastReset', data.dailyChecklistLastReset);
  if (data.achievements) localStorage.setItem('achievements', JSON.stringify(data.achievements));
};
