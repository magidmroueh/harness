import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type { ConfigEntry, ConfigFileDetail, ConfigKind, ConfigScope } from "../types";

export function useClaudeConfig(cwd: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return window.api.config.onChanged(() => {
      queryClient.invalidateQueries({ queryKey: ["claude-config"] });
    });
  }, [queryClient]);

  return useQuery<ConfigEntry[]>({
    queryKey: ["claude-config", cwd],
    queryFn: () => window.api.config.list(cwd),
  });
}

export function useClaudeConfigDetail(
  kind: ConfigKind | null,
  scope: ConfigScope | null,
  name: string | null,
  cwd: string | null,
) {
  return useQuery<ConfigFileDetail>({
    queryKey: ["claude-config-detail", kind, scope, name, cwd],
    queryFn: () => window.api.config.read(kind!, scope!, name!, cwd),
    enabled: Boolean(kind && scope && name),
  });
}
