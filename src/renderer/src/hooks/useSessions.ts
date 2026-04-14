import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { ProviderId, Session } from "../types";

export function useSessions(provider: ProviderId = "claude") {
  return useQuery<Session[]>({
    queryKey: ["sessions", provider],
    queryFn: () => window.api.sessions.listAll(provider),
    refetchInterval: 5000,
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (session: Session) =>
      window.api.sessions.delete({ cwd: session.cwd, sessionId: session.sessionId }),
    onMutate: async (session) => {
      await queryClient.cancelQueries({ queryKey: ["sessions"] });
      queryClient.setQueriesData<Session[]>({ queryKey: ["sessions"] }, (old) =>
        old?.filter((s) => s.sessionId !== session.sessionId),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}
