# Real-Time Poll

A production-ready real-time polling app: create polls, share links, vote once per browser/IP, and see results update live via Socket.io.

## Architecture

- **Frontend:** Next.js (App Router), Tailwind CSS. Deployable on **Vercel**.
- **Backend:** Express, Socket.io, Prisma (PostgreSQL). Deployable on **Render** or **Railway**.
- **Database:** PostgreSQL (e.g. Neon, Render PostgreSQL, Railway). Connection via `DATABASE_URL`.
- **Real-time:** When a user opens `/poll/:pollId`, the client joins the Socket.io room `poll_<pollId>`. On vote, the backend updates the DB, then emits `voteUpdate` with the updated poll to that room so all viewers see new counts and percentages without refreshing.

**API:**

- `POST /api/polls` — Create poll (question + ≥2 options). Returns poll + `shareableLink` (e.g. `https://<domain>/poll/<pollId>`).
- `GET /api/polls/:pollId` — Get poll and options with vote counts.
- `POST /api/polls/:pollId/vote` — Vote for one option (body: `optionId`, `fingerprint`). Validates option, enforces fairness, then emits `voteUpdate` to room `poll_<pollId>`.

## Fairness mechanisms

We implement **three** mechanisms:

1. **One vote per browser (fingerprint / voterId)**  
   The frontend generates a UUID, stores it in `localStorage`, and sends it as `fingerprint` on vote. The backend enforces uniqueness per `(pollId, fingerprint)` in the DB.  
   **Prevents:** Multiple votes from the same browser/device in normal use.  
   **Limitations:** User can clear localStorage or use incognito/another device to vote again.

2. **One vote per IP**  
   The backend reads the request IP (or `x-forwarded-for` when behind a proxy), hashes it, and stores it. Uniqueness per `(pollId, hashedIp)` is enforced in the DB.  
   **Prevents:** Multiple votes from the same IP (e.g. one home/office network).  
   **Limitations:** VPN/proxy changes IP; NAT can make many users share one IP (only one of them can vote per poll).

3. **Rate limiting**  
   The vote endpoint is rate-limited (e.g. 5 requests per minute per IP).  
   **Prevents:** Rapid repeated voting attempts (e.g. scripts hammering the API).  
   **Limitations:** Does not stop a single extra vote from a different IP or after clearing storage; only limits burst abuse.

## Deployment steps

### Backend (Render / Railway)

1. Create a PostgreSQL database and set `DATABASE_URL`.
2. Set environment variables:
   - `DATABASE_URL` — PostgreSQL connection string.
   - `PORT` — Provided by host (e.g. Render/Railway set this).
   - `FRONTEND_URL` — Frontend origin for CORS and shareable links (e.g. `https://your-app.vercel.app`).
3. Build: `npm run build` (or `tsc`). Start: `node dist/server.js` (or `npm start`).
4. Run migrations: `npx prisma migrate deploy` (in build or release command if needed).

### Frontend (Vercel)

1. Set `NEXT_PUBLIC_BACKEND_URL` to your backend URL (e.g. `https://your-api.onrender.com`).
2. Deploy; Vercel will run `next build` and serve with `next start`.

### Environment variables

- **Backend:** `DATABASE_URL` (required), `PORT` (optional, default 3001), `FRONTEND_URL` (for production CORS and shareable links). See `backend/.env.example`.
- **Frontend:** `NEXT_PUBLIC_BACKEND_URL` (optional, default `http://localhost:3001` for local dev).

### Local development

- **Backend:** `cd backend && npm install && npx prisma migrate dev && npm run dev`
- **Frontend:** `cd frontend && npm install && npm run dev`
- Use a local PostgreSQL instance and set `DATABASE_URL` and optionally `FRONTEND_URL=http://localhost:3000`.

## Known limitations

- No user authentication; anyone with the poll link can view and vote (subject to fairness rules).
- Fairness is best-effort: users can work around it (e.g. VPN, clearing storage, incognito).
- Shareable links depend on `FRONTEND_URL`; if wrong, links may point to localhost or the wrong domain.
- Rate limiting is per IP (and/or per request path), not per user identity.
