import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError, api } from "./api.js";
import type { Query } from "./api.js";

// The one data-fetching hook. Deliberately small: a GET, its loading and error
// state, and a way to refetch after a mutation. No cache — every screen here is a
// list or a record read once, and a stale cache would hide a status change that
// staff just made.

type State<T> = {
  data: T | null;
  error: ApiError | null;
  loading: boolean;
};

export function useApi<T>(path: string | null, query?: Query) {
  const [state, setState] = useState<State<T>>({ data: null, error: null, loading: path !== null });

  // Compared by value, so callers can pass an object literal without looping.
  const queryKey = JSON.stringify(query ?? {});
  const [reloadCount, setReloadCount] = useState(0);

  // Lets an in-flight request be discarded when the inputs change.
  const latest = useRef(0);

  useEffect(() => {
    if (path === null) {
      setState({ data: null, error: null, loading: false });
      return;
    }

    const id = ++latest.current;
    const controller = new AbortController();
    setState((previous) => ({ ...previous, loading: true }));

    api
      .get<T>(path, JSON.parse(queryKey) as Query, controller.signal)
      .then((data) => {
        if (id === latest.current) setState({ data, error: null, loading: false });
      })
      .catch((error: unknown) => {
        // An aborted request was replaced by a newer one; it is not a failure.
        if (controller.signal.aborted || id !== latest.current) return;
        setState({
          data: null,
          error: error instanceof ApiError ? error : new ApiError(0, "The server could not be reached."),
          loading: false,
        });
      });

    return () => controller.abort();
  }, [path, queryKey, reloadCount]);

  const reload = useCallback(() => setReloadCount((count) => count + 1), []);

  return { ...state, reload };
}

// For buttons that change something: tracks the in-flight and error state of one
// action so a screen can disable its own submit without inventing the plumbing.
export function useAction<Args extends unknown[], Result>(
  action: (...args: Args) => Promise<Result>,
) {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<ApiError | null>(null);

  const run = useCallback(
    async (...args: Args): Promise<Result | null> => {
      setPending(true);
      setError(null);
      try {
        return await action(...args);
      } catch (caught: unknown) {
        setError(
          caught instanceof ApiError ? caught : new ApiError(0, "The server could not be reached."),
        );
        return null;
      } finally {
        setPending(false);
      }
    },
    [action],
  );

  return { run, pending, error, setError };
}
