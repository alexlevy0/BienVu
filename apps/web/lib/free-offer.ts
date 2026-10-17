import type {Database} from '@bienvu/db';

export type PublicFreeOffer={monthlyCredits:number|null;anonymousTrial:boolean};

// Read the public allowance from the same policy as credit grants. Do not expose
// admission limits or budget settings, or advertise a fallback quota on failure.
export async function publicFreeOffer(db:Database,anonymousConfigured:boolean):Promise<PublicFreeOffer|null>{
  try{
    const policy=await db.prepare('SELECT free_enabled,free_monthly,enabled FROM trial_policy WHERE id=1').first<{free_enabled:number;free_monthly:number;enabled:number}>();
    if(!policy)return null;
    const monthlyCredits=policy.free_enabled===1&&Number.isSafeInteger(policy.free_monthly)&&policy.free_monthly>0?policy.free_monthly:null;
    const anonymousTrial=anonymousConfigured&&policy.enabled===1;
    return monthlyCredits!==null||anonymousTrial?{monthlyCredits,anonymousTrial}:null;
  }catch{
    console.warn('FREE_OFFER_UNAVAILABLE');
    return null;
  }
}
