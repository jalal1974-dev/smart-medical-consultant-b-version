# SMC Independent — Smart Medical Consultant (Manus-free build)

Independent build of Smart Medical Consultant. All Manus services replaced with
standard providers:

| Feature | Provider |
|---------|----------|
| AI analysis / chat | Any OpenAI-compatible API (`LLM_API_URL`, e.g. OpenRouter) |
| Voice transcription | OpenAI or Groq Whisper (`TRANSCRIPTION_API_URL`) |
| Infographic images | OpenAI-compatible Images API (`IMAGE_API_URL`, optional) |
| File storage | Cloudflare R2 / AWS S3 (`STORAGE_*`) |
| Email | Resend (`RESEND_API_KEY`) |
| Login | Local username/password (bcrypt + JWT session cookie) |
| Database | Any MySQL (`DATABASE_URL`) |

## Run locally

```bash
cp .env.example .env   # fill in values
pnpm install
pnpm db:push           # create tables in your MySQL
pnpm dev               # http://localhost:3000
```

## Deploy

Single Node server serving API + built client. Works on Railway, Render,
Fly.io, or any VPS:

```bash
pnpm build
pnpm start
```

Notes:
- Cloudflare Workers/Pages is NOT compatible (long-running Express + PDF
  generation). Use Cloudflare for DNS/domain + R2 storage instead.
- Set `APP_URL` / `VITE_APP_URL` to your public URL before building.
- Update `client/index.html`, `client/public/robots.txt` and `sitemap.xml`:
  replace `YOUR-DOMAIN-HERE.com` with your real domain.

See `docs/DEPLOY-WITHOUT-MANUS.md` for the full service-replacement inventory.

The original Manus-hosted version lives at
https://github.com/jalal1974-dev/smart-medical-consultant.
