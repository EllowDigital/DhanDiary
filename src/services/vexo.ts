// vexo removed — noop shim kept so imports won't crash until files are cleaned up.

export function initVexo(_: string | null) {
  // noop
}

export async function identifyDevice(_: string | null) {
  // noop
}

export async function enableTracking() {
  // noop
}

export async function disableTracking() {
  // noop
}

export function customEvent(_name: string, _payload?: Record<string, any>) {
  // noop
}

export function isInitialized() {
  return false;
}

export default {
  initVexo,
  identifyDevice,
  enableTracking,
  disableTracking,
  customEvent,
  isInitialized,
};
