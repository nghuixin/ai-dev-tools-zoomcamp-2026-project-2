import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ReportView } from "../pages/Report";
import type { Report } from "../services/types";

const scores = { hurt: 7, hunger: 8, hydration: 8, hygiene: 6, happiness: 9, mobility: 5, more_good_days: 7 };
const base: Report = {
  dog: { name: "Mochi", birth_date: "2014-03-01", sex: "FEMALE", breed: "Australian Shepherd", coat: "blue" },
  period: { from: "2026-11-01", to: "2026-11-05", basis: "custom", last_visit: null },
  generated_at: "2026-11-05T10:00:00Z",
  current_medications: [], medication_changes: [], weight: null, quality_of_life: null, observations: [], questions: [],
  footer: "Owner-recorded. Not a diagnosis.",
};
const full: Report = {
  ...base,
  current_medications: [{ name: "Carprofen", kind: "DRUG", dose: "1 tablet", per_day: 2, started_on: "2026-10-01", doses_given: 9, doses_expected: 10 }],
  medication_changes: [{ name: "Gabapentin", kind: "DRUG", change: "STOPPED", on: "2026-11-02", reason: "Vet advised" }],
  weight: { first: { id: 1, measured_on: "2026-11-01", kg: 20 }, last: { id: 2, measured_on: "2026-11-05", kg: 19.5 }, change_kg: -0.5, change_pct: -2.5 },
  quality_of_life: {
    first: { iso_week: "2026-W44", ...scores, total: 50, note: null },
    latest: { iso_week: "2026-W45", ...scores, mobility: 2, total: 47, note: null },
    change: { hurt: 0, hunger: 0, hydration: 0, hygiene: 0, happiness: 0, mobility: -3, more_good_days: 0, total: -3 },
  },
  observations: [{ category: "MOBILITY", count: 1, entries: [{ id: 1, observed_at: "2026-11-02T09:00:00Z", category: "MOBILITY", text: "Slow on stairs", summary: null, for_vet: false, ai_suggestion: null, edited_fields: null, created_at: "2026-11-02T09:00:00Z" }] }],
  questions: [{ id: 2, observed_at: "2026-11-03T09:00:00Z", category: "MOBILITY", text: "Is the stiffness worth an X-ray?", summary: null, for_vet: true, ai_suggestion: null, edited_fields: null, created_at: "2026-11-03T09:00:00Z" }],
};

const SECTIONS = [
  "1. Dog and period", "2. Current medicines and supplements", "3. Medicines started or stopped", "4. Weight",
  /^5\. Quality of life/, "6. Observations by category", "7. Owner's questions for the vet",
];

describe("vet report", () => {
  it("renders every section in order, with the footer", () => {
    render(<ReportView r={full} />);
    const headings = screen.getAllByRole("heading", { level: 2 }).map((h) => h.textContent);
    SECTIONS.forEach((s, i) => expect(headings[i]).toMatch(s));
    expect(screen.getByText("9 / 10")).toBeInTheDocument();
    expect(screen.getByText("Vet advised")).toBeInTheDocument();
    expect(screen.getByText("-0.5 kg (-2.5%)")).toBeInTheDocument();
    expect(screen.getAllByText("-3", { selector: "td" })).toHaveLength(2); // mobility and total
    expect(screen.getByText("Slow on stairs")).toBeInTheDocument();
    expect(screen.getByText("Is the stiffness worth an X-ray?")).toBeInTheDocument();
    expect(screen.getByText("Owner-recorded. Not a diagnosis.")).toBeInTheDocument();
  });

  it("says 'Nothing recorded in this period.' for each empty section", () => {
    render(<ReportView r={base} />);
    expect(screen.getAllByText("Nothing recorded in this period.")).toHaveLength(6);
  });

  it("print stylesheet hides the garden, navigation and buttons", () => {
    const css = readFileSync(resolve(process.cwd(), "src/index.css"), "utf8");
    const print = css.slice(css.indexOf("@media print"));
    for (const sel of [".no-print", ".garden", ".top", "nav", "button"]) expect(print).toContain(sel);
    expect(print).toMatch(/display:\s*none\s*!important/);
  });
});
