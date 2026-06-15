# AFRIX Backend

## Run

```sh
cp .env.example .env
npm start
```

The server exposes the existing frontend and the API under `/api`.

Without `MONGODB_URI`, the server uses local JSON storage for development. With `MONGODB_URI`, it stores the application state in MongoDB Atlas.

## Admin Account

On startup, Render creates or updates the admin account from `ADMIN_EMAIL` and `ADMIN_PASSWORD`. A registered user whose email matches `ADMIN_EMAIL` also receives the admin role.

## Main Domains

- Auth: `/api/auth/register`, `/api/auth/login`, `/api/me`
- Wallet: `/api/deposits`, `/api/withdrawals`, `/api/transactions/export`
- Plans and network: `/api/plans/activate`, 20-level bonus distribution
- AFRIX Money: `/api/p2p-transfers`, `/api/cico-requests`
- Merchant: applications, CICO lookup/confirmation, merchant wallet transfer
- Admin: platform settings, transaction validation, merchant approval, dispute closure

## Production Setup

Render uses the root `render.yaml`.

Required production variables:

- `APP_URL`
- `PUBLIC_ORIGIN`
- `MONGODB_URI`
- `JWT_SECRET`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `TRC20_DEPOSIT_ADDRESS`
- `BEP20_DEPOSIT_ADDRESS`

Email delivery uses Brevo HTTP when these variables are set:

- `BREVO_API_KEY`
- `BREVO_SENDER_EMAIL`
- `BREVO_SENDER_NAME`
- `SUPPORT_EMAIL`
- `ADMIN_ALERT_EMAIL`

USDT deposits accept BEP20 and TRC20. USDT withdrawals are BEP20 only. CICO remains available through approved merchants for users who fund their account with local currency.
