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

## Setup

You need a GitHub account, a Vercel account, and Telegram. Supabase and Gemini are optional but
recommended. There is **no build step and no `npm install`** — what is committed is what runs.

### 1. Create the bot

Message [@BotFather](https://t.me/BotFather) on Telegram, send `/newbot`, follow the prompts, and
copy the token it gives you.

### 2. Deploy to Vercel

Import this repository at [vercel.com/new](https://vercel.com/new). Framework preset: **Other**.
Leave the build and output settings empty.

### 3. Set environment variables

In the Vercel project: **Settings → Environment Variables**. See `.env.example` for the full list
with explanations.

| Variable | Needed? | What it is |
|---|---|---|
| `TELEGRAM_BOT_TOKEN` | **Required** | From @BotFather |
| `SETUP_KEY` | **Required** | Any long random string you invent; guards the setup endpoint |
| `TELEGRAM_WEBHOOK_SECRET` | Recommended | Another random string; Telegram signs every webhook call with it |
| `SUPABASE_URL` | Recommended | From your Supabase project, Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended | Same page. Server-side only — never put this in a browser |
| `TELEGRAM_GROUP_CHAT_ID` | Optional | Or just send `/usegroup` in the group instead |
| `GEMINI_API_KEY` | Optional | From [aistudio.google.com](https://aistudio.google.com) |

Redeploy after adding them — Vercel does not apply new variables to an existing deployment.

### 4. Set up the database (recommended)

Create a project at [supabase.com](https://supabase.com), open the SQL editor, paste the whole of
`schema.sql` and run it. Then copy the URL and service role key into Vercel.

**If you skip this**, the bot holds answers in memory inside one warm serverless instance. They
can vanish between messages, and two people answering at the same time may land on different
instances and never see each other. Fine for a two-minute demo; not fine for real use. The bot
tells people on screen when it's in this mode, and `/api/health` reports it.

### 5. Point Telegram at the deployment

Visit, in a browser:

```
https://YOUR-PROJECT.vercel.app/api/setup?key=YOUR_SETUP_KEY
```

It replies with the bot's username and confirms the webhook is live.

### 6. Use it

1. Each person opens a private chat with the bot and sends `/start`.
2. Add the bot to your group chat and send `/usegroup` there once, so it knows where to post.
3. When all three have finished, the shortlist posts itself to the group.

---

## Commands

| Command | Where | What it does |
|---|---|---|
| `/start` | Private | Fill in your answers (about two minutes) |
| `/status` | Either | Who has answered so far |
| `/match` | Either | Run it now |
| `/why` | Either | Everything that was ruled out, and which limit ruled it out |
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

**The listings are a curated sample dataset, not a live feed.** No authorised public rental API
exists for this market, so inventing one — or scraping a portal and presenting the result as
verified inventory — would be worse than saying so. Rents and amenity mixes are representative of
3BHK rentals in these Pune areas; each row is a stand-in rather than a specific advertised flat,
and no row claims a deep link to a real advert. `public/data/listings.js` sits behind an
API-shaped loader, so swapping in a real feed means replacing one module.

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
