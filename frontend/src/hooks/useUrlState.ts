import { useSearchParams } from "react-router-dom";
import { useCallback } from "react";

/**
 * A useState-like hook that syncs state with URL search params.
 * Removes the param when value equals the default to keep URLs clean.
 * Preserves other params when updating.
 */
export function useUrlState(
  key: string,
  defaultValue: string
): [string, (value: string, options?: { replace?: boolean }) => void] {
  const [searchParams, setSearchParams] = useSearchParams();

  const value = searchParams.get(key) ?? defaultValue;

  const setValue = useCallback(
    (newValue: string, options?: { replace?: boolean }) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          if (newValue === defaultValue) {
            next.delete(key);
          } else {
            next.set(key, newValue);
          }
          return next;
        },
        { replace: options?.replace }
      );
    },
    [key, defaultValue, setSearchParams]
  );

  return [value, setValue];
}

/**
 * Numeric variant of useUrlState for page numbers etc.
 */
export function useUrlStateNumber(
  key: string,
  defaultValue: number
): [number, (value: number, options?: { replace?: boolean }) => void] {
  const [raw, setRaw] = useUrlState(key, String(defaultValue));

  const value = parseInt(raw, 10);
  const safeValue = isNaN(value) ? defaultValue : value;

  const setValue = useCallback(
    (newValue: number, options?: { replace?: boolean }) => {
      setRaw(String(newValue), options);
    },
    [setRaw]
  );

  return [safeValue, setValue];
}

/**
 * Clear specific URL params (useful when switching views).
 */
export function useClearUrlParams(): (keys: string[]) => void {
  const [, setSearchParams] = useSearchParams();

  return useCallback(
    (keys: string[]) => {
      setSearchParams(
        (prev) => {
          const next = new URLSearchParams(prev);
          for (const key of keys) {
            next.delete(key);
          }
          return next;
        },
        { replace: true }
      );
    },
    [setSearchParams]
  );
}
