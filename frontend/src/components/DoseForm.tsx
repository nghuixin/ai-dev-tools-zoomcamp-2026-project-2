import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { useApi } from "../services/api";
import type { Dose, Medication } from "../services/types";
import { fmtDateTime, localInputToISO, localInputValue } from "../utils/dates";
import { ErrorNote, Field, Saved, errorText } from "./ui";

/** "Gave medicine": records a dose of an active medicine at a time (spec §5.4). */
export function DoseForm({ meds, onSaved }: { meds: Medication[]; onSaved?: (d: Dose) => void }) {
  const api = useApi();
  const active = meds.filter((m) => m.active);
  const [medId, setMedId] = useState<number | "">(active[0]?.id ?? "");
  const [at, setAt] = useState(localInputValue());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  if (!active.length) {
    return <p className="empty">No active medicines. <Link to="/medicines">Add one on the Medicines page.</Link></p>;
  }
  const chosen = active.find((m) => m.id === medId) ?? active[0];

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setError(null); setSaved(null);
    try {
      const d = await api.logDose(chosen.id, localInputToISO(at));
      setSaved(`Saved: ${d.name}, ${d.dose}, ${fmtDateTime(d.given_at)}.`);
      setAt(localInputValue());
      onSaved?.(d);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} aria-label="Log a dose">
      <div className="grid2">
        <Field label="Medicine">
          <select value={chosen.id} onChange={(e) => setMedId(Number(e.target.value))} aria-label="Medicine">
            {active.map((m) => <option key={m.id} value={m.id}>{m.name} ({m.dose})</option>)}
          </select>
        </Field>
        <Field label="Given at">
          <input type="datetime-local" value={at} max={localInputValue()} required
                 onChange={(e) => setAt(e.target.value)} aria-label="Given at" />
        </Field>
      </div>
      <div className="row">
        <button type="submit" disabled={busy}>{busy ? "Saving…" : "Record dose"}</button>
        <Saved text={saved} />
      </div>
      <ErrorNote error={error} />
    </form>
  );
}
