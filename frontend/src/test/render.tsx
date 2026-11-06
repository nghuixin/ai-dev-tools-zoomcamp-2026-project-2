import { render } from "@testing-library/react";
import type { ReactElement } from "react";
import { MemoryRouter } from "react-router-dom";
import { vi } from "vitest";
import { ApiContext, createApi, type Api } from "../services/api";
import type { Medication } from "../services/types";

/** A real client over a scripted fetch, so tests exercise the same request/response code as the app. */
export function fakeFetch(routes: Record<string, (body: unknown) => [number, unknown]>) {
  return vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
    const method = init?.method ?? "GET";
    const path = String(url).split("?")[0];
    const key = Object.keys(routes).find((k) => {
      const [m, p] = k.split(" ");
      return m === method && new RegExp(`^${p.replace(/\{[^}]+\}/g, "[^/]+")}$`).test(path);
    });
    if (!key) return new Response(JSON.stringify({ error: `no route ${method} ${path}` }), { status: 404 });
    const [status, body] = routes[key](init?.body ? JSON.parse(String(init.body)) : undefined);
    return new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
  });
}

export function renderWithApi(ui: ReactElement, api: Api = createApi(fakeFetch({}))) {
  return render(
    <ApiContext.Provider value={api}>
      <MemoryRouter>{ui}</MemoryRouter>
    </ApiContext.Provider>,
  );
}

export const med = (over: Partial<Medication>): Medication => ({
  id: 1, name: "Carprofen", kind: "DRUG", dose: "1 tablet", per_day: 2, quantity: 20, started_on: "2026-11-01",
  refilled_on: null, prescriber: null, stopped_on: null, stop_reason: null, active: true, runs_out_on: "2026-11-11",
  runs_out_soon: false, ...over,
});
