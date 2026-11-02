import type { Metadata } from "next";
import styles from "../about/about.module.css";

export const metadata: Metadata = { title: "Privacy" };

export default function Privacy() {
  return (
    <article className={styles.page}>
      <h1>Privacy</h1>
      <p className={styles.lead}>A to F has no accounts, no ads and no tracking cookies. Here is everything that leaves your device.</p>
      <ul className={styles.limits}>
        <li>Planning a flight, playing the window and making a postcard all run in your browser. Your postcard photo is never uploaded.</li>
        <li>&ldquo;Use my phone&rsquo;s GPS&rdquo; reads your location in the browser to move the 3D view. It is not sent anywhere.</li>
        <li>Looking up a flight number sends the number and date to AeroDataBox, a flight-schedule service, to find the airports and departure time. Nothing else is sent.</li>
        <li>&ldquo;What&rsquo;s that?&rdquo; and &ldquo;What&rsquo;s in my photo?&rdquo; send the photo you pick (shrunk to about 1000 pixels), your route, date, time and seat side to our server, which asks Anthropic&rsquo;s Claude what it shows. We don&rsquo;t store the photo. Anthropic&rsquo;s API doesn&rsquo;t use it for training.</li>
        <li>&ldquo;About&rdquo; on a landmark asks our server for a short note. It reads the landmark&rsquo;s Wikipedia summary and asks Claude to shorten it. No personal details are sent.</li>
        <li>The 3D view loads map tiles from Cesium ion, which sees your IP address like any map service.</li>
        <li>The A to F MCP server and the Claude plugin receive the route, date and time you ask about, and nothing else.</li>
        <li>The site is hosted on Vercel, which keeps standard request logs for a short time.</li>
      </ul>
      <p className={styles.lead}>Questions: open an issue on the project&rsquo;s GitHub page.</p>
    </article>
  );
}
