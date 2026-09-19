import { QueryClient } from '@tanstack/react-query';

export const reactQueryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 0,
      refetchOnWindowFocus: false,
      // 30 minutes of stale time
      staleTime: 1000 * 60 * 30,
      // 10 minutes of cache time
      gcTime: 1000 * 60 * 10,
    },
  },
});
