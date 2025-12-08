import { ref, uploadBytes, getDownloadURL, deleteObject } from 'firebase/storage';
import { storage } from '../firebase';

class StorageService {
  constructor(userId) {
    this.userId = userId;
    this.basePath = `users/${userId}/reference-images`;
  }

  async uploadImage(file, itemId) {
    const storageRef = ref(storage, `${this.basePath}/${itemId}`);
    await uploadBytes(storageRef, file);
    const url = await getDownloadURL(storageRef);
    return url;
  }

  async uploadBase64(base64String, itemId) {
    // Base64'ü blob'a çevir
    const response = await fetch(base64String);
    const blob = await response.blob();
    return this.uploadImage(blob, itemId);
  }

  async deleteImage(itemId) {
    const storageRef = ref(storage, `${this.basePath}/${itemId}`);
    try {
      await deleteObject(storageRef);
    } catch (error) {
      console.error('Error deleting image:', error);
    }
  }
}

export default StorageService;
