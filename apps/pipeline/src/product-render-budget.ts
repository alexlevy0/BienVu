import {videoManifestHash,type VideoManifest} from '@bienvu/contracts';
import {budgetLimits,type Budget} from './budget';

// Le produit réserve déjà texte, voix et rendu lors de l'admission D1.
// Ce contrôle relit le mois courant ; il ne réserve pas une seconde fois le rendu.
export async function productRenderBudget(db:D1Database,manifest:VideoManifest,now:number):Promise<Budget>{
  const at=new Date(now).toISOString(),month=at.slice(0,7),hash=await videoManifestHash(manifest);
  const job=await db.prepare(`SELECT g.month,g.provision_cents AS provision,g.preview_provision_cents AS preview
    FROM generation_runs g JOIN jobs j ON j.id=g.job_id JOIN reservations r ON r.id=g.reservation_id
    JOIN video_manifests v ON v.job_id=g.job_id AND v.agency_id=g.agency_id
    WHERE g.job_id=? AND g.agency_id=? AND g.month=? AND g.deadline>? AND g.retention='available'
      AND j.status='rendering' AND (r.status='reserved' OR (g.anonymous_session_id IS NOT NULL AND r.status='unfunded'))
      AND v.state='prepared' AND v.manifest_hash=?`)
    .bind(manifest.jobId,manifest.agencyId,month,at,hash).first<{month:string;provision:number;preview:number}>();
  if(!job||job.provision<50||job.preview<(manifest.rights.kind==='anonymous'?manifest.rights.previewProvisionCents:0))throw new Error('VIDEO_BUDGET_RESERVATION_REQUIRED');
  const row=await db.prepare(`SELECT b.month,b.paused,b.ceiling_cents AS ceilingCents,
    coalesce(s.envelope_cents,b.ceiling_cents+500) AS envelopeCents,
    b.baseline_cents+(SELECT coalesce(sum(reserved_cents),0) FROM hosted_import_costs WHERE month=b.month) AS engaged
    FROM hosted_import_budget b LEFT JOIN monthly_budget_settings s ON s.month=b.month WHERE b.month=?`).bind(month)
    .first<{month:string;paused:number;ceilingCents:number;envelopeCents:number;engaged:number}>();
  if(!row||row.paused||row.engaged>row.ceilingCents)throw new Error('VIDEO_BUDGET_LIMIT');
  budgetLimits(row);
  return {month,paused:false,...budgetLimits(row),fixedAndOtherCents:row.engaged,committedCents:0,attempts:0,days:{}};
}
