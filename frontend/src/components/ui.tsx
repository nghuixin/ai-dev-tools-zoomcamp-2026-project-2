import { useCallback, useEffect, useState, type ReactNode } from "react";
import { ApiError } from "../services/api";

export function errorText(e: unknown): string {
  return e instanceof ApiError ? e.message : "Something went wrong. Please try again.";
}

export function ErrorNote({ error }: { error: string | null }) {
  return error ? <p className="error" role="alert">{error}</p> : null;
}

export function Saved({ text }: { text: string | null }) {
  return text ? <p className="saved" role="status">{text}</p> : null;
}

export function Empty({ children = "Nothing recorded yet." }: { children?: ReactNode }) {
  return <p className="empty">{children}</p>;
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="field">
      <span className="label">{label}</span>
      {children}
      {hint && <span className="hint">{hint}</span>}
    </label>
  );
}

/** Loads data with a reload function; errors become a message, never a crash. */
export function useLoad<T>(load: () => Promise<T>, deps: unknown[] = []) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = useCallback(load, deps);
  const reload = useCallback(() => {
    run().then((d) => { setData(d); setError(null); }, (e) => setError(errorText(e)));
  }, [run]);
  useEffect(reload, [reload]);
  return { data, error, reload };
}
