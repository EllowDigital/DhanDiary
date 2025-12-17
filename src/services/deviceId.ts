import AsyncStorage from '@react-native-async-storage/async-storage';
import { v4 as uuidv4 } from 'uuid';

const KEY = 'localdb:deviceId';

export async function getDeviceId(): Promise<string> {
  try {
    const v = await AsyncStorage.getItem(KEY);
    if (v) return v;
    const id = uuidv4();
    await AsyncStorage.setItem(KEY, id);
    return id;
  } catch (e) {
    // fallback to random uuid sync
    return uuidv4();
  }
}

export default getDeviceId;
