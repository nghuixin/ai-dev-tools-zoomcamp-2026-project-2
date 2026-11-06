import { createContext, useContext } from "react";
import type {
  AISuggestion, Category, Checkin, CheckinScores, Dog, Dose, Medication, MedicationIn, Observation, ObservationIn,
  Report, ReportBasis, SavedKind, Stars, VetVisit, Weight,
} from "./types";
import { todayISO, tzOffset } from "../utils/dates";

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

type Fetch = typeof fetch;
type SavedListener = (kind: SavedKind) => void;

/** The HTTP client the whole UI uses. Components get it from context so tests can pass a fake. */
export function createApi(fetchImpl: Fetch = (...a) => fetch(...a), base = "") {
  const listeners = new Set<SavedListener>();

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetchImpl(base + path, {
        method,
        headers: body === undefined ? undefined : { "Content-Type": "application/json" },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiError(0, "Can't reach the server. Check your connection and try again.");
    }
    const data = res.status === 204 ? null : await res.json().catch(() => null);
    if (!res.ok) throw new ApiError(res.status, data?.error ?? `Request failed (${res.status})`);
    return data as T;
  }

  /** A record save: listeners (the star garden) hear about it only after a 2xx (spec §5.7). */
  async function save<T>(kind: SavedKind, method: string, path: string, body: unknown): Promise<T> {
    const out = await call<T>(method, path, body);
    listeners.forEach((l) => l(kind));
    return out;
  }

  const q = (p: Record<string, string | number | undefined | null>) => {
    const s = new URLSearchParams();
    for (const [k, v] of Object.entries(p)) if (v !== undefined && v !== null && v !== "") s.set(k, String(v));
    const out = s.toString();
    return out ? `?${out}` : "";
  };

  return {
    onSaved(l: SavedListener) {
      listeners.add(l);
      return () => void listeners.delete(l);
    },

    getDog: () => call<Dog>("GET", "/api/dog"),
    putDog: (d: Dog) => call<Dog>("PUT", "/api/dog", d),

    listObservations: (f: { category?: Category | ""; from?: string; to?: string; limit?: number } = {}) =>
      call<Observation[]>("GET", `/api/observations${q({ ...f, tz_offset: tzOffset() })}`),
    createObservation: (o: ObservationIn) => save<Observation>("observation", "POST", "/api/observations", o),
    analyze: (text: string) => call<AISuggestion>("POST", "/api/observations/analyze", { text }),

    listMedications: () => call<Medication[]>("GET", "/api/medications"),
    createMedication: (m: MedicationIn) => call<Medication>("POST", "/api/medications", m),
    refill: (id: number, quantity: number, refilled_on?: string) =>
      call<Medication>("POST", `/api/medications/${id}/refill`, { quantity, refilled_on }),
    stop: (id: number, reason: string, stopped_on?: string) =>
      call<Medication>("POST", `/api/medications/${id}/stop`, { reason, stopped_on }),
    logDose: (id: number, given_at?: string) => save<Dose>("dose", "POST", `/api/medications/${id}/doses`, { given_at }),
    recentDoses: (limit = 5) => call<Dose[]>("GET", `/api/doses?limit=${limit}`),

    listWeights: () => call<Weight[]>("GET", "/api/weights"),
    addWeight: (measured_on: string, kg: number) => save<Weight>("weight", "POST", "/api/weights", { measured_on, kg }),

    listCheckins: () => call<Checkin[]>("GET", "/api/checkins"),
    putCheckin: (iso_week: string, scores: CheckinScores, note: string | null) =>
      save<Checkin>("checkin", "PUT", `/api/checkins/${iso_week}`, { ...scores, note }),

    listVisits: () => call<VetVisit[]>("GET", "/api/vet-visits"),
    addVisit: (v: Omit<VetVisit, "id">) => call<VetVisit>("POST", "/api/vet-visits", v),

    report: (p: { basis?: ReportBasis; from?: string; to?: string }) =>
      call<Report>("GET", `/api/report${q({ ...p, today: todayISO(), tz_offset: tzOffset() })}`),

    stars: () => call<Stars>("GET", "/api/stars"),
    visitStar: () => call<Stars>("POST", "/api/stars/visit"),
    catchStar: () => call<Stars>("POST", "/api/stars/catch"),
  };
}

export type Api = ReturnType<typeof createApi>;

export const ApiContext = createContext<Api | null>(null);

export function useApi(): Api {
  const api = useContext(ApiContext);
  if (!api) throw new Error("ApiContext missing");
  return api;
}
