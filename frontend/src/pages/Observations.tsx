import { useState } from "react";
import { ObservationForm } from "../components/ObservationForm";
import { Empty, ErrorNote, useLoad } from "../components/ui";
import { useApi } from "../services/api";
import { CATEGORIES, CATEGORY_LABEL, type Category } from "../services/types";
import { fmtDateTime } from "../utils/dates";

export function Observations() {
  const api = useApi();
  const [category, setCategory] = useState<Category | "">("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const list = useLoad(() => api.listObservations({ category, from, to }), [category, from, to]);

  return (
    <>
      <h1>Observations</h1>
      <ObservationForm onSaved={list.reload} />

      <section>
        <h2>History</h2>
        <div className="filters" role="group" aria-label="Filters">
          <label>Category{" "}
            <select value={category} onChange={(e) => setCategory(e.target.value as Category | "")} aria-label="Filter by category">
              <option value="">All</option>
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
          </label>
          <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" /></label>
          <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" /></label>
        </div>
        <ErrorNote error={list.error} />
        {list.data?.length === 0 && <Empty>No observations match.</Empty>}
        {!!list.data?.length && (
          <table>
            <thead><tr><th>When</th><th>Category</th><th>Owner's words</th><th>For vet</th></tr></thead>
            <tbody>
              {list.data.map((o) => (
                <tr key={o.id}>
                  <td className="nowrap">{fmtDateTime(o.observed_at)}</td>
                  <td>
                    {CATEGORY_LABEL[o.category]}
                    {o.ai_suggestion && (
                      <span className={`tag ${o.edited_fields?.includes("category") ? "tag-edited" : "tag-ai"}`}>
                        {o.edited_fields?.includes("category") ? "EDITED" : "AI"}
                      </span>
                    )}
                  </td>
                  <td>{o.text}{o.summary && o.summary !== o.text && <div className="muted">{o.summary}</div>}</td>
                  <td>{o.for_vet ? "Yes" : ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
