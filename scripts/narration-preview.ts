import {measureVoiceWav} from '../packages/voice/src/audio';

// Écoute opérateur des pistes selon le timing calculé ; aucun rendu vidéo.
export function narrationPreview(clips: Uint8Array[], frames: number[]): Uint8Array {
  if (clips.length !== frames.length || clips.length < 4 || clips.length > 6) throw new Error('PREVIEW_INVALID');
  const measurements = clips.map(measureVoiceWav), first = measurements[0];
  const totalFrames = frames.reduce((sum, value) => sum + value, 0);
  if (totalFrames < 600 || totalFrames > 1050 || frames.some((n,i)=>!Number.isInteger(n)||n<measurements[i].durationFrames)
    || measurements.some(m=>m.channels!==first.channels||m.sampleRate!==first.sampleRate)) throw new Error('PREVIEW_INVALID');
  const sampleFrames = Math.ceil(totalFrames * first.sampleRate / 30), block = first.channels * 2;
  const result = new Uint8Array(44 + sampleFrames * block), view = new DataView(result.buffer);
  const tag = (text: string, offset: number) => result.set(new TextEncoder().encode(text), offset);
  tag('RIFF',0);view.setUint32(4,result.length-8,true);tag('WAVE',8);tag('fmt ',12);view.setUint32(16,16,true);
  view.setUint16(20,1,true);view.setUint16(22,first.channels,true);view.setUint32(24,first.sampleRate,true);
  view.setUint32(28,first.sampleRate*block,true);view.setUint16(32,block,true);view.setUint16(34,16,true);
  tag('data',36);view.setUint32(40,result.length-44,true);
  let elapsedFrames = 0;
  for (const [index,clip] of clips.entries()) {
    const source = new DataView(clip.buffer,clip.byteOffset,clip.byteLength);
    for (let offset=12;offset+8<=clip.length;) {
      const length=source.getUint32(offset+4,true);
      if(new TextDecoder().decode(clip.subarray(offset,offset+4))==='data') {
        result.set(clip.subarray(offset+8,offset+8+length),44+Math.ceil(elapsedFrames*first.sampleRate/30)*block);break;
      }
      offset+=8+length+length%2;
    }
    elapsedFrames+=frames[index];
  }
  measureVoiceWav(result);return result;
}
