/**
 * Real-Time Event Stream (SSE) Subscriber.
 * Connects the mobile app to the hospital RecoverRight Event Bus in real time.
 */

export type EventCallback = (event: { stage: string; type: string; payload: any }) => void;

export class RealTimeEventSubscriber {
  private baseUrl: string;
  private runId: string | null = null;
  private active: boolean = false;
  private reconnectAttempts: number = 0;
  private listeners: Set<EventCallback> = new Set();
  private abortController: AbortController | null = null;
  private reconnectTimeout: any = null;

  constructor(baseUrl: string = "http://127.0.0.1:8000") {
    this.baseUrl = baseUrl.replace(/\/+$/, "");
  }

  public subscribe(runId: string): void {
    if (this.runId === runId && this.active) return;
    this.runId = runId;
    this.active = true;
    this.connect();
  }

  public unsubscribe(): void {
    this.active = false;
    this.runId = null;
    if (this.reconnectTimeout) {
      clearTimeout(this.reconnectTimeout);
      this.reconnectTimeout = null;
    }
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }
  }

  public addListener(cb: EventCallback): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }

  private notify(data: { stage: string; type: string; payload: any }): void {
    for (const listener of this.listeners) {
      try {
        listener(data);
      } catch (err) {
        console.error("Error in real-time event listener:", err);
      }
    }
  }

  private async connect(): Promise<void> {
    if (!this.active || !this.runId) return;

    this.abortController = new AbortController();
    const url = `${this.baseUrl}/events/${encodeURIComponent(this.runId)}`;

    try {
      const response = await fetch(url, {
        headers: { Accept: "text/event-stream" },
        signal: this.abortController.signal,
      });

      if (!response.ok || !response.body) {
        throw new Error(`SSE stream failed with status ${response.status}`);
      }

      this.reconnectAttempts = 0;
      const reader = response.body.getReader();
      const decoder = new TextDecoder("utf-8");
      let buffer = "";

      while (this.active) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n\n");
        buffer = lines.pop() || "";

        for (const block of lines) {
          const trimmed = block.trim();
          if (!trimmed) continue;

          for (const line of trimmed.split("\n")) {
            if (line.startsWith("data:")) {
              const jsonStr = line.slice(5).trim();
              if (jsonStr) {
                try {
                  const parsed = JSON.parse(jsonStr);
                  this.notify(parsed);
                } catch {
                  // Keep-alive or non-json comment
                }
              }
            }
          }
        }
      }
    } catch (err: any) {
      if (err.name === "AbortError" || !this.active) return;
      this.scheduleReconnect();
    }
  }

  private scheduleReconnect(): void {
    if (!this.active) return;
    const delay = Math.min(1000 * Math.pow(1.5, this.reconnectAttempts), 15000);
    this.reconnectAttempts++;
    this.reconnectTimeout = setTimeout(() => {
      if (this.active) {
        this.connect();
      }
    }, delay);
    if (this.reconnectTimeout && typeof this.reconnectTimeout.unref === "function") {
      this.reconnectTimeout.unref();
    }
  }

  public isConnected(): boolean {
    return this.active && this.reconnectAttempts === 0;
  }
}
