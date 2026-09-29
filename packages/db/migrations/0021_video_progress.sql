-- Avancement mesuré par le renderer ; les créations déjà prêtes sont à 100 %.
ALTER TABLE jobs ADD COLUMN progress_percent INTEGER NOT NULL DEFAULT 0 CHECK(progress_percent BETWEEN 0 AND 100);
UPDATE jobs SET progress_percent=100 WHERE status='ready';
