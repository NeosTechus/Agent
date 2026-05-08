-- Add admin flag for merged admin/customer web app.
-- Founders/staff get is_admin=1 manually via SQL; customers default to 0.
ALTER TABLE users ADD COLUMN is_admin INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_users_is_admin ON users(is_admin) WHERE is_admin = 1;
