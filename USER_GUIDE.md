# Smart Medical Consultant — User Guide
**Website:** https://smartmedcon.com
**Languages:** English / العربية (toggle in the top navigation bar)

---

# Part 1 — Guide for Normal Users (Patients)

## 1. Creating an Account
1. Open https://smartmedcon.com and click **Register** (top right).
2. Fill in: full name, email, username, password.
3. Click **Register for free** — you are logged in immediately.
4. Every new account receives **1 free AI consultation**.

## 2. Signing In / Out
- Click **Sign In**, enter username + password.
- Forgot password? Click **Forgot password?** on the login page — a reset link is emailed to you.
- To sign out, open your avatar menu (top right) and choose logout.

## 3. Submitting a Medical Consultation
1. From the homepage or your Dashboard, click **Submit for AI Analysis**.
2. Provide your information:
   - **Symptoms** — describe what you feel (you can also record voice; it is transcribed automatically).
   - **Medical reports** — upload lab results, X-rays, prescriptions (images or PDFs).
   - **Medical history** — chronic conditions, medications, allergies.
3. Submit. The AI analyzes everything and produces a comprehensive report.
4. Reports are reviewed by medical specialists before being finalized.

## 4. Symptom Checker
- Menu → **Symptom Checker**: a quick guided tool to assess symptoms before deciding on a full consultation.

## 5. Your Dashboard
- **Dashboard** (appears after login) shows **My Consultations** — every consultation with its status:
  - *Submitted* → received, waiting for processing
  - *Completed* → report ready — click it to read the full analysis
  - *Cancelled*
- Click any consultation to open its detail page (full report, files, priority).

## 6. Consultation Balance & Payment
- Free plan: 1 free consultation.
- When it is used, you can purchase additional consultations — after payment you land on a **Payment Confirmation** page and your balance updates.
- Your current balance appears in your profile/dashboard.

## 7. Your Profile
- **My Profile**: update name, bio, avatar; see your subscription type and consultations remaining.

## 8. Content Sections (no login needed)
- **Blog** — medical articles
- **Videos** — explanatory medical videos
- **Podcasts** — audio episodes
- **Contact** — send a message to the team

## 9. Important Notes
- On first use you must acknowledge the **medical disclaimer** — the service provides educational analysis, not a medical diagnosis; always consult your doctor.
- Your data is protected: passwords are bcrypt-hashed, all traffic is over HTTPS.

---

# Part 2 — Guide for the Administrator

**Admin account:** `jalalkhashman1974` (role: admin)
**Admin panel:** log in → open **/admin** (link appears in your menu when logged in as admin)

## 1. Admin Panel — Consultations Tab
The main work queue. For each consultation you can:
- **Search** by patient name/keyword.
- **Filter by status:** All / Submitted / Completed / Cancelled.
- **Filter by priority:** 🔴 Critical / 🟠 Urgent / 🟡 Moderate / 🔵 Routine.
- **Sort:** newest first / oldest first.
- **Open a consultation** to: review the AI-generated report, edit/approve it, change its status (e.g. mark Completed), and **export the report as PDF**.
- Unread/new items show a **notification badge** on the admin navigation link.

Workflow: new submissions arrive as *Submitted* → review the AI report → adjust if needed → mark *Completed* → the patient sees the final report in their dashboard.

## 2. Admin Panel — Users Tab
- View all registered users: name, email, role, subscription type, consultations remaining.
- Manage user accounts and consultation balances.

## 3. Admin Panel — Media Tab
- Add/manage **Videos** and **Podcasts** shown on the public site (type selector: video / podcast).

## 4. Blog Management
- Separate **Blog Management** page: write, edit, and publish blog articles (English + Arabic).

## 5. Monitoring & Logs
- **Monitoring Dashboard** — service health overview.
- **Admin Report Log** — history of generated/exported reports.

## 6. Infrastructure (for the owner)
| Component | Where | Notes |
|---|---|---|
| Website (app) | Hostinger Web App, auto-deploys from GitHub `smart-medical-consultant-b-version` (branch `main`) | Push to GitHub = auto redeploy |
| Domain + SSL | smartmedcon.com (Hostinger) | SSL auto-managed |
| Database | MySQL 8.4 in Docker on your VPS (srv926545, 31.97.126.199), container `smc-mysql` | Runs 24/7; admin access via hPanel → VPS → Terminal: `docker exec -it smc-mysql mysql -uroot -p` |
| AI analysis | OpenRouter (Gemini 2.5 Flash) | Key in Web App env vars |
| Intake avatar | **Voice-only (current choice)** — clinic artwork + browser speech. Free | Optional paid video avatar (LiveAvatar/HeyGen) is built but switched OFF. See §7 |
| Voice transcription | Groq Whisper | Key in Web App env vars |
| File storage | Cloudflare R2 (`smc-files` bucket) | |
| Emails (password reset) | Resend | |
| Backup | Aiven MySQL (frozen snapshot, free tier, auto-sleeps) + weekly Hostinger VPS snapshot | |

