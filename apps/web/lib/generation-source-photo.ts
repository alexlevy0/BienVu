import {GeneratableListing,GenerationRequest,customizedListing} from '@bienvu/contracts';
import {findImport,type Database,type GenerationRow} from '@bienvu/db';
import {privateImportPhoto} from './imports';
import {RequestFailure} from './http';

// Callers have already checked ownership of the job. The listing ID and R2 key
// come only from that job and its validated, private import.
export async function generationSourcePhoto(env:{DB:Database;MEDIA:R2Bucket},job:GenerationRow){
  if(!job.listingId||job.status==='failed'||job.retention!=='available'||job.expiresAt<=new Date().toISOString())throw new RequestFailure('NOT_FOUND');
  const source=await findImport(env.DB,job.agencyId,job.listingId);
  if(source?.status!=='ready'||!source.result)throw new RequestFailure('NOT_FOUND');
  const listing=customizedListing(GeneratableListing.parse(JSON.parse(source.result)),GenerationRequest.parse(JSON.parse(job.input)).customization),first=listing.photos[0];
  if(!first||listing.agencyId!==job.agencyId||listing.id!==job.listingId)throw new RequestFailure('NOT_FOUND');
  return privateImportPhoto(env,job.agencyId,job.listingId,first.id);
}
