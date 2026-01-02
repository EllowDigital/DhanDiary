type BiometricSessionState = {
  isBiometricEnabled: boolean;
  isBiometricUnlocked: boolean;
  lastUnlockTimestamp: number;
};

type Listener = (s: BiometricSessionState) => void;

let state: BiometricSessionState = {
  isBiometricEnabled: false,
  isBiometricUnlocked: false,
  lastUnlockTimestamp: 0,
};

const listeners = new Set<Listener>();

export const getBiometricSessionState = (): BiometricSessionState => state;

export const subscribeBiometricSession = (listener: Listener) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

const emit = () => {
  try {
    listeners.forEach((l) => {
      try {
        l(state);
      } catch (e) {}
    });
  } catch (e) {}
};

export const setBiometricEnabledSession = (enabled: boolean) => {
  const next = Boolean(enabled);
  if (state.isBiometricEnabled === next) return;
  state = { ...state, isBiometricEnabled: next };
  emit();
};

export const setBiometricUnlockedSession = (unlocked: boolean) => {
  const next = Boolean(unlocked);
  if (state.isBiometricUnlocked === next) return;
  state = {
    ...state,
    isBiometricUnlocked: next,
    lastUnlockTimestamp: next ? Date.now() : 0,
  };
  emit();
};

export const resetBiometricSession = () => {
  if (!state.isBiometricUnlocked && state.lastUnlockTimestamp === 0) return;
  state = { ...state, isBiometricUnlocked: false, lastUnlockTimestamp: 0 };
  emit();
};

export const resetBiometricSessionAll = () => {
  state = { isBiometricEnabled: false, isBiometricUnlocked: false, lastUnlockTimestamp: 0 };
  emit();
};
