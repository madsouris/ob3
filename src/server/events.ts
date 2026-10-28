export interface ServerEvent {
  readonly event: string;
  readonly data: unknown;
}

export type EventListener = (event: ServerEvent) => void;

export interface EventBus {
  publish(event: string, data: unknown): void;
  subscribe(listener: EventListener): () => void;
  readonly subscriberCount: number;
}

/** In-process fan-out for SSE. No persistence, no replay beyond the snapshot. */
export const createEventBus = (): EventBus => {
  const listeners = new Set<EventListener>();

  return {
    publish(event, data) {
      for (const listener of [...listeners]) {
        try {
          listener({ event, data });
        } catch {
          listeners.delete(listener);
        }
      }
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    get subscriberCount() {
      return listeners.size;
    },
  };
};
