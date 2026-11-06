import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { Medicines } from "../pages/Medicines";
import { createApi } from "../services/api";
import { fakeFetch, med, renderWithApi } from "./render";

describe("Medicines page", () => {
  it("highlights medicines running out soon and requires a reason to stop", async () => {
    const u = userEvent.setup();
    const stops: unknown[] = [];
    const api = createApi(fakeFetch({
      "GET /api/medications": () => [200, [med({ runs_out_soon: true, runs_out_on: "2026-11-08" })]],
      "POST /api/medications/{id}/stop": (b) => { stops.push(b); return [200, med({ active: false })]; },
    }));
    renderWithApi(<Medicines />, api);

    const row = (await screen.findByText("Carprofen")).closest("tr")!;
    expect(row).toHaveClass("soon");

    await u.click(within(row).getByRole("button", { name: "Stop" }));
    await u.click(screen.getByRole("button", { name: "Stop medicine" }));
    expect(screen.getByRole("alert")).toHaveTextContent("A reason is required");
    expect(stops).toHaveLength(0);

    await u.type(screen.getByRole("textbox", { name: "Reason for stopping" }), "Vet advised");
    await u.click(screen.getByRole("button", { name: "Stop medicine" }));
    await waitFor(() => expect(stops).toEqual([{ reason: "Vet advised" }]));
  });
});
