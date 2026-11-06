import { useEffect, useState } from "react";
import { NavLink, Navigate, Route, Routes } from "react-router-dom";
import { ErrorNote, errorText } from "./components/ui";
import { Measures } from "./pages/Measures";
import { Medicines } from "./pages/Medicines";
import { Observations } from "./pages/Observations";
import { Profile } from "./pages/Profile";
import { Report } from "./pages/Report";
import { Today } from "./pages/Today";
import { ApiError, useApi } from "./services/api";
import type { Dog } from "./services/types";

export default function App() {
  const api = useApi();
  const [dog, setDog] = useState<Dog | null | undefined>(undefined); // undefined = loading, null = first run
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api.getDog().then(setDog, (e) => {
      if (e instanceof ApiError && e.status === 404) setDog(null);
      else setError(errorText(e));
    });
  }, [api]);

  if (error) return <main className="page"><ErrorNote error={error} /></main>;
  if (dog === undefined) return <main className="page"><p className="muted">Loading…</p></main>;
  if (dog === null) return <main className="page"><Profile dog={null} firstRun onSaved={setDog} /></main>;

  const nav: [string, string][] = [
    ["/", "Today"], ["/observations", "Observations"], ["/medicines", "Medicines"], ["/measures", "Measures"],
    ["/report", "Vet report"], ["/profile", dog.name],
  ];
  return (
    <>
      <header className="top no-print">
        <span className="brand">Canine Health Atlas</span>
        <nav aria-label="Main">
          {nav.map(([to, label]) => <NavLink key={to} to={to} end={to === "/"}>{label}</NavLink>)}
        </nav>
      </header>
      <main className="page">
        <Routes>
          <Route path="/" element={<Today dog={dog} />} />
          <Route path="/observations" element={<Observations />} />
          <Route path="/medicines" element={<Medicines />} />
          <Route path="/measures" element={<Measures />} />
          <Route path="/report" element={<Report />} />
          <Route path="/profile" element={<Profile dog={dog} onSaved={setDog} />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </>
  );
}
