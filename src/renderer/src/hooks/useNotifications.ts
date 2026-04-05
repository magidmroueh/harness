import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { AttentionEvent } from "../types";

const MAX_NOTIFICATIONS = 100;

export function useNotifications(
  activeTerminalId: string | null,
  onFocusTerminal?: (terminalId: string) => void,
) {
  const [notifications, setNotifications] = useState<AttentionEvent[]>([]);
  const activeRef = useRef(activeTerminalId);
  activeRef.current = activeTerminalId;
  const focusCbRef = useRef(onFocusTerminal);
  focusCbRef.current = onFocusTerminal;

  useEffect(() => {
    return window.api.notifications.onAttention((raw) => {
      const event: AttentionEvent = {
        ...raw,
        type: raw.type as AttentionEvent["type"],
        dismissed: raw.terminalId === activeRef.current,
      };
      setNotifications((prev) => [event, ...prev].slice(0, MAX_NOTIFICATIONS));
    });
  }, []);

  // When active terminal changes, suppress/unsuppress and dismiss its notifications
  useEffect(() => {
    if (activeTerminalId) {
      window.api.notifications.suppress(activeTerminalId);
      setNotifications((prev) => {
        const needsUpdate = prev.some(
          (n) => n.terminalId === activeTerminalId && !n.dismissed,
        );
        if (!needsUpdate) return prev;
        return prev.map((n) =>
          n.terminalId === activeTerminalId ? { ...n, dismissed: true } : n,
        );
      });
    }
    return () => {
      if (activeTerminalId) {
        window.api.notifications.unsuppress(activeTerminalId);
      }
    };
  }, [activeTerminalId]);

  useEffect(() => {
    return window.api.notifications.onFocusTerminal((terminalId) => {
      focusCbRef.current?.(terminalId);
    });
  }, []);

  const dismiss = useCallback((id: string) => {
    setNotifications((prev) => {
      const target = prev.find((n) => n.id === id);
      if (!target || target.dismissed) return prev;
      return prev.map((n) => (n.id === id ? { ...n, dismissed: true } : n));
    });
  }, []);

  const clearAll = useCallback(() => {
    setNotifications([]);
  }, []);

  const unreadByTerminal = useMemo(() => {
    const map = new Map<string, number>();
    for (const n of notifications) {
      if (!n.dismissed) {
        map.set(n.terminalId, (map.get(n.terminalId) || 0) + 1);
      }
    }
    return map;
  }, [notifications]);

  const unreadCount = useMemo(() => {
    let total = 0;
    for (const count of unreadByTerminal.values()) total += count;
    return total;
  }, [unreadByTerminal]);

  return { notifications, unreadByTerminal, unreadCount, dismiss, clearAll };
}
