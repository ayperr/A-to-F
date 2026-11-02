import type { Metadata } from "next";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import YearGrid, { type Insights } from "@/components/YearGrid";
import { routes } from "@/lib/routes";
import styles from "./insights.module.css";

export const metadata: Metadata = { title: "Insights" };

type Eval = {
  generated: string; n: number; models: string[]; batch: boolean;
  truth_split: { A: number; F: number };
  results: Record<string, { model: string; condition: "alone" | "engine"; correct: number; n: number; accuracy: number; unparsed: number;
    examples_wrong: { case: string; truth: string; got: string; said: string }[] }>;
};

const read = <T,>(f: string): T | null => {
  const p = join(process.cwd(), "public", "data", f);
  return existsSync(p) ? (JSON.parse(readFileSync(p, "utf8")) as T) : null;
};

const MODEL_NAME: Record<string, string> = { "claude-haiku-5-5": "Claude Haiku 5.5", "claude-sonnet-5-5": "Claude Sonnet 5.5" };

export default function InsightsPage() {
  const data = read<Insights>("insights.json")!;
  const evaluation = read<Eval>("evaluation.json");

  // Headline: the route whose answer is most consistent for afternoon departures in winter.
  const winter = [0, 1, 10, 11];
  const afternoon = data.hours.flatMap((h, i) => (h >= 13 && h <= 17 ? [i] : []));
  const headlines = Object.entries(data.routes)
    .map(([id, { grid }]) => {
      let a = 0, f = 0, total = 0;
      for (const m of winter) for (const h of afternoon) { a += grid[m][h].A; f += grid[m][h].F; total += data.days_sampled.length; }
      const side = a >= f ? "A" : "F";
      return { id, side, share: Math.max(a, f) / total };
    })
    .sort((x, y) => y.share - x.share)
    .slice(0, 3);

  return (
    <article className={styles.page}>
      <h1>A year of window seats</h1>
      <p className={styles.lead}>
        Every square is a departure time in a month of {data.year}, worked out by the same engine as the planner on
        three days each month.
      </p>

      <ul className={styles.facts}>
        {headlines.map((h) => {
          const r = routes.find((x) => x.id === h.id)!;
          return (
            <li key={h.id}>
              <b>{Math.round(h.share * 100)}%</b> of winter afternoon departures from {r.origin_city} to {r.dest_city}
              {" "}favour the {h.side === "A" ? "left" : "right"} window.
            </li>
          );
        })}
      </ul>

      <section className={styles.section}>
        <h2>Which side wins, by month and departure time</h2>
        <YearGrid data={data} />
      </section>

      <section className={styles.section} id="evaluation">
        <h2>Can a chatbot tell you which side?</h2>
        <p className={styles.lead}>
          We asked Claude about flights where exactly one side gets sunset or sunrise light, once with just the route
          and time, and once with the two numbers the engine computes: the plane&rsquo;s heading and the sun&rsquo;s
          direction. The engine&rsquo;s answer is the reference.
        </p>
        {evaluation ? (
          <>
            <div className={styles.bars} role="table" aria-label="Accuracy by model and condition">
              {Object.values(evaluation.results).map((r) => (
                <div key={`${r.model}${r.condition}`} className={styles.bar} role="row">
                  <span role="rowheader">
                    {MODEL_NAME[r.model] ?? r.model}, {r.condition === "alone" ? "on its own" : "with the engine's numbers"}
                  </span>
                  <span className={styles.track} role="cell">
                    <span className={r.condition === "alone" ? styles.fillAlone : styles.fillEngine} style={{ width: `${r.accuracy * 100}%` }} />
                  </span>
                  <span role="cell" className={styles.value}>{Math.round(r.accuracy * 100)}%</span>
                </div>
              ))}
            </div>
            <p className={styles.fine}>
              {evaluation.n} flights ({evaluation.truth_split.A} left, {evaluation.truth_split.F} right), so a coin flip
              scores about 50%. Run on {evaluation.generated}
              {evaluation.batch ? " with the Message Batches API" : ""}. Unanswered or unreadable replies count as wrong.
            </p>
          </>
        ) : (
          <p className={styles.pending}>
            Results appear here after the evaluation runs (<code>python pipeline/evaluate.py</code>).
          </p>
        )}
      </section>
    </article>
  );
}
