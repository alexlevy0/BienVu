export async function storeRenderArtifact(bucket:R2Bucket,key:string,body:ReadableStream<Uint8Array>,report:{sizeBytes:number;sha256:string}) {
  if(!Number.isSafeInteger(report.sizeBytes)||report.sizeBytes<=0||report.sizeBytes>50*1024*1024||!/^[a-f0-9]{64}$/.test(report.sha256))throw new Error('INVALID_RENDER_REPORT');
  // Le proxy Containers ne conserve pas la longueur interne du flux pour R2.
  // FixedLengthStream borne le transfert sans charger le MP4 en mémoire.
  const fixed=new FixedLengthStream(report.sizeBytes);
  const reader=body.getReader(),writer=fixed.writable.getWriter();
  // Le flux du proxy ne supporte pas pipeTo vers un autre TransformStream.
  const copy=(async()=>{try{
    for(;;){const chunk=await reader.read();if(chunk.done)break;await writer.write(chunk.value);}
    await writer.close();
  }catch(error){await writer.abort(error).catch(()=>{});throw error;}})();
  try {await Promise.all([
    copy,
    bucket.put(key,fixed.readable,{sha256:report.sha256,httpMetadata:{contentType:'video/mp4'},customMetadata:{synthetic:'true',watermarked:'true'}}),
  ]);}catch(error){await Promise.allSettled([reader.cancel(error),writer.abort(error)]);throw error;}
  finally{reader.releaseLock();writer.releaseLock();}
  const head=await bucket.head(key);
  if(!head||head.size!==report.sizeBytes)throw new Error('ARTIFACT_INTEGRITY_FAILED');
}
