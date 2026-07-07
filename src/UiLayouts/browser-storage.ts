export function getBrowserLocalStorage(): Storage | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    return window.localStorage ?? null;
  } catch {
    return null;
  }
}

export function readLocalStorageItem(key: string): string | null {
  const storage = getBrowserLocalStorage();
  if (!storage) {
    return null;
  }
  try {
    return storage.getItem(key);
  } catch {
    return null;
  }
}

export function writeLocalStorageItem(key: string, value: string): void {
  const storage = getBrowserLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.setItem(key, value);
  } catch {
    // Storage can be blocked in private/restrictive browsers; persistence is optional.
  }
}

export function removeLocalStorageItem(key: string): void {
  const storage = getBrowserLocalStorage();
  if (!storage) {
    return;
  }
  try {
    storage.removeItem(key);
  } catch {
    // Missing cleanup is safer than breaking the UI shell.
  }
}
