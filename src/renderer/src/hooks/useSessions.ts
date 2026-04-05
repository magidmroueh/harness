import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Session } from "../types";

export function useSessions() {
  return useQuery<Session[]>({
    queryKey: ["sessions"],
    queryFn: () => window.api.sessions.listAll(),
    refetchInterval: 5000,
  });
}

export function useDeleteSession() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (session: Session) =>
      window.api.sessions.delete({ cwd: session.cwd, sessionId: session.sessionId }),
    onMutate: async (session) => {
      // Optimistic update — remove from cache immediately
      await queryClient.cancelQueries({ queryKey: ["sessions"] });
      queryClient.setQueryData<Session[]>(["sessions"], (old) =>
        old?.filter((s) => s.sessionId !== session.sessionId),
      );
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["sessions"] });
    },
  });
}
