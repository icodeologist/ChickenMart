# Chicken Mart — Avin

Private business software for recording chicken purchases, supplier credit, customer credit, payments, expenses, profit, and passbook activity.

## Ownership

This repository and its source code are proprietary business property. They are stored here only to operate the business and record development progress. No permission is granted to copy, reuse, modify, distribute, sell, publish, or deploy any part without the owner’s written authorization.

## Local setup

Requirements: Node.js 20+, npm, Docker, and Docker Compose.

```bash
docker compose up -d
cp .env.example .env
npm ci
npm run db:migrate
npm run db:seed
npm run admin:create
npm run dev
```

Open `http://localhost:3000` and sign in with the admin username and password created by the command. The frontend and API are served by the same Next.js process; there is no separate backend server.

Generate a private session secret for `.env` with:

```bash
openssl rand -base64 48
```

Set that result as `AUTH_SECRET`. Never commit `.env` or share the secret.

## Admin account

There is one database-backed administrator and no public registration route. Running this command creates the first admin:

```bash
npm run admin:create
```

Running it again with the same username rotates the password and immediately revokes existing sessions. For a hosted database, run the command from a trusted local machine using its direct, non-pooled connection:

```bash
ADMIN_DATABASE_URL='postgresql://DIRECT_CONNECTION' npm run admin:create
```

The script displays its exact database target and requires the remote hostname to be typed before it writes anything. Do not use a production URL while testing locally.

## Database and verification

```bash
npm run db:generate       # regenerate Prisma Client
npm run db:migrate        # create/apply a development migration
npm run db:deploy         # apply committed migrations in production
npm run db:seed           # explicit demo/local seed
npm run test              # unit + isolated-schema integration tests
npm run lint
npm run typecheck
npm run build
```

Integration tests use the `accounting_test` schema and never the local `public` schema. Production migrations should use the direct database URL; the running app may use the pooled URL.

## Security and deployment

All application pages require a signed session. Accounting APIs additionally verify that the admin still exists, is active, and has the matching session version. Passwords are stored as salted scrypt hashes; session JWTs are kept in `HttpOnly`, `SameSite=Strict` cookies.

For Vercel, configure `DATABASE_URL`, `DIRECT_URL`, and a random `AUTH_SECRET` as server environment variables. Apply migrations and create the production admin before normal use. This is a small single-admin MVP, not a general multi-user identity system; retain database backups, keep credentials private, and do not expose a deployment until authentication and database configuration have been verified.
