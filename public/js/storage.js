/* storage.js — CallStorage: IndexedDB helper for storing call summary data & audio blob
 *
 * IndexedDB avoids 5MB sessionStorage limits and safely holds multi-megabyte audio blobs
 * across page navigation from call.html to summary.html.
 */
const CallStorage = (() => {
  const DB_NAME = 'ThreadCallDB';
  const DB_VERSION = 1;
  const STORE_NAME = 'summaries';

  function openDB() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = (e) => resolve(e.target.result);
      request.onerror = (e) => reject(e.target.error);
    });
  }

  async function saveSummary(summaryData) {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readwrite');
        const store = tx.objectStore(STORE_NAME);
        // Force ID to 'latest' so summary screen always reads the most recent call
        summaryData.id = 'latest';
        summaryData.timestamp = Date.now();
        const req = store.put(summaryData);
        req.onsuccess = () => resolve(true);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.error('[CallStorage] Error saving summary:', err);
      // Fallback to sessionStorage if IndexedDB fails
      try {
        const copy = { ...summaryData };
        delete copy.audioBlob; // Blob might fail JSON.stringify in sessionStorage
        sessionStorage.setItem('latestSummary', JSON.stringify(copy));
      } catch (e) {
        console.error('[CallStorage] SessionStorage fallback failed:', e);
      }
      return false;
    }
  }

  async function getLatestSummary() {
    try {
      const db = await openDB();
      return new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, 'readonly');
        const store = tx.objectStore(STORE_NAME);
        const req = store.get('latest');
        req.onsuccess = (e) => resolve(e.target.result || null);
        req.onerror = (e) => reject(e.target.error);
      });
    } catch (err) {
      console.error('[CallStorage] Error fetching summary:', err);
      return null;
    }
  }

  return { saveSummary, getLatestSummary };
})();
