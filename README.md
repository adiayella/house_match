# HouseMatch

A Telegram bot that helps three people choose a shared flat together, by getting their
constraints on the record *before* anybody looks at a listing.

Each person answers the same form privately. Nobody sees anybody else's answers. When all three
are in, the bot checks every listing against every stated requirement and posts the options that
survive — each one showing what each person gets and what each person gives up.

**It does not pick the flat.** It ends the argument about whether a place even qualifies, so the
only conversation left is which compromise they want to make.

---

## The problem it solves

Three friends have been looking for four months and shortlisted nothing. Every listing dies
within a day: one finds a place in Baner, another can't face the Hinjewadi commute; one finds
something affordable in Kothrud, another has promised herself she won't live that far from her
family and her gym; a third finds a flat that ticks every box except it's on the fifth floor
with no lift, and one of them has a knee condition.

The listings were never the problem. Nobody had written down what each person genuinely needs
versus what she'd prefer, so every flat got judged one objection at a time, in a chat thread,
after somebody had already got attached to it.

---

## Three rules that are easy to get wrong

**Affordability is per person, never pooled.** Each share is checked against that person's own
ceiling. Adding three budgets together and comparing the total to the rent would pass flats that
quietly overcommit whoever has the smallest budget. Under an equal split, the tightest ceiling in
the group sets the rent limit for all three — worth saying out loud rather than discovering later.

**Unknown is not yes.** Portal list views genuinely omit lift and parking much of the time. A
missing field becomes an open question attached to the option, never a satisfied requirement.
This is the rule that protects the person who needs a lift.

**Ranked on the worst-off person.** Options are ordered by how the person doing worst out of them
fares, not by the group average. A flat that delights two people and punishes the third scores
well on a mean, and is exactly the outcome this group has spent four months failing to avoid.

---

## Where the language model is, and is not

Eligibility is decided in plain deterministic code (`public/assets/match.js`). Gemini is used at
two edges only:

1. **Reading a typed answer** at intake, when somebody describes their commute in a sentence
   instead of the structured format. Its reading is always shown back for confirmation, and if no
   time limit was given it asks rather than inventing one.
2. **Writing the tradeoff up** in readable English, *after* the engine has already reached its
   verdict.

It is never asked whether a flat qualifies. That isn't a convention the code politely observes —
it's a property of the wiring: `api/telegram.js` calls the engine, and only then passes the
finished verdict to `lib/gemini.js` to be narrated.

The reason is the lift. A generative step asked "does this flat work for someone who can't manage
stairs?" will eventually decide a second-floor flat is probably fine. Code asked `lift === true`
will not. So the question is never put to the model.

**Without a Gemini key everything still works** — the bot falls back to its own deterministic
wording. The product degrades in fluency, never in accuracy.

---

## Two interfaces, one engine

| | Web app | Telegram bot |
|---|---|---|
| Where | `/app` | `@your_bot` |
| Who enters answers | Add all three yourself, or send a share link | `/start` yourself, `/add` for others |
| Needs | nothing (Supabase only for share links) | bot token; Supabase for the real flow |

Both load the same `public/assets/match.js`. They cannot disagree about whether a flat qualifies,
because there is only one implementation of the rules.

---

## Setup

You need a GitHub account and a Vercel account. Everything else is optional. There is **no build
step and no `npm install`** — what is committed is what runs.

### The short version

