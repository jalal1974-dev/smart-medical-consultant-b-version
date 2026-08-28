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
| Video avatar (intake) | LiveAvatar / HeyGen — supplies face + voice only | Keys in Web App env vars. **If unset, the intake page automatically runs voice-only — nothing breaks.** See §7 |
| Voice transcription | Groq Whisper | Key in Web App env vars |
| File storage | Cloudflare R2 (`smc-files` bucket) | |
| Emails (password reset) | Resend | |
| Backup | Aiven MySQL (frozen snapshot, free tier, auto-sleeps) + weekly Hostinger VPS snapshot | |

**If the site ever loses database connection:** most likely the Web App's outgoing IP changed. Open hPanel → VPS → Terminal and run:
```
docker exec -it smc-mysql mysql -uroot -p
```
then re-create the app user for the new IP (`CREATE USER 'smc_user'@'<new-ip>' ...` + grant), matching the DATABASE_URL in the Web App environment variables.

## 7. Video Avatar (LiveAvatar) — turning it on / off

The intake page (`/consultation/<id>/avatar`) can run a **talking video doctor**.
The avatar only provides the face and the voice — the medical questioning is still
our own AI, so the history-taking, the differential-diagnosis logic and the
"never tell the patient a diagnosis" rules are unchanged.

**To turn it on** — hPanel → Web App → Environment variables (same screen as
`LLM_API_KEY`), then restart the app:

| Variable | Where to get it |
|---|---|
| `LIVEAVATAR_API_KEY` | liveavatar.com → Settings → API keys |
| `LIVEAVATAR_AVATAR_ID` | liveavatar.com → Avatars → pick one → copy its UUID |
| `LIVEAVATAR_SANDBOX` | `true` = free but watermarked. `false` on a paid plan |

**To turn it off:** delete `LIVEAVATAR_API_KEY` and restart. The page falls back
to the voice-only avatar on its own.

**Cost warning:** LiveAvatar bills per streaming minute. A long history-taking
session can be expensive — check this against the $5/consultation price before
switching `LIVEAVATAR_SANDBOX` to `false`. Voice-only mode is free.

**Patient never sees an error:** if the key is missing, wrong, or LiveAvatar is
down, the session silently uses the browser voice instead of failing.

**Where the doctor reads it:** whatever the patient tells the avatar appears in
Admin → AI Review as *"Patient's AI Intake Conversation"*, above the uploaded
documents. Read it before approving the reports.
