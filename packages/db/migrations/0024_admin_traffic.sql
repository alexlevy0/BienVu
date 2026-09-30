-- Compteurs agrégés uniquement : aucune ligne de visiteur, IP, URL ou session.
CREATE TABLE admin_traffic_daily (
  day TEXT NOT NULL CHECK(length(day)=10),
  page TEXT NOT NULL CHECK(page IN ('home','login','explorer','offers','sources')),
  country TEXT NOT NULL CHECK(length(country)=2 AND country GLOB '[A-Z][A-Z]'),
  views INTEGER NOT NULL CHECK(views BETWEEN 1 AND 1000000),
  PRIMARY KEY(day,page,country)
) WITHOUT ROWID;
