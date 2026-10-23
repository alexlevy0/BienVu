import { staffEmails } from './admin-audience';
export async function adminCustomerHealth(
  db: D1Database,
  env: { SUPER_ADMIN_EMAIL?: string; ADMIN_EMAIL?: string },
  now = Date.now(),
) {
  const at = new Date(now).toISOString(),
    days14 = new Date(now - 14 * 86400000).toISOString(),
    days3 = new Date(now - 3 * 86400000).toISOString();
  const rows = (
    await db
      .prepare(`WITH activity AS (
  SELECT coalesce(g.owner_agency_id,j.agency_id) AS agencyId,count(*) AS total,sum(j.status='ready') AS ready,
  sum(j.status='failed' AND j.created_at>=?) AS failures,sum(j.status NOT IN ('ready','failed')) AS active,
  max(CASE WHEN j.status='ready' THEN e.created_at END) AS lastReady
  FROM jobs j LEFT JOIN generation_runs g ON g.job_id=j.id LEFT JOIN generation_events e ON e.job_id=j.id AND e.event='ready'
  WHERE j.created_at<=? GROUP BY 1
 ) SELECT a.id,a.name AS agency,u.email,a.created_at AS joinedAt,coalesce(s.total,0) AS total,coalesce(s.ready,0) AS ready,
 coalesce(s.failures,0) AS failures,s.lastReady,
 CASE WHEN coalesce(s.failures,0)>=2 THEN 'failures' WHEN coalesce(s.ready,0)=0 AND coalesce(s.active,0)=0 AND a.created_at<=? THEN 'first_video'
 WHEN s.ready>=2 AND s.lastReady<? AND coalesce(s.active,0)=0 THEN 'inactive' END AS signal
 FROM agencies a JOIN auth_user u ON u.id=a.owner_user_id LEFT JOIN activity s ON s.agencyId=a.id
 WHERE lower(u.email) NOT IN (SELECT value FROM json_each(?))
 AND coalesce(json_extract((SELECT body_json FROM admin_workspace_documents d WHERE d.key='agency:'||a.id),'$.audience'),'client')='client'
 AND a.created_at<=? AND signal IS NOT NULL ORDER BY CASE signal WHEN 'failures' THEN 0 WHEN 'first_video' THEN 1 ELSE 2 END,failures DESC,a.created_at LIMIT 100`)
      .bind(days14, at, days3, days14, JSON.stringify(staffEmails(env)), at)
      .all<{
        id: string;
        agency: string;
        email: string;
        joinedAt: string;
        total: number;
        ready: number;
        failures: number;
        lastReady: string | null;
        signal: 'failures' | 'first_video' | 'inactive';
      }>()
  ).results;
  return { at, items: rows };
}
