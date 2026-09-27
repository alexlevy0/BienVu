-- Compteurs sans adresse en clair. Plafonds partagés par toutes les instances.
CREATE TABLE auth_mail_limits (
  key TEXT PRIMARY KEY,
  count INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);
