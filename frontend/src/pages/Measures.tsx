import { useEffect, useState, type FormEvent } from "react";
import { CartesianGrid, Legend, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { Empty, ErrorNote, Field, Saved, errorText, useLoad } from "../components/ui";
import { useApi } from "../services/api";
import { CHECKIN_ITEMS, type CheckinScores } from "../services/types";
import { fmtDate, fmtWeek, isoWeek, todayISO } from "../utils/dates";

// Muted, distinguishable series colours for the clinical charts.
const SERIES = ["#2f6f9f", "#b5562b", "#4f8a3a", "#8a4fa3", "#b08a1e", "#c03c5a", "#3a8a86"];

function Weight() {
  const api = useApi();
  const list = useLoad(() => api.listWeights());
  const [on, setOn] = useState(todayISO());
  const [kg, setKg] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null); setSaved(null);
    const v = Number(kg);
    if (!(v > 0 && v <= 120)) return setError("Weight must be more than 0 and at most 120 kg.");
    try {
      await api.addWeight(on, v);
      setKg(""); setSaved("Weight saved."); list.reload();
    } catch (err) { setError(errorText(err)); }
  }

  return (
    <section>
      <h2>Weight</h2>
      <form className="card form" onSubmit={submit} aria-label="Add a weight">
        <div className="grid3">
          <Field label="Date"><input type="date" value={on} max={todayISO()} required onChange={(e) => setOn(e.target.value)} aria-label="Date" /></Field>
          <Field label="Weight (kg)"><input type="number" step="0.1" min="0.1" max="120" value={kg} onChange={(e) => setKg(e.target.value)} aria-label="Weight (kg)" /></Field>
        </div>
        <div className="row"><button type="submit">Save weight</button><Saved text={saved} /></div>
        <ErrorNote error={error} />
      </form>
      <ErrorNote error={list.error} />
      {list.data?.length === 0 && <Empty>No weights recorded yet.</Empty>}
      {!!list.data?.length && (
        <div className="chart" aria-label="Weight chart">
          <ResponsiveContainer width="100%" height={240}>
            <LineChart data={list.data.map((w) => ({ date: fmtDate(w.measured_on), kg: w.kg }))}>
              <CartesianGrid stroke="#e5e7eb" />
              <XAxis dataKey="date" fontSize={12} />
              <YAxis unit=" kg" fontSize={12} domain={["auto", "auto"]} width={60} />
              <Tooltip />
              <Line type="monotone" dataKey="kg" name="Weight (kg)" stroke={SERIES[0]} dot isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </section>
  );
}

const blankScores = () => Object.fromEntries(CHECKIN_ITEMS.map(([k]) => [k, 5])) as CheckinScores;

function Checkin() {
  const api = useApi();
  const list = useLoad(() => api.listCheckins());
  const [week, setWeek] = useState(isoWeek());
  const [scores, setScores] = useState<CheckinScores>(blankScores);
  const [note, setNote] = useState("");
  const [exists, setExists] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);
  const total = Object.values(scores).reduce((a, b) => a + b, 0);

  useEffect(() => {
    setExists(!!list.data?.some((c) => c.iso_week === week));
  }, [list.data, week]);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null); setSaved(null);
    // One check-in per ISO week; a second replaces the first after confirmation (spec §5.5).
    if (exists && !window.confirm(`There is already a check-in for ${week}. Replace it?`)) return;
    try {
      const c = await api.putCheckin(week, scores, note.trim() || null);
      setSaved(`Check-in for ${c.iso_week} saved: ${c.total} / 70.`);
      setNote(""); list.reload();
    } catch (err) {
      setError(errorText(err));
    }
  }

  const rows = (list.data ?? []).map((c) => ({ ...c, week: c.iso_week }));

  return (
    <section>
      <h2>Weekly quality-of-life check-in (HHHHHMM)</h2>
      <form className="card form" onSubmit={submit} aria-label="Weekly check-in">
        <Field label="Week">
          <input type="week" value={week} max={isoWeek()} required onChange={(e) => setWeek(e.target.value)} aria-label="Week" />
        </Field>
        {exists && <p className="muted">A check-in for this week exists; saving will replace it.</p>}
        <div className="scores">
          {CHECKIN_ITEMS.map(([k, label, hint]) => (
            <label key={k} className="score">
              <span className="label">{label}</span>
              <input type="range" min={0} max={10} step={1} value={scores[k]} aria-label={label}
                     onChange={(e) => setScores({ ...scores, [k]: Number(e.target.value) })} />
              <output>{scores[k]}</output>
              <span className="hint">{hint}. 0 is worst.</span>
            </label>
          ))}
        </div>
        <p className="total">Total: <strong>{total}</strong> / 70</p>
        <Field label="Note (optional)"><input value={note} maxLength={1000} onChange={(e) => setNote(e.target.value)} aria-label="Note" /></Field>
        <div className="row"><button type="submit">Save check-in</button><Saved text={saved} /></div>
        <ErrorNote error={error} />
      </form>
      <ErrorNote error={list.error} />
      {rows.length === 0 && <Empty>No check-ins yet.</Empty>}
      {rows.length > 0 && (
        <>
          <h3>Each item (0–10)</h3>
          <div className="chart" aria-label="Check-in items chart">
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={rows}>
                <CartesianGrid stroke="#e5e7eb" />
                <XAxis dataKey="week" fontSize={12} />
                <YAxis domain={[0, 10]} ticks={[0, 2, 4, 6, 8, 10]} fontSize={12} width={30} />
                <Tooltip />
                <Legend />
                {CHECKIN_ITEMS.map(([k, label], i) => (
                  <Line key={k} type="monotone" dataKey={k} name={label} stroke={SERIES[i]} isAnimationActive={false} />
                ))}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <h3>Total (0–70)</h3>
          <div className="chart" aria-label="Check-in total chart">
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={rows}>
                <CartesianGrid stroke="#e5e7eb" />
                <XAxis dataKey="week" fontSize={12} />
                <YAxis domain={[0, 70]} fontSize={12} width={30} />
                <Tooltip />
                <Line type="monotone" dataKey="total" name="Total" stroke="#111827" isAnimationActive={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
          <table>
            <thead><tr><th>Week</th>{CHECKIN_ITEMS.map(([k, l]) => <th key={k}>{l}</th>)}<th>Total</th><th>Note</th></tr></thead>
            <tbody>
              {rows.slice().reverse().map((c) => (
                <tr key={c.iso_week}>
                  <td className="nowrap">{fmtWeek(c.iso_week)}</td>
                  {CHECKIN_ITEMS.map(([k]) => <td key={k}>{c[k]}</td>)}
                  <td><strong>{c.total}</strong></td><td>{c.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </section>
  );
}

export function Measures() {
  return (
    <>
      <h1>Measures</h1>
      <Weight />
      <Checkin />
    </>
  );
}
