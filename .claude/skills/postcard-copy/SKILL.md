---
name: postcard-copy
description: Rules for A to F postcard and social-share text (the postcard canvas, share captions, Flight Wrapped mockups). Use when writing or changing any words that end up on a shareable image.
---

A postcard is something the passenger posts as themselves, so it speaks in the first person ("out my window").

Structure on the 1080 x 1350 card (web/components/Postcard.tsx)
1. Route codes with the seat letter between them (JFK A LAX). The letter is the brand; keep it in the accent blue (#1F5FD6).
2. Cities, then the date written out with the seat side ("Thursday, 12 November 2026, seat A by the left window").
3. Map. Labels are placed without overlap; it's fine to drop a label, never to overlap two.
4. One light fact ("Sunset on my side at 17:55") with the minutes and the time zone underneath.
5. "Out my window:" and at most five landmark names, the most notable first, then in flight order.
6. Footer: tagline "Every seat gets the view" in accent-blue italic; credit line that says it's independent
   and not affiliated with JetBlue.

Rules
- Every side, time and landmark comes from the engine output for that flight. Never type one in.
- Sentence case. No hashtags or emoji on the card; captions may add at most two hashtags.
- Times always say whose clock they are ("New York time").
- If there's no golden light, say so honestly: "A night flight" or "Daylight all the way".
- JetBlue is only named in the not-affiliated line. No JetBlue logos, fonts or exact brand colours; our own white and blue palette.

Share caption template (Web Share text field):
"<ORIGIN> to <DEST>, seat <LETTER>. <one light fact>. Every seat gets the view."
