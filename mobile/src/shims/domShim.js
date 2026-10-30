// Browser polyfills for any third-party libs that expect web globals
if (typeof globalThis !== 'undefined') {
  if (typeof globalThis.window === 'undefined') {
    globalThis.window = globalThis;
  }
  if (!globalThis.window.open) {
    const { Linking } = require('react-native');
    globalThis.window.open = (url) => {
      try { Linking.openURL(url).catch(() => {}); } catch (_) {}
    };
  }
  if (!globalThis.window.print) globalThis.window.print = () => {};
  if (!globalThis.document) {
    globalThis.document = {
      createElement: () => ({}),
      body: {},
      addEventListener: () => {},
      removeEventListener: () => {},
    };
  }
  const createMemoryStorage = () => {
    const store = new Map();
    return {
      getItem: (key) => store.get(String(key)) ?? null,
      setItem: (key, val) => store.set(String(key), String(val)),
      removeItem: (key) => store.delete(String(key)),
      clear: () => store.clear(),
      get length() { return store.size; },
      key: (idx) => Array.from(store.keys())[idx] ?? null,
    };
  };
  if (!globalThis.localStorage) globalThis.localStorage = createMemoryStorage();
  if (!globalThis.sessionStorage) globalThis.sessionStorage = createMemoryStorage();
  if (!globalThis.location) globalThis.location = { href: '', reload: () => {} };
}