**If the site ever loses database connection:** most likely the Web App's outgoing IP changed. Open hPanel → VPS → Terminal and run:
```
docker exec -it smc-mysql mysql -uroot -p
```
then re-create the app user for the new IP (`CREATE USER 'smc_user'@'<new-ip>' ...` + grant), matching the DATABASE_URL in the Web App environment variables.

## 7. Sign in with Google / Facebook

Patients can register and sign in with **Google** or **Facebook** instead of
creating a username and password. Each button only appears once its keys are
set, so nothing can dead-end.

**To enable — hPanel → Web App → Environment variables, then restart:**

| Variable | Where to get it |
|---|---|
| `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` | console.cloud.google.com → APIs & Services → Credentials → OAuth client ID → **Web application** |
| `FACEBOOK_APP_ID` / `FACEBOOK_APP_SECRET` | developers.facebook.com → your app → Facebook Login → Settings |

**You must whitelist the redirect URLs, or the provider refuses the login:**

```
https://smartmedcon.com/api/auth/google/callback
https://smartmedcon.com/api/auth/facebook/callback
```

Google calls this "Authorised redirect URIs"; Facebook calls it "Valid OAuth
Redirect URIs". They must match exactly, including `https`.

### How accounts are matched

- Signing in with the same Google/Facebook account always returns to the same
  patient record.
- If a patient **already registered with a password** and later uses Google with
  that same address, they land in their **existing** record — not a duplicate —
  and their password still works.
- This only happens when the provider confirms the address. An unconfirmed
  address is never linked, because that would let someone reach a medical record
  by asserting an address they do not own.
- Facebook accounts created with a phone number give us no email; those patients
  get a new record and should use the same button each time.

## 8. The intake avatar

The intake page (`/consultation/<id>/avatar`) runs the AI doctor that takes the
patient's history. It has two possible faces — **the medical questioning is
identical in both.** Only the presentation differs.

### Current setting: voice-only (free) ✅

The patient sees the clinic's doctor artwork and hears the questions through the
browser's speech. Animated sound bars show when the AI is talking; a green dot
shows when it is the patient's turn.

**This costs nothing per consultation.** It is the deliberate choice: the paid
video avatar bills per streaming minute, and a full history-taking session could
cost more than the $5 consultation earns.

**To change the doctor picture:** replace `client/public/doctor-avatar.webp`,
then push to GitHub. Keep it small — the current file is 68 KB; anything over a
few hundred KB will slow the page on mobile data. If the file is missing the page
shows a stethoscope icon instead of breaking.

### Speaking instead of typing

The patient can **hold a spoken conversation** with the avatar. They tap the
microphone button once, and from then on it is hands-free: they speak, the
avatar answers aloud, and the microphone reopens automatically for the next
answer. Tapping it again stops.

- A live waveform and the words appearing on screen show them they are heard.
- The microphone closes while the avatar talks, so it never records the avatar's
  own voice and sends it back as the patient's answer.
- **Typing always still works** — nothing is forced.
- Speech recognition needs **Chrome, Edge or Safari**. On Firefox the microphone
  button is hidden automatically and the patient just types.
- Recognition follows the interview language, so Arabic speech is transcribed as
  Arabic.

### Language: Arabic or English

**The avatar follows whatever language the patient actually writes in.** If they
type in Arabic, the questions and the voice switch to Arabic — even if the
consultation was created as English. The patient's own writing always wins over
the stored setting.

- New visitors default to their **browser's language**, falling back to **Arabic**.
- Mixed writing stays Arabic — "عندي ألم وعملت CT scan" is treated as Arabic,
  because Arabic speakers routinely mix in English medical terms.
- The AR / EN buttons at the top still let anyone switch manually.

**If the patient's device has no Arabic voice** (common on desktop Windows; fine
on phones) an amber notice tells them the on-screen text is still correct and
they can read instead of listen. Nothing breaks — only the audio is affected.

### Optional: paid video avatar (currently OFF)

The LiveAvatar/HeyGen integration is built and dormant. While the env vars below
are unset, the "Start video doctor" button does not appear at all, so it cannot
be triggered or billed by accident.

To enable it, set these in hPanel → Web App → Environment variables and restart:

| Variable | Where to get it |
|---|---|
| `LIVEAVATAR_API_KEY` | liveavatar.com → Settings → API keys |
| `LIVEAVATAR_AVATAR_ID` | liveavatar.com → Avatars → copy the UUID |
| `LIVEAVATAR_SANDBOX` | `false` — sandbox rejects stock avatars (tested) |

⚠️ **Check the per-minute rate against the $5 consultation price first.**

**Patients never see an error.** If the key is wrong or the vendor is down, the
session quietly uses voice-only instead of failing. The reason is written to the
browser console and to hPanel → Runtime logs so you can diagnose it.

### Where the doctor reads the result

Whatever the patient tells the avatar appears in **Admin → AI Review** as
*"Patient's AI Intake Conversation"*, above the uploaded documents. Read it
before approving the reports.
