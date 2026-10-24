"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { api, readableError } from "./api";

/**
 * Small read-only data hook for the organization screens.
 * `reload()` is called after every successful mutation so tables always show
 * what the server actually stored.
 */
function useFetch<T>(url: string, select: (json: Record<string, unknown>) => T) {
  const selectRef = useRef(select);
  selectRef.current = select;

  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [nonce, setNonce] = useState(0);
  const requestId = useRef(0);

  useEffect(() => {
    const id = ++requestId.current;
    const controller = new AbortController();

    setLoading(true);
    setError(null);

    api<Record<string, unknown>>(url, { signal: controller.signal })
      .then((json) => {
        if (id !== requestId.current) return;
        setData(selectRef.current(json));
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (id !== requestId.current) return;
        setError(readableError(err));
      })
      .finally(() => {
        if (id === requestId.current) setLoading(false);
      });

    return () => controller.abort();
  }, [url, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);

  return { data, error, loading, reload };
}

export function useList<T>(url: string) {
  return useFetch<T[]>(url, (json) => (Array.isArray(json.items) ? (json.items as T[]) : []));
}

export function useObject<T>(url: string, key: string) {
  return useFetch<T | null>(url, (json) => ((json[key] as T | undefined) ?? null));
}
