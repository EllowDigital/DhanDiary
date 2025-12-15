// src/services/vexo.ts
// Lightweight wrapper around vexo-analytics to allow safe dynamic require
// and to expose a small API for the app to call without crashing in test/Expo Go.

type VexoAPI = {
  (key: string): void;
  identifyDevice?: (id: string | null) => Promise<void> | void;
  enableTracking?: () => Promise<void> | void;
  disableTracking?: () => Promise<void> | void;
  customEvent?: (name: string, payload?: Record<string, any>) => void;
};

let vexoFn: VexoAPI | null = null;
let initialized = false;

const safeRequire = (name: string) => {
  try {
    const req: any = typeof globalThis !== 'undefined' && typeof (globalThis as any).require === 'function'
      ? (globalThis as any).require
      : typeof require === 'function'
        ? require
        : null;
    if (!req) return null;
    return req(name);
  } catch (e) {
    return null;
  }
};

export function initVexo(key?: string | null) {
  if (initialized) return;
  try {
    // dynamic require so missing native module won't crash tests or Expo Go

    const mod: any = safeRequire('vexo-analytics');
    // package may export default or named
    const candidate = (mod && (mod.vexo || mod.default || mod)) as any;
    if (typeof candidate === 'function') {
      vexoFn = candidate as VexoAPI;
      if (key) {
        try {
          vexoFn(key);
        } catch (e) {
          // ignore init errors

          console.warn('vexo init failed', e);
        }
      }
      initialized = true;
    }
  } catch (e) {
    // not installed or native code missing; remain safely non-initialized
    // silence noisy warning in development environments

    console.debug('vexo-analytics not available');
  }
}

export async function identifyDevice(id: string | null) {
  try {
    if (!vexoFn) return;
    // try named export

    const mod: any = safeRequire('vexo-analytics');
    const fn = mod && (mod.identifyDevice || mod.default?.identifyDevice);
    if (typeof fn === 'function') return await fn(id);
    if (typeof vexoFn.identifyDevice === 'function') return await vexoFn.identifyDevice(id);
  } catch (e) {
    // ignore
  }
}

export async function enableTracking() {
  try {
    if (!vexoFn) return;
    const mod: any = safeRequire('vexo-analytics');
    const fn = mod && (mod.enableTracking || mod.default?.enableTracking);
    if (typeof fn === 'function') return await fn();
    if (typeof vexoFn.enableTracking === 'function') return await vexoFn.enableTracking();
  } catch (e) {}
}

export async function disableTracking() {
  try {
    if (!vexoFn) return;
    const mod: any = safeRequire('vexo-analytics');
    const fn = mod && (mod.disableTracking || mod.default?.disableTracking);
    if (typeof fn === 'function') return await fn();
    if (typeof vexoFn.disableTracking === 'function') return await vexoFn.disableTracking();
  } catch (e) {}
}

export function customEvent(name: string, payload?: Record<string, any>) {
  try {
    if (!vexoFn) return;
    const mod: any = safeRequire('vexo-analytics');
    const fn = mod && (mod.customEvent || mod.default?.customEvent);
    if (typeof fn === 'function') return fn(name, payload);
    if (typeof vexoFn.customEvent === 'function') return vexoFn.customEvent(name, payload);
  } catch (e) {
    // ignore
  }
}

export function isInitialized() {
  return initialized;
}

export default {
  initVexo,
  identifyDevice,
  enableTracking,
  disableTracking,
  customEvent,
  isInitialized,
};
