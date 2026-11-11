# delfA2 — DELF A2 Tout Public examination simulator

A responsive HTML5 + Tailwind CSS v4 + vanilla JavaScript exam simulator, backed by Supabase PostgreSQL, Auth and Storage.

## Source overview

One uploaded exam paper contains 3 listening exercises, 4 reading exercises and 2 writing tasks: **37 questions/tasks, 75 points**, with original audio and a protected correction key. See `CONTENT_MAPPING.md`. The speaking examination has been deliberately removed.

## Project layout

```text
delfA2/
├── public/                      <-- only this folder is published
│   ├── index.html               Landing / Standard & Premium modes
│   ├── dashboard.html           Papers / current and past attempts
│   ├── exam.html                Three-section exam UI
│   ├── results.html             Secure reviews, scores and rubric
│   ├── history.html             Scores and weaknesses over time
│   ├── teacher.html             Teacher correction and review
│   └── assets/
│       ├── audio/               Three original audio files (local preview)
│       ├── css/                 Compiled Tailwind + custom design CSS
│       ├── data/                Questions/sections only — NO ANSWERS
│       ├── img/                 Crops from supplied candidate paper
│       └── js/                  Modular JavaScript, Supabase client
├── supabase/
│   ├── schema.sql               Tables, policies, secure functions, Storage bucket
│   ├── seed.sql                 Source questions and PRIVATE corrections
│   └── verify.sql               Post-install validation checks
├── scripts/upload-audio.mjs     Trusted server-side upload helper
├── tests/content.test.mjs       Automated static/source tests
├── CONTENT_MAPPING.md          Mapping and limitations
└── vercel.json                  Only public/ is deployed
```

## 1. Try the local preview

From the project directory:

```bash
python -m http.server 8000 --directory public
```

Open `http://localhost:8000` in your browser. The exam content, navigation, timers, audio and browser-local draft backup work without login. **Secure answer marking is deliberately disabled in this preview:** the correct answers are not shipped to public JavaScript. The local demo does not pretend to give official grades.

Use the deployed Supabase mode for persistent attempts, scoring, feedback and teacher corrections.

## 2. Connected Supabase project and remaining setup

The frontend is now configured to use the dedicated, active **delfA2** Supabase project (`jubhfdtkutkndjrgcuuv`) at `https://jubhfdtkutkndjrgcuuv.supabase.co`. It uses the **publishable key**, not a privileged credential. This changes only the local frontend config; the cloud database is **not yet provisioned**. At the time of connection, no application tables existed.

