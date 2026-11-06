import { useState, type FormEvent } from "react";
import { ErrorNote, Field, Saved, errorText } from "../components/ui";
import { useApi } from "../services/api";
import { COATS, type Dog, type Sex } from "../services/types";
import { todayISO } from "../utils/dates";

/** First-run setup and later edits of the one dog (spec §5.1). */
export function Profile({ dog, onSaved, firstRun }: { dog: Dog | null; onSaved: (d: Dog) => void; firstRun?: boolean }) {
  const api = useApi();
  const [f, setF] = useState<Dog>(dog ?? { name: "", birth_date: null, sex: "UNKNOWN", breed: "", coat: "blue" });
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setError(null); setSaved(null);
    if (!f.name.trim()) return setError("Enter your dog's name.");
    try {
      const d = await api.putDog({ ...f, name: f.name.trim(), breed: f.breed.trim(), birth_date: f.birth_date || null });
      setSaved("Profile saved.");
      onSaved(d);
    } catch (err) { setError(errorText(err)); }
  }

  return (
    <>
      <h1>{firstRun ? "Welcome. Who are you caring for?" : "Dog profile"}</h1>
      {firstRun && <p className="muted">The Canine Health Atlas keeps one dog's care record and turns it into a report for the vet.</p>}
      <form className="card form" onSubmit={submit} aria-label="Dog profile">
        <div className="grid3">
          <Field label="Name"><input value={f.name} maxLength={80} onChange={(e) => setF({ ...f, name: e.target.value })} aria-label="Name" /></Field>
          <Field label="Birth date (optional)">
            <input type="date" max={todayISO()} value={f.birth_date ?? ""} onChange={(e) => setF({ ...f, birth_date: e.target.value || null })} aria-label="Birth date" />
          </Field>
          <Field label="Sex">
            <select value={f.sex} onChange={(e) => setF({ ...f, sex: e.target.value as Sex })} aria-label="Sex">
              <option value="FEMALE">Female</option><option value="MALE">Male</option><option value="UNKNOWN">Not recorded</option>
            </select>
          </Field>
          <Field label="Breed (optional)"><input value={f.breed} maxLength={80} onChange={(e) => setF({ ...f, breed: e.target.value })} aria-label="Breed" /></Field>
          <Field label="Coat" hint="Used for your dog in the star garden">
            <select value={f.coat} onChange={(e) => setF({ ...f, coat: e.target.value as Dog["coat"] })} aria-label="Coat">
              {COATS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
            </select>
          </Field>
        </div>
        <div className="row"><button type="submit">{firstRun ? "Start" : "Save"}</button><Saved text={saved} /></div>
        <ErrorNote error={error} />
      </form>
    </>
  );
}
