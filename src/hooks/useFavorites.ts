import { useCallback, useSyncExternalStore } from "react";

const STORAGE_KEY = "jumpx-favorites:v1";

export type FavStatus = "using" | "wish";

export type FavEntry = {
  url: string;
  name: string;
  category: string;
  status: FavStatus;
  addedAt: number;
  updatedAt: number;
};

type Store = {
  version: 1;
  entries: Record<string, FavEntry>;
};

const EMPTY_STORE: Store = { version: 1, entries: {} };

export function normalizeUrl(raw: string): string {
  const trimmed = (raw ?? "").trim();
  if (!trimmed) return "";
  try {
    const u = new URL(trimmed);
    u.hash = "";
    const params = new URLSearchParams(u.search);
    for (const k of [...params.keys()]) {
      if (k.toLowerCase().startsWith("utm_")) params.delete(k);
    }
    u.search = params.toString();
    u.hostname = u.hostname.toLowerCase();
    let s = u.toString();
    // collapse trailing slash on root or path
    s = s.replace(/\/(\?|#|$)/, "$1");
    return s;
  } catch {
    return trimmed.toLowerCase();
  }
}

function readStore(): Store {
  if (typeof localStorage === "undefined") return EMPTY_STORE;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { version: 1, entries: {} };
    const data = JSON.parse(raw) as unknown;
    if (
      data &&
      typeof data === "object" &&
      (data as { version?: unknown }).version === 1 &&
      (data as { entries?: unknown }).entries &&
      typeof (data as { entries: unknown }).entries === "object"
    ) {
      return data as Store;
    }
  } catch {
    // fall through
  }
  return { version: 1, entries: {} };
}

let cached: Store = readStore();
const listeners = new Set<() => void>();
let storageBound = false;

function ensureStorageBinding() {
  if (storageBound || typeof window === "undefined") return;
  storageBound = true;
  window.addEventListener("storage", (ev) => {
    if (ev.key !== STORAGE_KEY) return;
    cached = readStore();
    for (const l of listeners) l();
  });
}

function writeStore(next: Store) {
  cached = next;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  } catch {
    // quota or privacy mode — keep in-memory only
  }
  for (const l of listeners) l();
}

function subscribe(l: () => void): () => void {
  ensureStorageBinding();
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}

function getSnapshot(): Store {
  return cached;
}

function getServerSnapshot(): Store {
  return EMPTY_STORE;
}

export type ToolKey = { url: string; name: string; category: string };

export function useFavorites() {
  const store = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);

  const cycle = useCallback((tool: ToolKey) => {
    const key = normalizeUrl(tool.url);
    if (!key) return;
    const cur = cached.entries[key];
    const now = Date.now();
    const nextStatus: FavStatus | null = !cur
      ? "using"
      : cur.status === "using"
        ? "wish"
        : null;
    const entries = { ...cached.entries };
    if (nextStatus === null) {
      delete entries[key];
    } else {
      entries[key] = {
        url: tool.url,
        name: tool.name,
        category: tool.category,
        status: nextStatus,
        addedAt: cur?.addedAt ?? now,
        updatedAt: now,
      };
    }
    writeStore({ version: 1, entries });
  }, []);

  const getStatus = useCallback(
    (url: string): FavStatus | null => {
      const key = normalizeUrl(url);
      if (!key) return null;
      return store.entries[key]?.status ?? null;
    },
    [store],
  );

  const count = Object.keys(store.entries).length;
  return { store, count, cycle, getStatus };
}
