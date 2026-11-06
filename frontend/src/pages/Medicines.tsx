import { useState, type FormEvent } from "react";
import { DoseForm } from "../components/DoseForm";
import { Empty, ErrorNote, Field, Saved, errorText, useLoad } from "../components/ui";
import { useApi } from "../services/api";
import { KINDS, KIND_LABEL, type Kind, type Medication } from "../services/types";
import { fmtDate, todayISO } from "../utils/dates";

function AddMedicine({ onAdded }: { onAdded: () => void }) {
  const api = useApi();
  const blank = { name: "", kind: "DRUG" as Kind, dose: "", per_day: "1", quantity: "", started_on: todayISO(), prescriber: "" };
  const [f, setF] = useState(blank);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setF({ ...f, [k]: e.target.value });

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null); setSaved(null);
    const per_day = Number(f.per_day), quantity = Number(f.quantity);
    if (!f.name.trim() || !f.dose.trim()) return setError("Name and dose are required.");
    if (!(per_day > 0)) return setError("Doses per day must be more than 0.");
    if (!(quantity >= 0) || f.quantity === "") return setError("Enter the quantity on hand.");
    try {
      const m = await api.createMedication({ ...f, per_day, quantity, prescriber: f.prescriber.trim() || null });
      setF(blank);
      setSaved(`Added ${m.name}. Runs out on ${fmtDate(m.runs_out_on!)}.`);
      onAdded();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <form className="card form" onSubmit={submit} aria-label="Add a medicine">
      <h2>Add a medicine or supplement</h2>
      <div className="grid3">
        <Field label="Name"><input value={f.name} onChange={set("name")} maxLength={80} aria-label="Name" /></Field>
        <Field label="Kind">
          <select value={f.kind} onChange={set("kind")} aria-label="Kind">
            {KINDS.map((k) => <option key={k} value={k}>{KIND_LABEL[k]}</option>)}
          </select>
        </Field>
        <Field label="Dose" hint='e.g. "1 tablet"'><input value={f.dose} onChange={set("dose")} maxLength={40} aria-label="Dose" /></Field>
        <Field label="Doses per day" hint="0.5 = every other day">
          <input type="number" step="0.5" min="0.5" value={f.per_day} onChange={set("per_day")} aria-label="Doses per day" />
        </Field>
        <Field label="Quantity on hand"><input type="number" min="0" step="any" value={f.quantity} onChange={set("quantity")} aria-label="Quantity on hand" /></Field>
        <Field label="Start date"><input type="date" value={f.started_on} onChange={set("started_on")} required aria-label="Start date" /></Field>
        <Field label="Prescriber (optional)"><input value={f.prescriber} onChange={set("prescriber")} maxLength={80} aria-label="Prescriber" /></Field>
      </div>
      <div className="row"><button type="submit">Add</button><Saved text={saved} /></div>
      <ErrorNote error={error} />
    </form>
  );
}

function Row({ m, onChange }: { m: Medication; onChange: () => void }) {
  const api = useApi();
  const [mode, setMode] = useState<"refill" | "stop" | null>(null);
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function confirm(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      if (mode === "refill") {
        const q = Number(value);
        if (value === "" || !(q >= 0)) return setError("Enter the new quantity on hand.");
        await api.refill(m.id, q);
      } else {
        if (!value.trim()) return setError("A reason is required to stop a medicine.");
        await api.stop(m.id, value.trim());
      }
      setMode(null); setValue("");
      onChange();
    } catch (err) {
      setError(errorText(err));
    }
  }

  return (
    <>
      <tr className={m.runs_out_soon ? "soon" : undefined}>
        <td>{m.name}{m.prescriber && <div className="muted">{m.prescriber}</div>}</td>
        <td>{KIND_LABEL[m.kind]}</td>
        <td>{m.dose}</td>
        <td>{m.per_day}</td>
        <td>{m.quantity}</td>
        <td>{fmtDate(m.started_on)}</td>
        <td className="nowrap">{m.runs_out_on && fmtDate(m.runs_out_on)}</td>
        <td className="no-print nowrap">
          <button type="button" className="secondary small" onClick={() => { setMode("refill"); setValue(""); }}>Refill</button>{" "}
          <button type="button" className="secondary small" onClick={() => { setMode("stop"); setValue(""); }}>Stop</button>
        </td>
      </tr>
      {mode && (
        <tr className="inline-form">
          <td colSpan={8}>
            <form onSubmit={confirm} className="row" aria-label={mode === "refill" ? `Refill ${m.name}` : `Stop ${m.name}`}>
              {mode === "refill" ? (
                <label>New quantity on hand <input type="number" min="0" step="any" value={value} autoFocus
                       onChange={(e) => setValue(e.target.value)} aria-label="New quantity" /></label>
              ) : (
                <label>Reason for stopping <input value={value} maxLength={300} autoFocus
                       onChange={(e) => setValue(e.target.value)} aria-label="Reason for stopping" /></label>
              )}
              <button type="submit">{mode === "refill" ? "Save refill" : "Stop medicine"}</button>
              <button type="button" className="link" onClick={() => setMode(null)}>Cancel</button>
              <ErrorNote error={error} />
            </form>
          </td>
        </tr>
      )}
    </>
  );
}

export function Medicines() {
  const api = useApi();
  const meds = useLoad(() => api.listMedications());
  const active = meds.data?.filter((m) => m.active) ?? [];
  const past = meds.data?.filter((m) => !m.active) ?? [];

  return (
    <>
      <h1>Medicines and supplements</h1>
      <ErrorNote error={meds.error} />
      <section>
        <h2>Current</h2>
        {meds.data && active.length === 0 && <Empty>No current medicines.</Empty>}
        {active.length > 0 && (
          <table>
            <thead><tr><th>Name</th><th>Kind</th><th>Dose</th><th>Per day</th><th>On hand</th><th>Started</th><th>Runs out on</th><th className="no-print" /></tr></thead>
            <tbody>{active.map((m) => <Row key={m.id} m={m} onChange={meds.reload} />)}</tbody>
          </table>
        )}
        <p className="muted">Rows highlighted run out within 7 days.</p>
      </section>
      {active.length > 0 && (
        <section>
          <h2>Gave medicine</h2>
          <DoseForm meds={active} />
        </section>
      )}
      <AddMedicine onAdded={meds.reload} />
      <section>
        <h2>Past</h2>
        {past.length === 0 ? <Empty>No stopped medicines.</Empty> : (
          <table>
            <thead><tr><th>Name</th><th>Kind</th><th>Dose</th><th>Started</th><th>Stopped</th><th>Reason</th></tr></thead>
            <tbody>
              {past.map((m) => (
                <tr key={m.id}>
                  <td>{m.name}</td><td>{KIND_LABEL[m.kind]}</td><td>{m.dose}</td>
                  <td>{fmtDate(m.started_on)}</td><td>{fmtDate(m.stopped_on!)}</td><td>{m.stop_reason}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </>
  );
}
