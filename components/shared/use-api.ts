"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { apiFetch, readableError } from "./api";

type ApiState<T> = {
  requestKey: string;
  dataKey: string;
  data: T | null;
  error: string | null;
  loading: boolean;
};

/**
 * Read-only fetch hook for the attendance / leave / payroll screens.
 * Pass `null` to pause fetching. Every mutation calls `reload()` so the UI
 * always reflects what the server actually stored.
 *
 * Data is keyed by URL, so switching a filter or month never shows the
 * previous result under a new heading.
 */
export function useApi<T>(
  url: string | null,
  select: (json: Record<string, unknown>) => T,
) {
  const selectRef = useRef(select);
  useEffect(() => {
    selectRef.current = select;
  }, [select]);

  const [nonce, setNonce] = useState(0);
  const [state, setState] = useState<ApiState<T>>({
    requestKey: "",
    dataKey: "",
    data: null,
    error: null,
    loading: true,
  });

  const requestKey = url ? `${url}::${nonce}` : "";

  useEffect(() => {
    if (!url) return;

    const controller = new AbortController();
    let active = true;
    const key = requestKey;

    apiFetch<Record<string, unknown>>(url, { signal: controller.signal })
      .then((json) => {
        if (!active) return;
        setState({
          requestKey: key,
          dataKey: url,
          data: selectRef.current(json),
          error: null,
          loading: false,
        });
      })
      .catch((err) => {
        if (err instanceof DOMException && err.name === "AbortError") return;
        if (!active) return;
        setState({
          requestKey: key,
          dataKey: url,
          data: null,
          error: readableError(err),
          loading: false,
        });
      });

    return () => {
      active = false;
      controller.abort();
    };
  }, [url, requestKey]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);

  const currentRequest = state.requestKey === requestKey;
  const data = url && state.dataKey === url ? state.data : null;
  const loading = url ? !currentRequest || state.loading : false;
  const error = currentRequest ? state.error : null;

  return { data, error, loading, reload };
}
