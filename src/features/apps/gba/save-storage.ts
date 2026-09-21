import type { GbaSaveRecord } from './types';

const DATABASE_NAME = 'vibe-gba';
const DATABASE_VERSION = 1;
const STORE_NAME = 'saves';

// 打开存档数据库并在首次打开时创建对象仓库
function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === 'undefined') {
    return Promise.reject(new Error('当前浏览器不支持 IndexedDB，无法保存游戏进度。'));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onerror = () => reject(request.error ?? new Error('无法打开存档数据库。'));
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME, { keyPath: 'romHash' });
      }
    };
    request.onsuccess = () => resolve(request.result);
  });
}

// 从 IndexedDB 读取指定 ROM 的存档
export async function loadGbaSave(romHash: string): Promise<GbaSaveRecord | null> {
  const database = await openDatabase();

  return new Promise((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readonly');
    const request = transaction.objectStore(STORE_NAME).get(romHash);
    request.onerror = () => {
      database.close();
      reject(request.error ?? new Error('读取游戏存档失败。'));
    };
    request.onsuccess = () => {
      database.close();
      const value = request.result as GbaSaveRecord | undefined;
      if (!value || !(value.data instanceof ArrayBuffer)) {
        resolve(null);
        return;
      }
      resolve({ ...value, data: value.data.slice(0) });
    };
  });
}

// 将当前游戏存档写入 IndexedDB，并复制字节避免后续内存变化影响记录
export async function saveGbaSave(record: GbaSaveRecord): Promise<void> {
  const database = await openDatabase();

  await new Promise<void>((resolve, reject) => {
    const transaction = database.transaction(STORE_NAME, 'readwrite');
    transaction.objectStore(STORE_NAME).put({ ...record, data: record.data.slice(0) });
    transaction.onerror = () => reject(transaction.error ?? new Error('写入游戏存档失败。'));
    transaction.oncomplete = () => resolve();
  }).finally(() => database.close());
}

// 请求浏览器尽量保留当前站点的 IndexedDB 数据
export async function requestPersistentStorage(): Promise<boolean> {
  if (!navigator.storage?.persist) return false;

  try {
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}
