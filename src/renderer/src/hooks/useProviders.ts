import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { ProviderId, ProviderStatus } from "../types";

export function useProviders() {
  return useQuery<ProviderStatus[]>({
    queryKey: ["providers"],
    queryFn: () => window.api.providers.list(),
  });
}

export function useInstallProvider() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (providerId: ProviderId) => window.api.providers.install(providerId),
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["providers"] });
    },
  });
}
