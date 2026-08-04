import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60 * 5,       // 5 minutes — no background refetch if data is fresh
      gcTime: 1000 * 60 * 60 * 24,    // 24 hours — keep cache alive in localStorage
      retry: 1,
    },
  },
});
