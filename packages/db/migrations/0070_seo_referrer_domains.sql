-- Aggregate external domains only: no URL path, query, visitor or session.
CREATE TABLE seo_referrers_daily (
  day TEXT NOT NULL CHECK(length(day)=10),
  host TEXT NOT NULL CHECK(length(host) BETWEEN 3 AND 253 AND host NOT GLOB '*[^a-z0-9.-]*'),
  views INTEGER NOT NULL CHECK(views BETWEEN 1 AND 1000000),
  PRIMARY KEY(day,host)
) WITHOUT ROWID;
