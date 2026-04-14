import { useEffect } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ConfigEntry,
  ConfigFileDetail,
  ConfigKind,
  ConfigScope,
  ProviderId,
} from "../types";

export type ConfigProvider = ProviderId;

export function useClaudeConfig(provider: ConfigProvider, cwd: string | null) {
  const queryClient = useQueryClient();

  useEffect(() => {
    return window.api.config.onChanged(() => {
      queryClient.invalidateQueries({ queryKey: ["claude-config"] });
    });
  }, [queryClient]);

  return useQuery<ConfigEntry[]>({
    queryKey: ["claude-config", provider, cwd],
    queryFn: () => window.api.config.list(provider, cwd),
  });
}

export function useClaudeConfigDetail(
  provider: ConfigProvider,
  kind: ConfigKind | null,
  scope: ConfigScope | null,
  name: string | null,
  cwd: string | null,
) {
  return useQuery<ConfigFileDetail>({
    queryKey: ["claude-config-detail", provider, kind, scope, name, cwd],
    queryFn: () => window.api.config.read(provider, kind!, scope!, name!, cwd),
    enabled: Boolean(kind && scope && name),
  });
}
