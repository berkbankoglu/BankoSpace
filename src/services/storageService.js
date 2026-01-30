// Local storage service - stores images as base64 in localStorage
class StorageService {
  constructor(userId) {
    this.userId = userId;
    this.storageKey = `reference-images-${userId}`;
  }

  // Get all images from localStorage
  _getImages() {
    const stored = localStorage.getItem(this.storageKey);
    return stored ? JSON.parse(stored) : {};
  }

  // Save images to localStorage
  _saveImages(images) {
    localStorage.setItem(this.storageKey, JSON.stringify(images));
  }

  // Upload image: convert to base64 and store locally
  async uploadImage(file, itemId) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const base64String = reader.result;
        const images = this._getImages();
        images[itemId] = base64String;
        this._saveImages(images);
        resolve(base64String);
      };
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  // Store base64 directly
  async uploadBase64(base64String, itemId) {
    const images = this._getImages();
    images[itemId] = base64String;
    this._saveImages(images);
    return base64String;
  }

  // Delete image from localStorage
  async deleteImage(itemId) {
    try {
      const images = this._getImages();
      delete images[itemId];
      this._saveImages(images);
    } catch (error) {
      console.error('Error deleting image:', error);
    }
  }

  // Get image URL (returns base64 directly)
  getImageUrl(itemId) {
    const images = this._getImages();
    return images[itemId] || null;
  }
}

export default StorageService;
