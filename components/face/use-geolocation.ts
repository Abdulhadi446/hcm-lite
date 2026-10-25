"use client";

import { useCallback, useEffect, useState } from "react";

import type { GeoState } from "./types";

const INITIAL: GeoState = {
  status: "locating",
  latitude: null,
  longitude: null,
  accuracy: null,
  message: null,
};

/**
 * Browser location for display; the server recomputes the geofence from the
 * coordinates we submit, so a modified client can't bypass it.
 */
export function useGeolocation(enabled: boolean): GeoState & { refresh: () => void } {
  const [state, setState] = useState<GeoState>(INITIAL);
  const [nonce, setNonce] = useState(0);

  const refresh = useCallback(() => setNonce((value) => value + 1), []);

  useEffect(() => {
    if (!enabled) return;

    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setState({
        status: "unsupported",
        latitude: null,
        longitude: null,
        accuracy: null,
        message: "This browser doesn't expose a location API.",
      });
      return;
    }

    let active = true;
    setState((current) =>
      current.status === "granted" && current.latitude != null
        ? { ...current, status: "locating", message: null }
        : { ...INITIAL },
    );

    const onSuccess = (position: GeolocationPosition) => {
      if (!active) return;
      setState({
        status: "granted",
        latitude: position.coords.latitude,
        longitude: position.coords.longitude,
        accuracy: position.coords.accuracy,
        message: null,
      });
    };

    const onError = (error: GeolocationPositionError) => {
      if (!active) return;
      if (error.code === error.PERMISSION_DENIED) {
        setState({
          status: "denied",
          latitude: null,
          longitude: null,
          accuracy: null,
          message: "Location permission was blocked.",
        });
        return;
      }
      setState({
        status: "error",
        latitude: null,
        longitude: null,
        accuracy: null,
        message:
          error.code === error.TIMEOUT
            ? "Getting your location timed out."
            : "Your location isn't available right now.",
      });
    };

    const options: PositionOptions = {
      enableHighAccuracy: true,
      timeout: 15000,
      maximumAge: 10000,
    };

    navigator.geolocation.getCurrentPosition(onSuccess, onError, options);
    const watchId = navigator.geolocation.watchPosition(onSuccess, onError, options);

    return () => {
      active = false;
      navigator.geolocation.clearWatch(watchId);
    };
  }, [enabled, nonce]);

  return { ...state, refresh };
}
