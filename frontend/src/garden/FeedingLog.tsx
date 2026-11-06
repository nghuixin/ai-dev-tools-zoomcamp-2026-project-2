import { useEffect, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { errorText } from "../components/ui";
import { useApi } from "../services/api";
import type { Dose, Kind, Medication } from "../services/types";
import { localInputToISO, localInputValue } from "../utils/dates";

type Group = "med" | "sup";
// Medicine = DRUG, HERBAL, OTHER; Supplement = SUPPLEMENT (spec §5.7)
export const groupOf = (k: Kind): Group => (k === "SUPPLEMENT" ? "sup" : "med");

const fmt = (iso: string) =>
  new Date(iso).toLocaleString([], { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });

/** The garden's only form: logs a dose of an existing, active medicine or supplement.
 *  It can't create, edit, refill or stop a medicine. */
export function FeedingLog({ dogName, meds, onLogged }: { dogName: string; meds: Medication[]; onLogged?: () => void }) {
  const api = useApi();
  const [group, setGroup] = useState<Group>("med");
  const [medId, setMedId] = useState<number | null>(null);
  const [at, setAt] = useState(localInputValue());
  const [recent, setRecent] = useState<Dose[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const options = meds.filter((m) => m.active && groupOf(m.kind) === group);
  const chosen = options.find((m) => m.id === medId) ?? options[0];

  const loadRecent = () => api.recentDoses(5).then(setRecent, () => {});
  useEffect(() => void loadRecent(), []);

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!chosen) return;
    setBusy(true); setError(null);
    try {
      await api.logDose(chosen.id, localInputToISO(at));
      setAt(localInputValue());
      await loadRecent();
      onLogged?.();
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="g-panel" aria-label="Feeding log">
      <h2>FEEDING LOG FOR {dogName.toUpperCase()}</h2>
      <div className="g-types" role="group" aria-label="What was given">
        {(["med", "sup"] as const).map((g) => (
          <button key={g} type="button" className="g-btn" aria-pressed={group === g}
                  onClick={() => { setGroup(g); setMedId(null); }}>
            {g === "med" ? "MEDICINE" : "SUPPLEMENT"}
          </button>
        ))}
      </div>
      {options.length === 0 ? (
        <p className="g-empty">
          No active {group === "med" ? "medicines" : "supplements"} yet.{" "}
          <Link to="/medicines">Add one on the Medicines page</Link>.
        </p>
      ) : (
        <form className="g-form" onSubmit={submit}>
          <select aria-label={group === "med" ? "Medicine" : "Supplement"} value={chosen?.id}
                  onChange={(e) => setMedId(Number(e.target.value))}>
            {options.map((m) => <option key={m.id} value={m.id}>{m.name} · {m.dose}</option>)}
          </select>
          <input type="datetime-local" aria-label="Time given" value={at} max={localInputValue()} required
                 onChange={(e) => setAt(e.target.value)} />
          <button className="g-btn g-go" type="submit" disabled={busy}>GAVE IT ★</button>
        </form>
      )}
      {error && <p className="g-error" role="alert">{error}</p>}
      <ul className="g-recent" aria-label="Recent doses">
        {recent.length === 0 && <li className="g-empty">No doses logged yet. Your first one earns a star.</li>}
        {recent.map((d) => (
          <li key={d.id}>
            <span className="t">{fmt(d.given_at)}</span>
            <span className="k">{groupOf(d.kind) === "sup" ? "Supplement" : "Medicine"}</span>
            <span>{d.name} · {d.dose}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