Import the repo at [vercel.com/new](https://vercel.com/new), framework preset **Other**, leave
build and output settings empty. Deploy.

**That is a working app.** `/app` lets you add three people and see the shortlist, with matching
running entirely in the browser. Nothing below is required for that.

Add the optional pieces only for what you actually need:

| You want | Add |
|---|---|
| Plain-English tradeoff write-ups | `GEMINI_API_KEY` |
| Share links so three people answer on their own devices | `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` + run `schema.sql` |
| The Telegram bot | `TELEGRAM_BOT_TOKEN` + `SETUP_KEY`, then visit `/api/setup?key=...` |

Redeploy after adding variables — **Vercel does not apply new variables to an existing
deployment**, and this is the step people miss.

### Checking it worked

`/api/health` reports what is configured without echoing any secret.

`/api/health?deep=1` goes further: it makes a **real call to Gemini** and a **real query against
Supabase**. Having a key set proves nothing about whether it is valid, and having a database URL
proves nothing about whether `schema.sql` was ever run. Both are billed or billable requests, so
they are off by default.

### Every variable

See `.env.example` for the same list with fuller explanations.

| Variable | Needed for | What it is |
|---|---|---|
| `GEMINI_API_KEY` | Tradeoff write-ups | From [aistudio.google.com](https://aistudio.google.com) |
| `GEMINI_MODEL` | — | Defaults to `gemini-3.8-flash`. Leave unset unless you want another. |
| `SUPABASE_URL` | Share links, Telegram | `https://xxxx.supabase.co`, from Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Share links, Telegram | Same page. **Server-side only.** It bypasses row-level security. |
| `TELEGRAM_BOT_TOKEN` | Telegram | From [@BotFather](https://t.me/BotFather): `/newbot` |
| `SETUP_KEY` | Telegram | A random string you invent; guards `/api/setup` |
| `TELEGRAM_WEBHOOK_SECRET` | Telegram | Another random string. Set it **before** running `/api/setup`. |
| `TELEGRAM_GROUP_CHAT_ID` | — | Optional. Or send `/usegroup` in the group instead. |

### Supabase

Create a project at [supabase.com](https://supabase.com), open the **SQL editor**, paste all of
`schema.sql`, run it. Then copy the URL and the `service_role` key from **Settings → API**.

Three tables, RLS on, no public policy: the anon key can read nothing, so one participant cannot
pull another's answers out of the database before the match runs.

Without Supabase, the web app still works for one person filling in all three sets of answers —
only share links and the real Telegram flow need it.

### Telegram

Only if you want the bot as well as the web app.

1. `/newbot` in [@BotFather](https://t.me/BotFather), copy the token
2. Add `TELEGRAM_BOT_TOKEN`, `SETUP_KEY` and `TELEGRAM_WEBHOOK_SECRET`, redeploy
3. Visit `https://YOUR-PROJECT.vercel.app/api/setup?key=YOUR_SETUP_KEY`
4. Message the bot `/start`, then `/add` for each other person

**Order matters.** `/api/setup` registers the webhook secret *with Telegram*. Set
`TELEGRAM_WEBHOOK_SECRET` first, or every update comes back `401 Unauthorized` — Telegram calls
without the header the handler requires, and the bot silently never answers. If that happens,
`/api/health` names the cause and the fix is to re-run `/api/setup`.

---

## Commands

| Command | Where | What it does |
|---|---|---|
| `/start` | Private | Fill in your answers (about two minutes) |
| `/status` | Either | Who has answered so far |
| `/match` | Either | Run it now |
| `/why` | Either | Everything that was ruled out, and which limit ruled it out |
| `/demo` | Either | Load the three profiles from the case and run it — for testing without three phones |
| `/cancel` | Private | Stop part-way through the form |
| `/reset` | Either | Clear everything and start again |
| `/usegroup` | Group | Tell the bot to post the shortlist in this chat |
| `/groupid` | Group | Show this chat's id |

---

## Checking it works

`/api/health` reports which pieces are configured, what Telegram thinks the webhook is, and
whether storage is durable — without ever echoing a secret. Start there when something is wrong.

The landing page at `/` runs the real engine in your browser against the three profiles from the
case. It is not a mock: `public/assets/match.js` is the same file the bot loads through
`lib/shared.js`, so whatever the page shows is what the bot would post.

---

## Layout

```
api/
  telegram.js        the webhook: intake conversation, group commands, match run, votes
  health.js          configuration report, no secrets echoed
  setup.js           points Telegram at this deployment (guarded by SETUP_KEY)
lib/
  shared.js          aliases window onto globalThis so Node can load the browser engine
  telegram-api.js    Bot API over fetch, no SDK
  store.js           Supabase over PostgREST, with an in-memory fallback
  gemini.js          reads typed answers, writes tradeoffs; never decides
  format.js          renders a verdict into Telegram messages
public/
  index.html         landing page, runs the engine live on the case
  components-map.html
  assets/match.js    THE ENGINE — all eligibility decisions live here
  assets/app.js      renders the worked example
  assets/styles.css
  data/listings.js   curated sample dataset
  data/travel.js     area-to-area travel ranges
  data/demo-profiles.js
schema.sql
```

**There is one implementation of the matching rules.** The engine lives under `public/` so the
browser can load it with a `<script>` tag, and `lib/shared.js` aliases `window` onto `globalThis`
so the serverless functions can `require` the same file. A second Node copy would drift, and the
web page and the bot could eventually disagree about whether a flat qualifies.

---

## Honest limitations

**The listings are real, and thin.** 55 properties scraped from NoBroker on 27 September 2026 by
reading the rendered search page per area (the RapidAPI wrapper does not work). The raw scrape is
committed verbatim inside `public/data/listings.js` and every transformation applied to it is
visible in the normalisation code beneath it — nothing was tidied by hand.

But the list view states **lift, parking, bathroom count and maintenance for none of the 55**. So
every shortlisted flat carries an explicit *needs verification* line on each of those, and the
per-person share is rent-only and therefore a floor rather than a final figure. This is the rule
earning its keep rather than a gap in it: the alternative is telling someone with a knee condition
that a flat is fine when nobody ever checked.

**Nine records carry an area label their own address contradicts** — one tagged Kothrud whose
address is in Sus, several tagged Hinjewadi Phase 1 that read Phase 2. Since travel time is
computed from the label, a wrong label yields a confident wrong commute. Those records are listed
in `AREA_DOUBTS` and their travel checks are downgraded to *needs verification* rather than
silently corrected — guessing the real area would be the same mistake in the other direction.

**Travel figures are area-to-area planning estimates, not live routes.** Synthesised from
published Pune commute guides and expressed as ranges. A range that straddles somebody's limit
returns *needs verification* rather than being rounded to a midpoint and called a match. Sources
are listed in `public/data/travel.js`. A live routing API would drop into the same place.

**Two numbers in the worked example are assumptions, not facts from the case.** The case never
says where Riya's family lives (Aundh is a stand-in) and never states what commute Kavita would
actually accept (25 minutes is the working figure, taken from the one number the case does give).
Both are flagged on screen and in `public/data/demo-profiles.js`. A tool that can't tell its
inputs from its guesses will eventually present a guess as a finding.

**The in-memory storage fallback is not durable.** See step 4.

---

## Licence

Built for the MESA AI-native track shared-flat case.
