// The same definition is used for generation metrics, retention and customer follow-up.
// One bound JSON array supplies configured staff emails; no address is embedded in SQL.
export const adminAudienceSql=`CASE
 WHEN json_extract((SELECT body_json FROM admin_workspace_documents d WHERE d.key='agency:'||a.id),'$.audience') IN ('internal','demo')
   OR lower(u.email) IN (SELECT value FROM json_each(?)) THEN 'internal'
 WHEN g.anonymous_session_id IS NOT NULL AND g.owner_agency_id IS NULL THEN 'anonymous'
 WHEN u.id IS NOT NULL THEN 'account' ELSE 'internal' END`;
export function staffEmails(env:{SUPER_ADMIN_EMAIL?:string;ADMIN_EMAIL?:string}){
 return [...new Set([env.SUPER_ADMIN_EMAIL,env.ADMIN_EMAIL].flatMap(e=>e?.trim()?[e.trim().toLowerCase()]:[]))];
}
