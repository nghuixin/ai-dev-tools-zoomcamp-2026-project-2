import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { FeedingLog } from "../garden/FeedingLog";
import { createApi } from "../services/api";
import { fakeFetch, med, renderWithApi } from "./render";

const MEDS = [
  med({ id: 1, name: "Carprofen", kind: "DRUG", dose: "1 tablet" }),
  med({ id: 2, name: "Milk thistle", kind: "HERBAL", dose: "1 capsule" }),
  med({ id: 3, name: "Fish oil", kind: "SUPPLEMENT", dose: "1 capsule" }),
  med({ id: 4, name: "Old antibiotic", kind: "DRUG", active: false, stopped_on: "2026-10-01", stop_reason: "Course done" }),
];

function setup(meds = MEDS) {
  const calls: string[] = [];
  const fetch = fakeFetch({
    "GET /api/doses": () => [200, []],
    "POST /api/medications/{id}/doses": () => [201, { id: 9, medication_id: 3, name: "Fish oil", kind: "SUPPLEMENT", dose: "1 capsule", given_at: new Date().toISOString() }],
  });
  const wrapped = vi.fn((url: string | URL | Request, init?: RequestInit) => {
    calls.push(`${init?.method ?? "GET"} ${String(url)}`);
    return fetch(url, init);
  });
  const api = createApi(wrapped);
  const saved = vi.fn();
  api.onSaved(saved);
  renderWithApi(<FeedingLog dogName="Mochi" meds={meds} />, api);
  return { calls, saved };
}

const optionNames = (name: string) =>
  within(screen.getByRole("combobox", { name })).getAllByRole("option").map((o) => o.textContent);

describe("FeedingLog", () => {
  it("offers only active medicines, grouped as Medicine or Supplement", async () => {
    const u = userEvent.setup();
    setup();
    expect(optionNames("Medicine")).toEqual(["Carprofen · 1 tablet", "Milk thistle · 1 capsule"]);
    await u.click(screen.getByRole("button", { name: "SUPPLEMENT" }));
    expect(optionNames("Supplement")).toEqual(["Fish oil · 1 capsule"]);
  });

  it("logs a real dose through POST /api/medications/{id}/doses", async () => {
    const u = userEvent.setup();
    const { calls, saved } = setup();
    await u.click(screen.getByRole("button", { name: "SUPPLEMENT" }));
    await u.click(screen.getByRole("button", { name: /GAVE IT/ }));
    await waitFor(() => expect(saved).toHaveBeenCalledWith("dose"));
    expect(calls).toContain("POST /api/medications/3/doses");
  });

  it("has no way to create, refill or stop a medicine, and links to Medicines when empty", () => {
    setup([]);
    expect(screen.queryByRole("button", { name: /refill|stop|add/i })).toBeNull();
    expect(screen.getByRole("link", { name: /medicines page/i })).toHaveAttribute("href", "/medicines");
  });
});
