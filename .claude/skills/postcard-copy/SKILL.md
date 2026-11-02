---
name: postcard-copy
description: Rules for A to F postcard and social-share text (the postcard canvas, share captions, Flight Wrapped mockups). Use when writing or changing any words that end up on a shareable image.
---

A postcard is something the passenger posts as themselves, so it speaks in the first person ("out my window").

Layout of the 1080 x 1350 card (web/components/Postcard.tsx): the passenger's photo is the hero.
Top row: big window (540 x 720) on the left, route stacked on the right. Bottom row: small map left, facts right.
1. Hero window: the passenger's photo, cover-fitted, with the navy frame and pulled-down shade from the logo.
   No photo: a pale sky with the low blue sun, never an empty box.
2. Route codes stacked with the seat letter between them (JFK / A / LAX). The letter is the brand; keep it in
   the accent blue (#1F5FD6). Under it: cities ("New York to Los Angeles"; break after "to", never inside a
   city name), weekday, date ("12 November 2026"), then "Seat A, left window" in accent blue.
3. Small map. Labels are placed without overlap; it's fine to drop a label, never to overlap two.
4. One light fact ("Sunset on my side at 17:55") with the minutes and the time zone underneath.
5. "Out my window" and up to five landmark names, one per line, the most notable first, then in flight order.
   Drop names that don't fit the row; never shrink them.
6. Footer under a thin rule: tagline "Every seat gets the view" in accent-blue italic; credit line that says it's
   independent and not affiliated with JetBlue.

Rules
- Every side, time and landmark comes from the engine output for that flight. Never type one in.
- Sentence case. No hashtags or emoji on the card; captions may add at most two hashtags.
- Times always say whose clock they are ("New York time").
- If there's no golden light, say so honestly: "A night flight" or "Daylight all the way".
- JetBlue is only named in the not-affiliated line. No JetBlue logos, fonts or exact brand colours; our own white and blue palette.

Share caption template (Web Share text field):
"<ORIGIN> to <DEST>, seat <LETTER>. <one light fact>. Every seat gets the view."
