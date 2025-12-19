import { useAuthContext } from '../auth/AuthContext';

// Re-export the context-based hook so existing imports remain valid.
export const useAuth = () => {
  const { status, user, error } = useAuthContext();
  return { user, loading: status === 'loading', status, error };
};
