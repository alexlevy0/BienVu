-- Anonymous aggregates only: no URL query, referrer URL, IP, account, cookie or session identifier.
CREATE TABLE seo_views_daily (
  day TEXT NOT NULL CHECK(length(day)=10),
  page TEXT NOT NULL CHECK(length(page)<=100),
  channel TEXT NOT NULL CHECK(channel IN ('direct','google','bing','search','social','internal','other')),
  views INTEGER NOT NULL CHECK(views BETWEEN 1 AND 1000000),
  PRIMARY KEY(day,page,channel)
) WITHOUT ROWID;
CREATE TABLE seo_vitals_daily (
  day TEXT NOT NULL CHECK(length(day)=10),
  page TEXT NOT NULL CHECK(length(page)<=100),
  metric TEXT NOT NULL CHECK(metric IN ('LCP','CLS','INP')),
  bucket TEXT NOT NULL CHECK(bucket IN ('good','needs-improvement','poor')),
  samples INTEGER NOT NULL CHECK(samples BETWEEN 1 AND 1000000),
  PRIMARY KEY(day,page,metric,bucket)
) WITHOUT ROWID;
