import { QueryClient } from '@tanstack/react-query';

let client: QueryClient | null = null;

export const setQueryClient = (qc: QueryClient) => {
  client = qc;
};

export const getQueryClient = (): QueryClient | null => client;

export const clearQueryCache = async () => {
  if (!client) return;
  try {
    await client.cancelQueries();
  } catch (e) {}
  try {
    client.clear();
  } catch (e) {}
};

export default { setQueryClient, getQueryClient, clearQueryCache };
