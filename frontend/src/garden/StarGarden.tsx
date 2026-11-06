import { useEffect, useRef, useState } from "react";
import { useApi } from "../services/api";
import type { Dog, Medication, SavedKind } from "../services/types";
import { createGarden, loadPrefs, savePrefs, type Garden } from "./engine";
import { FeedingLog } from "./FeedingLog";
import "./garden.css";

const WORD: Record<SavedKind, string> = { observation: "observation", dose: "dose", weight: "weight", checkin: "check-in" };

/** The optional fun corner on Today (spec §4, §5.7). Never printed, never in the vet report. */
export function StarGarden({ dog, meds }: { dog: Dog; meds: Medication[] }) {
  const api = useApi();
  const canvas = useRef<HTMLCanvasElement>(null);
  const garden = useRef<Garden | null>(null);
  const [collapsed, setCollapsed] = useState(() => loadPrefs().collapsed);
  const [audio, setAudio] = useState(() => ({ music: loadPrefs().music, muted: loadPrefs().muted }));

  useEffect(() => {
    if (collapsed || !canvas.current) return;
    let cancelled = false;
    let everStars = 0; // the very first star ever comes from Kuro (bridge dog 0)
    const drop = (msg: (n: string) => string) => {
      garden.current?.dropStar(msg, everStars === 0 ? 0 : undefined);
      everStars += 1;
    };
    const el = canvas.current;
    let off = () => {};
    api.stars().then(async (s) => {
      if (cancelled) return;
      everStars = s.stars_waiting + s.stars_caught;
      garden.current = createGarden(el, {
        coat: dog.coat, caught: s.stars_caught, waiting: s.stars_waiting,
        onCatch: () => void api.catchStar().catch(() => {}),
      });
      off = api.onSaved((kind) => drop((n) => `${n} dropped a star for your ${WORD[kind]}!`));
      const v = await api.visitStar().catch(() => null);
      if (!cancelled && v?.added) {
        setTimeout(() => {
          if (cancelled) return;
          drop((n) => (everStars === 0 ? `Hi! ${n} dropped a welcome star!` : `Welcome back! ${n} dropped a star!`));
        }, 1000);
      }
    }, () => {});
    return () => {
      cancelled = true;
      off();
      garden.current?.destroy();
      garden.current = null;
    };
    // The coat is applied live below; rebuilding the scene is only needed when it is opened.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [collapsed, api]);

  useEffect(() => garden.current?.setCoat(dog.coat), [dog.coat]);

  function toggle() {
    const p = loadPrefs();
    p.collapsed = !collapsed;
    savePrefs(p);
    setCollapsed(p.collapsed);
  }
  function toggleMusic() {
    const v = !audio.music;
    if (garden.current) garden.current.setMusic(v);
    else savePrefs({ ...loadPrefs(), music: v });
    setAudio((a) => ({ ...a, music: v }));
  }
  function toggleSound() {
    const v = !audio.muted;
    if (garden.current) garden.current.setMuted(v);
    else savePrefs({ ...loadPrefs(), muted: v });
    setAudio((a) => ({ ...a, muted: v }));
  }

  return (
    <section className="garden no-print" aria-label="Star garden">
      <div className="garden-bar">
        <span>★ Star garden</span>
        <button type="button" className="link" onClick={toggle} aria-expanded={!collapsed}>
          {collapsed ? "Show" : "Hide"}
        </button>
      </div>
      {!collapsed && (
        <div className="g-wrap">
          <div className="g-stage">
            <canvas ref={canvas} width={400} height={225}
                    aria-label={`${dog.name} in a pixel garden under a rainbow bridge where Kuro, Attila, Gladys and Lucky sit`} />
            <div className="g-audio">
              <button type="button" className="g-btn g-small" onClick={toggleMusic}>{audio.music ? "MUSIC ON" : "MUSIC OFF"}</button>
              <button type="button" className="g-btn g-small" onClick={toggleSound}>{audio.muted ? "SOUND OFF" : "SOUND ON"}</button>
            </div>
          </div>
          <p className="g-hint">
            Walk {dog.name} with ← → (or A / D) and jump with ↑ (or W / Space), or tap. Every record you save drops a
            star from the rainbow bridge; walk into it to catch it. Stars reward logging, never results.
          </p>
          <FeedingLog dogName={dog.name} meds={meds} />
        </div>
      )}
    </section>
  );
}
