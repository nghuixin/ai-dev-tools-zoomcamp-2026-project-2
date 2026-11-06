import { useState, type FormEvent, type ReactNode } from "react";
import { Empty, ErrorNote, Field, errorText, useLoad } from "../components/ui";
import { useApi } from "../services/api";
import { CATEGORY_LABEL, CHECKIN_ITEMS, KIND_LABEL, type Report as R, type ReportBasis } from "../services/types";
import { fmtDate, fmtDateTime, fmtWeek, todayISO } from "../utils/dates";

const NONE = "Nothing recorded in this period.";
const signed = (n: number, unit = "") => `${n > 0 ? "+" : ""}${n}${unit}`;

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="r-section">
      <h2>{n}. {title}</h2>
      {children}
    </section>
  );
}

function age(birth: string | null, on: string): string {
  if (!birth) return "not recorded";
  const [by, bm, bd] = birth.split("-").map(Number), [y, m, d] = on.split("-").map(Number);
  let years = y - by;
  if (m < bm || (m === bm && d < bd)) years -= 1;
  return `${years} years`;
}

/** The printable vet report (spec §5.6): numbers and the owner's words only. */
export function ReportView({ r }: { r: R }) {
  const sex = { FEMALE: "Female", MALE: "Male", UNKNOWN: "Not recorded" }[r.dog.sex];
  const basis = { since_last_visit: "since last vet visit", last_30_days: "last 30 days", custom: "custom" }[r.period.basis];
  return (
    <article className="report" aria-label="Vet report">
      <header className="r-head">
        <h1>Care record: {r.dog.name}</h1>
        <p className="muted">Canine Health Atlas</p>
      </header>

      <Section n={1} title="Dog and period">
        <dl className="r-dl">
          <dt>Name</dt><dd>{r.dog.name}</dd>
          <dt>Breed</dt><dd>{r.dog.breed || "not recorded"}</dd>
          <dt>Sex</dt><dd>{sex}</dd>
          <dt>Birth date</dt><dd>{r.dog.birth_date ? `${fmtDate(r.dog.birth_date)} (${age(r.dog.birth_date, r.period.to)})` : "not recorded"}</dd>
          <dt>Period</dt><dd>{fmtDate(r.period.from)} to {fmtDate(r.period.to)} ({basis})</dd>
          {r.period.last_visit && <><dt>Last vet visit</dt><dd>{fmtDate(r.period.last_visit.visited_on)}, {r.period.last_visit.clinic}{r.period.last_visit.reason && `: ${r.period.last_visit.reason}`}</dd></>}
          <dt>Generated</dt><dd>{fmtDateTime(r.generated_at)}</dd>
        </dl>
      </Section>

      <Section n={2} title="Current medicines and supplements">
        {r.current_medications.length === 0 ? <Empty>{NONE}</Empty> : (
          <table>
            <thead><tr><th>Name</th><th>Kind</th><th>Dose</th><th>Per day</th><th>Started</th><th>Doses given / expected</th></tr></thead>
            <tbody>
              {r.current_medications.map((m) => (
                <tr key={m.name + m.started_on}>
                  <td>{m.name}</td><td>{KIND_LABEL[m.kind]}</td><td>{m.dose}</td><td>{m.per_day}</td>
                  <td>{fmtDate(m.started_on)}</td><td>{m.doses_given} / {m.doses_expected}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section n={3} title="Medicines started or stopped">
        {r.medication_changes.length === 0 ? <Empty>{NONE}</Empty> : (
          <table>
            <thead><tr><th>Date</th><th>Change</th><th>Name</th><th>Kind</th><th>Reason</th></tr></thead>
            <tbody>
              {r.medication_changes.map((c, i) => (
                <tr key={i}>
                  <td>{fmtDate(c.on)}</td><td>{c.change === "STARTED" ? "Started" : "Stopped"}</td>
                  <td>{c.name}</td><td>{KIND_LABEL[c.kind]}</td><td>{c.reason ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>

      <Section n={4} title="Weight">
        {!r.weight ? <Empty>{NONE}</Empty> : (
          <table>
            <thead><tr><th>First</th><th>Last</th><th>Change</th></tr></thead>
            <tbody><tr>
              <td>{r.weight.first.kg} kg ({fmtDate(r.weight.first.measured_on)})</td>
              <td>{r.weight.last.kg} kg ({fmtDate(r.weight.last.measured_on)})</td>
              <td>{signed(r.weight.change_kg, " kg")} ({signed(r.weight.change_pct, "%")})</td>
            </tr></tbody>
          </table>
        )}
      </Section>

      <Section n={5} title="Quality of life (HHHHHMM, each 0–10, 10 is best)">
        {!r.quality_of_life ? <Empty>{NONE}</Empty> : (
          <table>
            <thead><tr><th>Item</th><th>{fmtWeek(r.quality_of_life.first.iso_week)}</th><th>{fmtWeek(r.quality_of_life.latest.iso_week)}</th><th>Change</th></tr></thead>
            <tbody>
              {CHECKIN_ITEMS.map(([k, label]) => (
                <tr key={k}>
                  <td>{label}</td><td>{r.quality_of_life!.first[k]}</td><td>{r.quality_of_life!.latest[k]}</td>
                  <td>{signed(r.quality_of_life!.change[k])}</td>
                </tr>
              ))}
              <tr className="r-total">
                <td>Total (out of 70)</td><td>{r.quality_of_life.first.total}</td><td>{r.quality_of_life.latest.total}</td>
                <td>{signed(r.quality_of_life.change.total)}</td>
              </tr>
            </tbody>
          </table>
        )}
      </Section>

      <Section n={6} title="Observations by category">
        {r.observations.length === 0 ? <Empty>{NONE}</Empty> : r.observations.map((g) => (
          <div key={g.category} className="r-group">
            <h3>{CATEGORY_LABEL[g.category]} ({g.count})</h3>
            <ul>{g.entries.map((o) => <li key={o.id}><span className="when">{fmtDateTime(o.observed_at)}</span> {o.text}</li>)}</ul>
          </div>
        ))}
      </Section>

      <Section n={7} title="Owner's questions for the vet">
        {r.questions.length === 0 ? <Empty>{NONE}</Empty> : (
          <ol>{r.questions.map((o) => <li key={o.id}>{o.text} <span className="when">({fmtDate(o.observed_at)})</span></li>)}</ol>
        )}
      </Section>

      <footer className="r-foot">{r.footer}</footer>
    </article>
  );
}

function VetVisits({ onAdded }: { onAdded: () => void }) {
  const api = useApi();
  const [f, setF] = useState({ visited_on: todayISO(), clinic: "", reason: "" });
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!f.clinic.trim()) return setError("Enter the clinic.");
    try {
      await api.addVisit({ ...f, clinic: f.clinic.trim(), reason: f.reason.trim() });
      setF({ visited_on: todayISO(), clinic: "", reason: "" });
      onAdded();
    } catch (err) { setError(errorText(err)); }
  }

  return (
    <details className="card no-print">
      <summary>Record a vet visit</summary>
      <form className="form" onSubmit={submit} aria-label="Record a vet visit">
        <div className="grid3">
          <Field label="Date"><input type="date" value={f.visited_on} required onChange={(e) => setF({ ...f, visited_on: e.target.value })} aria-label="Visit date" /></Field>
          <Field label="Clinic"><input value={f.clinic} maxLength={120} onChange={(e) => setF({ ...f, clinic: e.target.value })} aria-label="Clinic" /></Field>
          <Field label="Reason"><input value={f.reason} maxLength={300} onChange={(e) => setF({ ...f, reason: e.target.value })} aria-label="Reason" /></Field>
        </div>
        <button type="submit">Save visit</button>
        <ErrorNote error={error} />
      </form>
    </details>
  );
}

export function Report() {
  const api = useApi();
  const [basis, setBasis] = useState<ReportBasis>("since_last_visit");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState(todayISO());
  const ready = basis !== "custom" || !!from;
  const rep = useLoad(
    () => (ready ? api.report(basis === "custom" ? { basis, from, to } : { basis }) : Promise.resolve(null)),
    [basis, from, to, ready],
  );

  return (
    <>
      <div className="no-print">
        <h1>Vet report</h1>
        <div className="filters" role="group" aria-label="Report period">
          <label>Period{" "}
            <select value={basis} onChange={(e) => setBasis(e.target.value as ReportBasis)} aria-label="Period">
              <option value="since_last_visit">Since last vet visit</option>
              <option value="last_30_days">Last 30 days</option>
              <option value="custom">Custom dates</option>
            </select>
          </label>
          {basis === "custom" && (
            <>
              <label>From <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" /></label>
              <label>To <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" /></label>
            </>
          )}
          <button type="button" onClick={() => window.print()} disabled={!rep.data}>Print</button>
        </div>
        <VetVisits onAdded={rep.reload} />
      </div>
      <ErrorNote error={rep.error} />
      {basis === "custom" && !from && <p className="muted no-print">Choose a start date.</p>}
      {rep.data && <ReportView r={rep.data} />}
    </>
  );
}
