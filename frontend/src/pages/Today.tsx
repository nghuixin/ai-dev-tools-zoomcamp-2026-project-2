import { useState } from "react";
import { Link } from "react-router-dom";
import { DoseForm } from "../components/DoseForm";
import { ObservationForm } from "../components/ObservationForm";
import { Empty, ErrorNote, Saved, errorText, useLoad } from "../components/ui";
import { StarGarden } from "../garden/StarGarden";
import { useApi } from "../services/api";
import { CATEGORY_LABEL, type Dog } from "../services/types";
import { fmtDate, fmtDateTime } from "../utils/dates";

type Panel = "dose" | "note" | null;

export function Today({ dog }: { dog: Dog }) {
  const api = useApi();
  const meds = useLoad(() => api.listMedications());
  const recent = useLoad(() => api.listObservations({ limit: 5 }));
  const [panel, setPanel] = useState<Panel>(null);
  const [quick, setQuick] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function quickLog(category: "APPETITE" | "TOILETING", text: string) {
    setError(null); setQuick(null);
    try {
      await api.createObservation({ category, text });
      setQuick(`Saved: ${text}.`);
      recent.reload();
    } catch (e) {
      setError(errorText(e));
    }
  }

  const soon = (meds.data ?? []).filter((m) => m.active && m.runs_out_soon);

  return (
    <>
      {meds.data && <StarGarden dog={dog} meds={meds.data} />}

      <h1>Today</h1>
      <div className="quick" role="group" aria-label="Quick log">
        <button type="button" onClick={() => setPanel(panel === "dose" ? null : "dose")} aria-pressed={panel === "dose"}>
          Gave medicine
        </button>
        <button type="button" onClick={() => quickLog("APPETITE", "Ate")}>Ate</button>
        <button type="button" onClick={() => quickLog("TOILETING", "Toileted")}>Toileted</button>
        <button type="button" onClick={() => setPanel(panel === "note" ? null : "note")} aria-pressed={panel === "note"}>
          Note
        </button>
      </div>
      <Saved text={quick} />
      <ErrorNote error={error} />
      {panel === "dose" && meds.data && <DoseForm meds={meds.data} />}
      {panel === "note" && <ObservationForm onSaved={() => recent.reload()} />}

      <section>
        <h2>Running out within 7 days</h2>
        <ErrorNote error={meds.error} />
        {soon.length === 0 ? <Empty>Nothing runs out in the next 7 days.</Empty> : (
          <table>
            <thead><tr><th>Medicine</th><th>Dose</th><th>Runs out on</th></tr></thead>
            <tbody>
              {soon.map((m) => (
                <tr key={m.id} className="soon">
                  <td>{m.name}</td><td>{m.dose}, {m.per_day}× a day</td><td>{fmtDate(m.runs_out_on!)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section>
        <h2>Recent observations</h2>
        <ErrorNote error={recent.error} />
        {recent.data && recent.data.length === 0 && <Empty />}
        <ul className="list">
          {recent.data?.map((o) => (
            <li key={o.id}>
              <span className="when">{fmtDateTime(o.observed_at)}</span>
              <span className="cat">{CATEGORY_LABEL[o.category]}</span>
              <span>{o.text}</span>
            </li>
          ))}
        </ul>
        <p><Link to="/observations">All observations</Link></p>
      </section>
    </>
  );
}
