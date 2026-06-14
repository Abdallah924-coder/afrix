CREATE TABLE users (
  id TEXT PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'user',
  status TEXT NOT NULL DEFAULT 'active',
  balance NUMERIC(18, 2) NOT NULL DEFAULT 0,
  activity NUMERIC(18, 2) NOT NULL DEFAULT 0,
  bonus NUMERIC(18, 2) NOT NULL DEFAULT 0,
  wallet TEXT NOT NULL DEFAULT '',
  ref_code TEXT UNIQUE NOT NULL,
  referrer_id TEXT REFERENCES users(id),
  merchant_wallet JSONB NOT NULL DEFAULT '{"available":0,"pending":0,"bonus":0}',
  merchant_profile JSONB,
  active_plans JSONB NOT NULL DEFAULT '[]',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE transactions (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  type TEXT NOT NULL,
  description TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  display_amount TEXT NOT NULL,
  status TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE cico_requests (
  id TEXT PRIMARY KEY,
  reference TEXT UNIQUE NOT NULL,
  type TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id),
  merchant_id TEXT REFERENCES users(id),
  customer TEXT NOT NULL,
  country TEXT NOT NULL,
  amount NUMERIC(18, 2) NOT NULL,
  fee NUMERIC(18, 2) NOT NULL DEFAULT 0,
  merchant_bonus NUMERIC(18, 2) NOT NULL DEFAULT 0,
  method TEXT NOT NULL,
  phone TEXT NOT NULL DEFAULT '',
  beneficiary TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);

CREATE TABLE merchant_applications (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  user_email TEXT NOT NULL,
  business_name TEXT NOT NULL,
  country TEXT NOT NULL,
  city TEXT NOT NULL,
  phone TEXT NOT NULL,
  methods TEXT NOT NULL,
  guarantee NUMERIC(18, 2) NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE disputes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id),
  user_email TEXT NOT NULL,
  reference TEXT NOT NULL,
  reason TEXT NOT NULL,
  type TEXT NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  closed_at TIMESTAMPTZ
);

CREATE TABLE platform_settings (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL
);

CREATE INDEX idx_transactions_user_created ON transactions(user_id, created_at DESC);
CREATE INDEX idx_cico_reference ON cico_requests(reference);
CREATE INDEX idx_cico_user_status ON cico_requests(user_id, status);
CREATE INDEX idx_users_referrer ON users(referrer_id);
CREATE INDEX idx_merchants_status ON users ((merchant_profile->>'status'));

