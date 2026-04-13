export interface AttentionEvent {
  id: string;
  terminalId: string;
  type: "prompt" | "permission" | "complete";
  summary: string;
  timestamp: number;
}

// Intentional control-character matching for ANSI/terminal stripping.
/* eslint-disable no-control-regex */
const ANSI_RE =
  /\u001b\[[0-9;?]*[a-zA-Z]|\u001b\][^\u0007\u001b]*(?:\u0007|\u001b\\)|\u001b[()][AB012]|\u001b[>=<]|\u001b\[[\d;]*m|\u001b\[\?[\d;]*[hl]/g;
const CONTROL_RE = /[\u0000-\u0008\u000b-\u001f]/g;
/* eslint-enable no-control-regex */

function stripAnsi(s: string): string {
  return s.replace(ANSI_RE, "").replace(CONTROL_RE, "");
}

// High-confidence text patterns — fire immediately rather than waiting for idle
const PERMISSION_PATTERNS = [
  /Allow\s+.+\?/i,
  /Do you want to proceed/i,
  /\(Y\)es\s*\/\s*\(N\)o/i,
  /Approve\?/i,
  /Yes\s*\/\s*No/,
];

type Callback = (event: AttentionEvent) => void;

/**
 * Detects when a Claude Code terminal needs user attention.
 *
 * Primary signal: idle detection — Claude streams output in rapid chunks.
 * When the stream stops for IDLE_THRESHOLD_MS and enough data was received
 * (MIN_STREAMING_BYTES), the terminal is likely waiting for input.
 *
 * Secondary signal: permission pattern matching on stripped text,
 * debounced to avoid running regexes on every PTY chunk.
 */
export class AttentionDetector {
  private lastDataTime = new Map<string, number>();
  private streamBytes = new Map<string, number>();
  private idleTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private firedIdle = new Map<string, boolean>();

  // Pattern detection uses a raw buffer + debounced strip/check
  private rawBuffers = new Map<string, string>();
  private patternTimers = new Map<string, ReturnType<typeof setTimeout>>();
  private lastPermSig = new Map<string, string>();

  private createdAt = new Map<string, number>();
  private callbacks: Callback[] = [];
  private suppressed = new Set<string>();

  private static IDLE_THRESHOLD_MS = 2500;
  private static MIN_STREAMING_BYTES = 200;
  private static WARMUP_MS = 5000;
  private static STREAM_GAP_MS = 300;
  private static PATTERN_DEBOUNCE_MS = 150;

  feed(terminalId: string, data: string): void {
    const now = Date.now();

    if (!this.createdAt.has(terminalId)) {
      this.createdAt.set(terminalId, now);
    }

    // Skip during warm-up (shell init noise)
    if (now - this.createdAt.get(terminalId)! < AttentionDetector.WARMUP_MS) {
      this.lastDataTime.set(terminalId, now);
      return;
    }

    const lastTime = this.lastDataTime.get(terminalId) || 0;
    const gap = now - lastTime;
    this.lastDataTime.set(terminalId, now);

    if (gap < AttentionDetector.STREAM_GAP_MS) {
      this.streamBytes.set(terminalId, (this.streamBytes.get(terminalId) || 0) + data.length);
    } else {
      this.streamBytes.set(terminalId, data.length);
    }

    this.firedIdle.set(terminalId, false);

    // Reset idle timer
    const prev = this.idleTimers.get(terminalId);
    if (prev) clearTimeout(prev);
    this.idleTimers.set(
      terminalId,
      setTimeout(() => this.onIdle(terminalId), AttentionDetector.IDLE_THRESHOLD_MS),
    );

    // Accumulate raw data, debounce the expensive strip + regex check
    const existing = this.rawBuffers.get(terminalId) || "";
    this.rawBuffers.set(terminalId, (existing + data).slice(-2048));

    const prevPattern = this.patternTimers.get(terminalId);
    if (prevPattern) clearTimeout(prevPattern);
    this.patternTimers.set(
      terminalId,
      setTimeout(() => {
        this.patternTimers.delete(terminalId);
        this.checkPermissionPatterns(terminalId);
      }, AttentionDetector.PATTERN_DEBOUNCE_MS),
    );
  }

  onAttention(cb: Callback): void {
    this.callbacks.push(cb);
  }

  suppress(terminalId: string): void {
    this.suppressed.add(terminalId);
  }

  unsuppress(terminalId: string): void {
    this.suppressed.delete(terminalId);
  }

  clear(terminalId: string): void {
    this.lastDataTime.delete(terminalId);
    this.streamBytes.delete(terminalId);
    const idle = this.idleTimers.get(terminalId);
    if (idle) clearTimeout(idle);
    this.idleTimers.delete(terminalId);
    this.firedIdle.delete(terminalId);
    this.rawBuffers.delete(terminalId);
    const pattern = this.patternTimers.get(terminalId);
    if (pattern) clearTimeout(pattern);
    this.patternTimers.delete(terminalId);
    this.lastPermSig.delete(terminalId);
    this.createdAt.delete(terminalId);
    this.suppressed.delete(terminalId);
  }

  private onIdle(terminalId: string): void {
    this.idleTimers.delete(terminalId);

    if (this.suppressed.has(terminalId)) return;
    if (this.firedIdle.get(terminalId)) return;

    const bytes = this.streamBytes.get(terminalId) || 0;
    if (bytes < AttentionDetector.MIN_STREAMING_BYTES) return;

    this.firedIdle.set(terminalId, true);
    this.streamBytes.set(terminalId, 0);

    this.emit(terminalId, "prompt", "Waiting for input");
  }

  private checkPermissionPatterns(terminalId: string): void {
    if (this.suppressed.has(terminalId)) return;

    const raw = this.rawBuffers.get(terminalId);
    if (!raw) return;

    const tail = stripAnsi(raw.slice(-400));
    for (const re of PERMISSION_PATTERNS) {
      const match = tail.match(re);
      if (match) {
        const sig = match[0].slice(0, 60);
        if (this.lastPermSig.get(terminalId) === sig) return;
        this.lastPermSig.set(terminalId, sig);
        this.emit(terminalId, "permission", sig);
        return;
      }
    }
  }

  private emit(terminalId: string, type: AttentionEvent["type"], summary: string): void {
    const event: AttentionEvent = {
      id: `${terminalId}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      terminalId,
      type,
      summary,
      timestamp: Date.now(),
    };
    for (const cb of this.callbacks) {
      cb(event);
    }
  }
}
