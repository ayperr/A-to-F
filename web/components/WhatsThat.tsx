"use client";
// "What's that?": snap (or pick) a window photo; Claude matches it against what the engine says is on
// your side, and writes a caption you can copy, share or put on a postcard.
import Link from "next/link";
import { useRef, useState } from "react";
import styles from "./WhatsThat.module.css";

export interface Identified {
  match: string | null;
  kind: string | null;
  confidence: "high" | "medium" | "low";
  what_you_see: string;
  caption: string;
}

export const PHOTO_HANDOFF = "atof-photo"; // sessionStorage: photo + caption carried to the postcard

/** Downscale to a ~1024 px JPEG in the browser: smaller upload, fewer image tokens, same answer. */
export async function toJpeg(src: Blob | HTMLImageElement, max = 1024): Promise<string> {
  const img = src instanceof HTMLImageElement ? src : await createImageBitmap(src);
  const w = "naturalWidth" in img ? img.naturalWidth : img.width;
  const h = "naturalHeight" in img ? img.naturalHeight : img.height;
  const k = Math.min(1, max / Math.max(w, h));
  const c = document.createElement("canvas");
  c.width = Math.round(w * k);
  c.height = Math.round(h * k);
  c.getContext("2d")!.drawImage(img, 0, 0, c.width, c.height);
  return c.toDataURL("image/jpeg", 0.82);
}

const TITLE: Record<string, string> = { sky: "Sky and clouds", clouds: "Sky and clouds", unknown: "Not sure" };

export default function WhatsThat({
  routeId, date, time, side, minute, photo, postcardHref, onResult, label = "What's that? Snap the view",
}: {
  routeId: string; date: string; time: string; side: "A" | "F"; minute: number | null;
  photo?: HTMLImageElement | null; postcardHref?: string; onResult?: (r: Identified, dataUrl: string) => void; label?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [state, setState] = useState<{ busy?: boolean; error?: string; result?: Identified; dataUrl?: string }>({});
  const [copied, setCopied] = useState(false);

  const ask = async (dataUrl: string) => {
    setState({ busy: true, dataUrl });
    try {
      const r = await fetch("/api/identify", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ route: routeId, d: date, t: time, side, minute, image: dataUrl }),
      });
      const j = await r.json();
      if (!r.ok) return setState({ error: j.error ?? "Something went wrong.", dataUrl });
      setState({ result: j, dataUrl });
      onResult?.(j, dataUrl);
    } catch {
      setState({ error: "No connection. On board, connect to the plane's wifi first.", dataUrl });
    }
  };

  const pick = async (f: File | undefined) => { if (f) await ask(await toJpeg(f)); };
  const share = async (text: string) => {
    if (navigator.share) { try { await navigator.share({ text }); return; } catch { /* closed */ } }
    try { await navigator.clipboard.writeText(text); setCopied(true); setTimeout(() => setCopied(false), 1500); } catch { /* no clipboard */ }
  };
  const toPostcard = () => {
    try { sessionStorage.setItem(PHOTO_HANDOFF, JSON.stringify({ photo: state.dataUrl, result: state.result })); } catch { /* storage off */ }
  };

  const r = state.result;
  return (
    <div className={styles.box}>
      {photo ? (
        <button type="button" className={styles.ask} disabled={state.busy} onClick={async () => ask(await toJpeg(photo))}>
          {state.busy ? "Looking at your photo…" : label}
        </button>
      ) : (
        <>
          <button type="button" className={styles.ask} disabled={state.busy} onClick={() => input.current?.click()}>
            {state.busy ? "Looking at your photo…" : label}
          </button>
          <input ref={input} type="file" accept="image/*" capture="environment" hidden onChange={(e) => pick(e.target.files?.[0])} />
        </>
      )}
      {!r && !state.error && !state.busy && (
        <p className={styles.hint}>Point your phone out of the window. We match it against what&rsquo;s on your side right now.</p>
      )}
      <div aria-live="polite">
        {state.error && <p className={styles.error}>{state.error}</p>}
        {r && (
          <div className={styles.result}>
            <p className={styles.title}>
              {r.match ?? TITLE[r.match ?? "unknown"] ?? "Not sure"}
              {r.match && <span className={styles[r.confidence]}>{r.confidence === "high" ? "Confident" : r.confidence === "medium" ? "Likely" : "A guess"}</span>}
            </p>
            <p className={styles.what}>{r.what_you_see}</p>
            <div className={styles.caption}>
              <span>{r.caption}</span>
              <button type="button" onClick={() => share(r.caption)}>{copied ? "Copied" : "Share caption"}</button>
            </div>
            {postcardHref && <Link href={postcardHref} onClick={toPostcard} className={styles.postcard}>Put it on a postcard</Link>}
          </div>
        )}
      </div>
    </div>
  );
}
