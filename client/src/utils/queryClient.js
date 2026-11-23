import { QueryClient } from '@tanstack/react-query';

export const QUERY_CACHE_KEY = 'ims_query_cache';
export const QUERY_CACHE_BUSTER = 'ims-v2-category-workflow';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,       // 5 minutes — no background refetch if data is fresh
      gcTime: 1000 * 60 * 60 * 24,    // 24 hours — keep cache alive in sessionStorage
      retry: 1,
    },
  },
});

export function resetQueryCache() {
  queryClient.clear();
  try {
    sessionStorage.removeItem(QUERY_CACHE_KEY);
  } catch {
    // ignore storage errors
  }
}
