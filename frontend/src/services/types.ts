// Mirrors openapi.yaml (spec §7). JSON is snake_case.

export const CATEGORIES = ["MOBILITY", "APPETITE", "TOILETING", "SKIN_COAT", "BREATHING", "BEHAVIOUR", "OTHER"] as const;
export type Category = (typeof CATEGORIES)[number];
export const CATEGORY_LABEL: Record<Category, string> = {
  MOBILITY: "Mobility", APPETITE: "Appetite", TOILETING: "Toileting", SKIN_COAT: "Skin and coat",
  BREATHING: "Breathing", BEHAVIOUR: "Behaviour", OTHER: "Other",
};

export const KINDS = ["DRUG", "SUPPLEMENT", "HERBAL", "OTHER"] as const;
export type Kind = (typeof KINDS)[number];
export const KIND_LABEL: Record<Kind, string> = { DRUG: "Drug", SUPPLEMENT: "Supplement", HERBAL: "Herbal", OTHER: "Other" };

export const COATS = [
  ["blue", "Blue merle"], ["red", "Red merle"], ["tri", "Black tri"], ["saddle", "Saddle tan"], ["golden", "Golden"],
  ["black", "Black"], ["brown", "Brown"], ["cream", "Cream"], ["grey", "Grey"],
] as const;
export type Coat = (typeof COATS)[number][0];
export type Sex = "FEMALE" | "MALE" | "UNKNOWN";

export interface Dog { name: string; birth_date: string | null; sex: Sex; breed: string; coat: Coat }

export interface AISuggestion { category: Category; summary: string }
export interface Observation {
  id: number; observed_at: string; category: Category; text: string; summary: string | null; for_vet: boolean;
  ai_suggestion: AISuggestion | null; edited_fields: string[] | null; created_at: string;
}
export interface ObservationIn {
  observed_at?: string; category: Category; text: string; summary?: string | null; for_vet?: boolean;
  ai_suggestion?: AISuggestion | null; edited_fields?: ("category" | "summary")[];
}

export interface Medication {
  id: number; name: string; kind: Kind; dose: string; per_day: number; quantity: number; started_on: string;
  refilled_on: string | null; prescriber: string | null; stopped_on: string | null; stop_reason: string | null;
  active: boolean; runs_out_on: string | null; runs_out_soon: boolean;
}
export interface MedicationIn {
  name: string; kind: Kind; dose: string; per_day: number; quantity: number; started_on: string; prescriber?: string | null;
}
export interface Dose { id: number; medication_id: number; name: string; kind: Kind; dose: string; given_at: string }

export interface Weight { id: number; measured_on: string; kg: number }

export const CHECKIN_ITEMS = [
  ["hurt", "Hurt", "10 = no pain, breathing easily"],
  ["hunger", "Hunger", "10 = eating normally"],
  ["hydration", "Hydration", "10 = drinking normally"],
  ["hygiene", "Hygiene", "10 = clean, no sores or soiling"],
  ["happiness", "Happiness", "10 = engaged, interested, responsive"],
  ["mobility", "Mobility", "10 = gets up and around unaided"],
  ["more_good_days", "More good days than bad", "10 = good days clearly outnumber bad"],
] as const;
export type CheckinItem = (typeof CHECKIN_ITEMS)[number][0];
export type CheckinScores = Record<CheckinItem, number>;
export interface Checkin extends CheckinScores { iso_week: string; total: number; note: string | null }

export interface VetVisit { id: number; visited_on: string; clinic: string; reason: string }
export interface Stars { stars_waiting: number; stars_caught: number; added: number }

export type ReportBasis = "since_last_visit" | "last_30_days" | "custom";
export interface Report {
  dog: Dog;
  period: { from: string; to: string; basis: ReportBasis; last_visit: VetVisit | null };
  generated_at: string;
  current_medications: {
    name: string; kind: Kind; dose: string; per_day: number; started_on: string; doses_given: number; doses_expected: number;
  }[];
  medication_changes: { name: string; kind: Kind; change: "STARTED" | "STOPPED"; on: string; reason: string | null }[];
  weight: { first: Weight; last: Weight; change_kg: number; change_pct: number } | null;
  quality_of_life: { first: Checkin; latest: Checkin; change: Record<CheckinItem | "total", number> } | null;
  observations: { category: Category; count: number; entries: Observation[] }[];
  questions: Observation[];
  footer: string;
}

export type SavedKind = "observation" | "dose" | "weight" | "checkin";
