-- Migración para soporte de correo Gmail y verificación OTP en cuentas de GLauncher
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT;
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
