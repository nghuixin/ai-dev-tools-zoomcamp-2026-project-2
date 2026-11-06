import { useState, type FormEvent } from "react";
import { useApi } from "../services/api";
import { CATEGORIES, CATEGORY_LABEL, type AISuggestion, type Category, type Observation } from "../services/types";
import { localInputToISO, localInputValue } from "../utils/dates";
import { ErrorNote, Field, Saved, errorText } from "./ui";

const MAX = 2000;

function Tag({ field, value, suggestion }: { field: "category" | "summary"; value: string; suggestion: AISuggestion | null }) {
  if (!suggestion) return null;
  const edited = value !== suggestion[field];
  return <span className={`tag ${edited ? "tag-edited" : "tag-ai"}`}>{edited ? "EDITED" : "AI"}</span>;
}

export function ObservationForm({
  initial, onSaved,
}: { initial?: { category?: Category; text?: string }; onSaved?: (o: Observation) => void }) {
  const api = useApi();
  const [observedAt, setObservedAt] = useState(localInputValue());
  const [category, setCategory] = useState<Category>(initial?.category ?? "OTHER");
  const [text, setText] = useState(initial?.text ?? "");
  const [summary, setSummary] = useState("");
  const [forVet, setForVet] = useState(false);
  const [suggestion, setSuggestion] = useState<AISuggestion | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function analyze() {
    if (!text.trim()) return;
    setAnalyzing(true);
    setUnavailable(false);
    try {
      const s = await api.analyze(text);
      setSuggestion(s);
      setCategory(s.category);
      setSummary(s.summary);
    } catch {
      // Analyze is optional: a failure never blocks saving (spec §5.3).
      setUnavailable(true);
    } finally {
      setAnalyzing(false);
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (!text.trim()) {
      setError("Describe what you saw.");
      return;
    }
    setBusy(true);
    setError(null);
    setSaved(null);
    try {
      const edited = suggestion
        ? (["category", "summary"] as const).filter((f) => (f === "category" ? category : summary) !== suggestion[f])
        : [];
      const o = await api.createObservation({
        observed_at: localInputToISO(observedAt), category, text: text.trim(), summary: summary.trim() || null,
        for_vet: forVet, ai_suggestion: suggestion, edited_fields: edited,
      });
      setText(""); setSummary(""); setSuggestion(null); setForVet(false); setUnavailable(false);
      setCategory("OTHER"); setObservedAt(localInputValue());
      setSaved("Observation saved.");
      onSaved?.(o);
    } catch (err) {
      setError(errorText(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <form className="card form" onSubmit={submit} aria-label="Log an observation">
      <Field label="What did you see?" hint={`${text.length} / ${MAX}`}>
        <textarea value={text} maxLength={MAX} rows={3} onChange={(e) => setText(e.target.value)}
                  placeholder="In your own words, e.g. Slow to get up after a nap, then fine on the walk" />
      </Field>
      <div className="row">
        <button type="button" className="secondary" onClick={analyze} disabled={analyzing || !text.trim()}>
          {analyzing ? "Analyzing…" : "Analyze"}
        </button>
        {unavailable && <span className="muted" role="status">suggestion unavailable</span>}
      </div>
      <div className="grid2">
        <Field label="Category">
          <span className="with-tag">
            <select value={category} onChange={(e) => setCategory(e.target.value as Category)} aria-label="Category">
              {CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
            </select>
            <Tag field="category" value={category} suggestion={suggestion} />
          </span>
        </Field>
        <Field label="When">
          <input type="datetime-local" value={observedAt} required max={localInputValue()}
                 onChange={(e) => setObservedAt(e.target.value)} aria-label="When" />
        </Field>
      </div>
      <Field label="Summary (optional)">
        <span className="with-tag">
          <input value={summary} maxLength={200} onChange={(e) => setSummary(e.target.value)} aria-label="Summary" />
          <Tag field="summary" value={summary} suggestion={suggestion} />
        </span>
      </Field>
      <label className="check">
        <input type="checkbox" checked={forVet} onChange={(e) => setForVet(e.target.checked)} />
        Add to questions for the vet
      </label>
      <div className="row">
        <button type="submit" disabled={busy}>{busy ? "Saving…" : "Save observation"}</button>
        <Saved text={saved} />
      </div>
      <ErrorNote error={error} />
    </form>
  );
}
