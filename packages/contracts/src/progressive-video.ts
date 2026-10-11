import {z} from 'zod';
import {Sha256} from './product';
import type {VideoManifest} from './video';

export const STREAM_SEGMENT_SECONDS=2;
// Detailed satellite views can exceed 8 MiB at the master's existing CRF.
// Bound peaks separately from the unchanged 60 MiB limit for the whole stream.
export const STREAM_SEGMENT_MAX_BYTES=16*1024*1024;
export const StreamSegment=z.object({file:z.string().regex(/^segment-\d{6}\.ts$/),
  durationSeconds:z.number().positive().max(2.1),sizeBytes:z.number().int().positive().max(STREAM_SEGMENT_MAX_BYTES),sha256:Sha256}).strict();
export const ProgressiveVideo=z.object({version:z.literal(1),manifestHash:Sha256,
  watermarked:z.boolean(),complete:z.boolean(),segments:z.array(StreamSegment).max(20),
}).strict().superRefine((value,ctx)=>{
  if(value.segments.some((s,i)=>s.file!==streamSegmentFile(i))||value.segments.reduce((n,s)=>n+s.sizeBytes,0)>60*1024*1024)
    ctx.addIssue({code:'custom',message:'Segments vidéo incohérents.'});
});
export type ProgressiveVideo=z.infer<typeof ProgressiveVideo>;
export function streamSegmentFile(index:number){
  if(!Number.isInteger(index)||index<0||index>=20)throw Error('VIDEO_STREAM_INVALID');
  return `segment-${String(index).padStart(6,'0')}.ts`;
}
export function streamPrefix(m:Pick<VideoManifest,'agencyId'|'jobId'>,hash:string){
  Sha256.parse(hash);return `progressive/${m.agencyId}/${m.jobId}/${hash}/`;
}
export function streamPlaylist(stream:ProgressiveVideo){
  return ['#EXTM3U','#EXT-X-VERSION:3','#EXT-X-TARGETDURATION:3','#EXT-X-MEDIA-SEQUENCE:0',
    '#EXT-X-PLAYLIST-TYPE:EVENT','#EXT-X-INDEPENDENT-SEGMENTS',
    ...stream.segments.flatMap(s=>[`#EXTINF:${s.durationSeconds.toFixed(6)},`,s.file]),
    ...(stream.complete?['#EXT-X-ENDLIST']:[]),''].join('\n');
}
