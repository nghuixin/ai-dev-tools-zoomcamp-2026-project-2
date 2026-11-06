import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ObservationForm } from "../components/ObservationForm";
import { createApi } from "../services/api";
import { fakeFetch, renderWithApi } from "./render";

const SUGGESTION = { category: "MOBILITY", summary: "Slow on the stairs" };

function setup(analyze: () => [number, unknown]) {
  const posted: unknown[] = [];
  const fetch = fakeFetch({
    "POST /api/observations/analyze": analyze,
    "POST /api/observations": (b) => { posted.push(b); return [201, { id: 1, ...(b as object) }]; },
  });
  renderWithApi(<ObservationForm />, createApi(fetch));
  return { posted };
}

describe("ObservationForm", () => {
  it("fills category and summary from Analyze, tagged AI, then EDITED once changed", async () => {
    const u = userEvent.setup();
    const { posted } = setup(() => [200, SUGGESTION]);
    await u.type(screen.getByRole("textbox", { name: /what did you see/i }), "Slow on the stairs");
    await u.click(screen.getByRole("button", { name: "Analyze" }));

    await waitFor(() => expect(screen.getByRole("textbox", { name: "Summary" })).toHaveValue("Slow on the stairs"));
    expect(screen.getByRole("combobox", { name: "Category" })).toHaveValue("MOBILITY");
    expect(screen.getAllByText("AI")).toHaveLength(2);

    await u.selectOptions(screen.getByRole("combobox", { name: "Category" }), "BEHAVIOUR");
    expect(screen.getByText("EDITED")).toBeInTheDocument();
    expect(screen.getAllByText("AI")).toHaveLength(1);

    await u.click(screen.getByRole("button", { name: "Save observation" }));
    await waitFor(() => expect(posted).toHaveLength(1));
    expect(posted[0]).toMatchObject({
      category: "BEHAVIOUR", summary: "Slow on the stairs", ai_suggestion: SUGGESTION, edited_fields: ["category"],
    });
  });

  it("shows 'suggestion unavailable' when Analyze fails and still saves", async () => {
    const u = userEvent.setup();
    const { posted } = setup(() => [503, { error: "suggestion unavailable" }]);
    await u.type(screen.getByRole("textbox", { name: /what did you see/i }), "Odd day");
    await u.click(screen.getByRole("button", { name: "Analyze" }));
    expect(await screen.findByText("suggestion unavailable")).toBeInTheDocument();

    await u.click(screen.getByRole("button", { name: "Save observation" }));
    expect(await screen.findByText("Observation saved.")).toBeInTheDocument();
    expect(posted[0]).toMatchObject({ text: "Odd day", category: "OTHER", ai_suggestion: null });
  });

  it("requires the owner's words", async () => {
    const u = userEvent.setup();
    const { posted } = setup(() => [200, SUGGESTION]);
    await u.click(screen.getByRole("button", { name: "Save observation" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Describe what you saw.");
    expect(posted).toHaveLength(0);
  });
});