Do **not** run these SQL files on ParlonsMoi or any other project. Run them in the [delfA2 project SQL Editor](https://supabase.com/dashboard/project/jubhfdtkutkndjrgcuuv/sql/new).

1. In the **delfA2** project's **SQL Editor**, run `supabase/schema.sql` in its entirety, then `supabase/seed.sql`.
2. In Supabase **Authentication > Providers**, enable Email (and configure any desired email verification). Add your public site URL to the Authentication URL configuration.
3. Confirm that the private Storage bucket `delf-audio` was created. Upload the three `public/assets/audio/exercice-[1-3].mp3` files without renaming them. You can use Storage's dashboard upload or the trusted helper below.
4. Run `supabase/verify.sql` in the SQL Editor. It checks the expected counts, points, RLS flags and audio presence.
5. The **Project URL** and **publishable key** are already in `public/assets/js/config.js`. You do not need to edit them:

```js
export const SUPABASE_URL = 'https://jubhfdtkutkndjrgcuuv.supabase.co';
export const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_uIUxS40HQM5W_4U2la1STQ_Jy2MIQaK';
```

**Never copy `service_role`, `sb_secret_*`, or database passwords into JavaScript, HTML, versioned public assets or deployment environment variables prefixed for browser access.**

### Optional trusted audio uploader

From the project folder, in a local terminal only:

```bash
SUPABASE_URL='https://jubhfdtkutkndjrgcuuv.supabase.co' \
SUPABASE_SERVICE_ROLE_KEY='YOUR_SECRET_SERVICE_ROLE_KEY' \
node scripts/upload-audio.mjs
```

Do not upload the helper script or its environment variables to Vercel. Audio fetches in the live application use Supabase authenticated Storage signed URLs.

## 3. Teacher role

Sign up using your teacher's email first. As the Supabase project's administrator, grant access in the SQL Editor:

```sql
insert into public.teacher_access(user_id,enabled)
select id,true from auth.users where email='teacher@example.com'
on conflict(user_id) do update set enabled=true;
```

Only trusted project administrators may run this SQL; learner-side code cannot assign teacher access. The teacher portal can adjust writing rubric scores, feedback and corrected text, and verify flagged free-text reading answers. Grades update immediately.

## 4. Publish with Vercel

Import the repository into Vercel. The included `vercel.json` sets the static output directory to **`public`**. Make sure **only `public/`** is exposed to visitors. `supabase/seed.sql` contains the official corrections and must **never** be served as a static asset. The app does not need a Node/React/Next/Vue server.

The frontend dynamically imports a pinned Supabase JS client at runtime when Supabase is configured. An internet connection is required for authentication, Storage and results. Tailwind CSS v4 utilities are precompiled into the public CSS folder, so layout styles do not depend on a Tailwind runtime CDN.

## 5. How exams work

**Standard:** freely select any section or exercise, answer without a timer, replay audio, submit when ready. Objective answers are graded on the server and corrections are shown after submission.

**Premium:** listening → reading → writing; 25, 30 and 45 minutes. Server-side section deadlines prevent answering an expired section even if the device clock is changed. Each listening document allows two plays after 30-second reading periods, with a 30-second answer pause between and after them. The timer survives refreshes. Moving forward early starts the next section immediately. When time runs out, the UI advances automatically; if the tab has been closed, the next visit catches up from server timestamps. The simulation ends after writing.

**Saving:** local draft backup happens instantly. Debounced updates are written to the user's Supabase answer records; pending writes are retried when the connection returns. A confirmation dialog protects early submission. If a Premium deadline has expired before an unsynced answer reaches Supabase, the app cannot promise to mark that late answer and warns the user.

**Results:** 25 + 25 + 25 = **75**, with a percentage. This is not the complete DELF 100-point official assessment. Correct answers are never publicly embedded in browser code. They unlock only via authenticated RPC when a paper is completed.

**Writing:** the supplied rubric is used with point caps of 13 and 12. The automatic score is a *basic rule-based practice estimate*, not an examiner-level language evaluation. It can identify word-count issues, missing task elements, weak linking and a few safe verb corrections; it cannot guarantee all grammar/spelling corrections. Teachers can provide authoritative human corrections.

## 6. Tests and security verification

```bash
node --test tests/content.test.mjs
```

Also run `supabase/verify.sql` after migration. For end-to-end validation with your project connected, create a learner account, answer each question, refresh mid-exam, submit in Standard and Premium, inspect the 25-point section totals, verify the audio playback limit and test a teacher adjustment. A browser integration smoke script is included as a development aid but could not run in the artifact sandbox, because local browser navigation was blocked by the environment. **Live Supabase integration and production deployment have not yet been tested.**

### Security overview

- Published exam metadata can be read anonymously; private answer keys cannot.
- Attempts and answers use per-user RLS; teachers are granted explicit administrator-created membership.
- Writing and objective grades become visible to learners only after their attempt completes.
- Only trusted SQL functions in the unexposed `private` schema read correct answers; exposed wrappers require authentication and ownership checks.
- Timed responses are restricted by RLS and checked using server time.
- The private audio bucket allows authenticated reading but no browser uploads or edits.
- The service-role key is never used in the browser.

## Rights notice

The uploaded sample examination may carry third-party copyright. Check redistribution permissions before publicly publishing the original exam text, photographs and MP3s.

## Connection status — 10 November 2026

The Supabase project `jubhfdtkutkndjrgcuuv` has been configured, and the database migration and seed data were successfully applied. The three audio assets have database records but their bytes are **not uploaded** to the private Storage bucket yet. Until uploaded, `audioUrl` uses the original bundled MP3 files from `public/assets/audio/` as a temporary fallback; these work when you deploy the `public/` folder. Supabase Storage uploading still remains. The app is not hosted automatically by this database connection.

## PDF source visuals and interactive writing controls

Version 1.1 includes the complete source image areas from the candidate pages of the supplied PDF, with no assessor or answer-key screenshots. Five visual groups are placed in their corresponding question/exercise: listening picture options; all eight reading signs; the Aventure Globale email; the Paris reference illustrations; Philippe's letter. All original wording remains unchanged.

Each image first appears as a compact preview to conserve space. Select **⛶ Agrandir** or the picture to open a full-viewport image viewer with zoom +/−, **Ajuster**, an optional browser **Plein écran** button, and **×** or Escape to close. On phones the image viewer adapts to narrow screens without horizontal page scrolling (zoomed images scroll *inside* the viewer).

Both writing tasks now offer a French character toolbar below the editor: accented letters, cédille and ligatures, including capitals. Tap a character to insert it at the current caret position (or replace a selection). The existing word counter and autosave logic receive an input event, just as with typed characters. The writing text area is set to French spell-checking when supported by the browser.

For an existing Supabase installation, run `supabase/add_source_images.sql` after deploying the new static image files. The SQL only updates the image pointers for the reading email and writing letter; the other three references already exist in the seed data. The user interface update requires redeploying the public app: changing database paths alone cannot update JavaScript/CSS on an existing website.

## Authentication and loading UX (November 2026 update)

The website now has an integrated French-language account flow, usable from any page:

1. **Connexion**: email and password, inline errors, password visibility toggle, progress feedback while signing in.
2. **Créer un compte**: email, password confirmation, password-strength guidance and an explicit email verification step if Supabase requires confirmation. A `Renvoyer l'e-mail` action is available.
3. **Mot de passe oublié**: password reset message, then an authenticated new-password screen when the user follows their link.
4. **Return to work**: signing in from a protected page reloads that page in the authenticated state; signing in after selecting an examination mode continues to the chosen mode.

Routes display page skeletons while Supabase initializes, exams load, or results are requested. Buttons display in-progress states for sign-in, sign-up, exam creation, answer submission, email resending, password change and teacher grading. Original French accents, fullscreen exam images, audio and grading are preserved.

### IMPORTANT: Supabase Auth redirect URLs

Supabase Auth controls the delivery and redirect of registration and reset-password emails. In your Supabase Dashboard, open **Authentication → URL Configuration** and add your actual deployment origin and callback path to the allowed Redirect URLs. Example, when deploying at `https://YOUR-SITE.vercel.app`, add:

```
https://YOUR-SITE.vercel.app/index.html
https://YOUR-SITE.vercel.app/index.html?auth=confirmed
https://YOUR-SITE.vercel.app/index.html?auth=reset
```

Set the **Site URL** to the production site. Use your *real* hostname. If preview deployments need email login, add an appropriate approved preview URL pattern as well. This is necessary for email confirmation and recovery links to return to delfA2. The frontend uses only your project's public publishable key; do not add a service-role key to it.

Browser-simulated auth tests are in `tests/auth_isolated_smoke.py`. These test the modal, form states and asynchronous buttons without making real email requests. **Live email delivery, Auth URL allowlist behavior, and real session persistence still require final tests on the deployment domain.**
