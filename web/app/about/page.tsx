import type { Metadata } from "next";
import { loadRoute } from "@/lib/detail";
import { routes } from "@/lib/routes";
import styles from "./about.module.css";

export const metadata: Metadata = { title: "How it works" };

const SIDE: Record<string, string> = { A: "left", F: "right", below: "below" };

export default function About() {
  const details = routes.map((r) => loadRoute(r.id)!);
  const unique = new Set(details.flatMap((d) => d.landmarks.map((l) => l.wikidata))).size;

  return (
    <article className={styles.page}>
      <h1>How A to F works</h1>
      <p className={styles.lead}>
        &ldquo;Which side has the view?&rdquo; is the question friends have asked me most since I started working
        for the airline KLM, and passengers sometimes asked it at the gate as well. The answer depends on the route,
        the date, the departure time and the position of the sun, so most people simply guess. A to F answers it with
        geometry rather than guesswork. For everyone who cannot see out, in a middle or aisle seat, next to a closed
        blind or on a night flight, there is the Virtual Window: the view from the window seat, live or replayed, in
        the real light of that moment or in full daylight or full night.
      </p>

      <ol className={styles.steps}>
        <li>
          <h2>The flight path</h2>
          <p>
            One position per minute from takeoff to landing. For now this is the shortest route between the two
            airports at a typical cruising height. Real flights bend with the wind and air traffic control, which is
            why anything within 40 km of the line is marked as possibly on either side. Live flights use the real
            position of the plane instead.
          </p>
        </li>
        <li>
          <h2>Where the sun is</h2>
          <p>
            For every minute, the sun&rsquo;s direction and height above the horizon at the plane&rsquo;s position,
            using the standard NOAA solar formulas. At 11 km up the horizon sits about 3 degrees lower than on the
            ground, so you see the sun for a few minutes after it has set for people below. The calculation matches
            the open-source astral library exactly across 20,000 random times and places.
          </p>
        </li>
        <li>
          <h2>Left or right</h2>
          <p>
            Compare the sun&rsquo;s direction with the direction the plane is pointing. If the sun is to the left of
            the nose, it&rsquo;s on the A side; to the right, the F side. A window shows you roughly what&rsquo;s
            beside you, not straight ahead, so the sun has to be at least 20 degrees off the nose to count. Near
            sunset the coloured sky spreads wide, so golden light counts from 5 degrees.
          </p>
        </li>
        <li>
          <h2>What you can see</h2>
          <p>
            {unique} landmarks along these routes: mountain ranges, canyons, lakes, islands, capes and big cities,
            each from Natural Earth with a Wikidata ID. Terrain only counts in daylight. Cities count at night too,
            because their lights are the view.
          </p>
        </li>
        <li>
          <h2>The answer</h2>
          <p>
            Sunset or sunrise light wins first. Otherwise, the side with clearly more to see. Otherwise, in daylight,
            the side away from the sun: no glare, and the ground is lit from behind you. The same engine runs in
            Python for the data and in your browser for any date, and 320 test flights check that both give identical
            answers.
          </p>
        </li>
        <li>
          <h2>Where Claude fits</h2>
          <p>
            Geometry decides the side and Claude explains it, never the other way round. Claude writes the window
            narration, explains landmarks and tells you what is in your photo, with information and fun facts about it.
            Every sentence it writes is checked against the engine first, and a sentence naming the wrong side is
            dropped.
          </p>
        </li>
      </ol>

      <section className={styles.section}>
        <h2>Limits</h2>
        <ul className={styles.limits}>
          <li>Clouds are not forecast. A sunset on your side can still be a grey one.</li>
          <li>There are no seat maps here, so the wing is not taken into account. Rows behind the wing usually have the clearer view down.</li>
          <li>Live flights only show planes the volunteer adsb.lol receivers can hear, so flights over the ocean can drop out. Their routes come from a callsign database, not from JetBlue, and can be wrong. The time since takeoff in a live view is estimated from where the plane is.</li>
        </ul>
      </section>

      <section className={styles.section}>
        <h2>Every landmark, with its source</h2>
        <p className={styles.lead}>Minutes are after takeoff on the approximate path.</p>
        {details.map((d) => (
          <details key={d.id} className={styles.route}>
            <summary>{d.origin.iata} to {d.dest.iata}, {d.landmarks.length} landmarks</summary>
            {d.landmarks.length ? (
              <table className={styles.table}>
                <thead><tr><th scope="col">Minute</th><th scope="col">Landmark</th><th scope="col">Side</th><th scope="col">Distance</th><th scope="col">Wikidata</th></tr></thead>
                <tbody>
                  {d.landmarks.map((l) => (
                    <tr key={l.name}>
                      <td>{l.minute}</td>
                      <td>{l.name}</td>
                      <td>{SIDE[l.side]}{l.confidence === "low" ? ", could be either" : ""}</td>
                      <td>{l.dist_km} km</td>
                      <td><a href={`https://www.wikidata.org/wiki/${l.wikidata}`} rel="noreferrer" target="_blank">{l.wikidata}</a></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <p className={styles.empty}>Open sea most of the way. The view on this one is the sky.</p>
            )}
          </details>
        ))}
      </section>

      <section className={styles.section}>
        <h2>Data and credits</h2>
        <ul className={styles.limits}>
          <li>Landmarks and map outlines: Natural Earth (public domain), linked to Wikidata.</li>
          <li>Live positions: <a href="https://adsb.lol">adsb.lol</a> community receiver network (ODbL). Live routes: <a href="https://www.adsbdb.com">adsbdb.com</a>, callsign data by David Taylor and Jim Mason, looked up per flight and never stored.</li>
          <li>3D view: CesiumJS and Cesium ion, used under their free personal and education terms.</li>
          <li>Built with Claude for the ieNYC × DataCamp &ldquo;Be a Master in Claude&rdquo; challenge. Code on <a href="https://github.com/ayperr/A-to-F">GitHub</a>.</li>
          <li>Independent student project. Not affiliated with or endorsed by JetBlue Airways.</li>
        </ul>
      </section>
    </article>
  );
}
