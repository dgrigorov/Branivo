import { QueryClient } from '@tanstack/react-query';

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // staleTime: 0 and gcTime: 0 for all quote queries — regulatory requirement
        staleTime: 0,
        gcTime: 0,
        retry: 1,
        refetchOnWindowFocus: false,
      },
    },
  });
}
