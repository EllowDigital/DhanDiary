import { syncPending } from '../src/services/syncManager';
import NetInfo from '@react-native-community/netinfo';
import { getUnsyncedEntries } from '../src/db/localDb';

jest.mock('@react-native-community/netinfo');
jest.mock('../src/db/localDb');
jest.mock('../src/api/neonClient');

describe('syncManager', () => {
  it('does nothing if offline', async () => {
    (NetInfo.fetch as jest.Mock).mockResolvedValue({ isConnected: false });
    await syncPending();
    expect(getUnsyncedEntries).not.toHaveBeenCalled();
  });
});
