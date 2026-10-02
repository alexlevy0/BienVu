import {VoiceFailure,VideoDuration} from '@bienvu/contracts';

// Chirp LINEAR16 retourne un WAV PCM. Mesure des échantillons, pas une durée
// déduite du texte ou d'un seul champ d'en-tête. Web APIs uniquement ; appelé par Node et le pipeline Workers.
export function measureVoiceWav(input: Uint8Array,maximumDurationMs:35000|40000=35000) {
  if(![35000,40000].includes(maximumDurationMs))throw new VoiceFailure('VOICE_AUDIO_INVALID');
  if (input.byteLength < 44 || input.byteLength > 7 * 1024 * 1024) throw new VoiceFailure('VOICE_AUDIO_INVALID');
  const data = new DataView(input.buffer, input.byteOffset, input.byteLength);
  const tag = (offset: number) => String.fromCharCode(...input.subarray(offset, offset + 4));
  if (tag(0) !== 'RIFF' || tag(8) !== 'WAVE' || data.getUint32(4, true) !== input.byteLength - 8)
    throw new VoiceFailure('VOICE_AUDIO_INVALID');
  let format: {channels: number; sampleRate: number; blockAlign: number} | undefined;
  let pcm: {offset: number; bytes: number} | undefined;
  let offset = 12, chunks = 0;
  while (offset < input.byteLength) {
    if (++chunks > 64 || offset + 8 > input.byteLength) throw new VoiceFailure('VOICE_AUDIO_INVALID');
    const length = data.getUint32(offset + 4, true), start = offset + 8;
    if (start + length + length % 2 > input.byteLength) throw new VoiceFailure('VOICE_AUDIO_INVALID');
    if (tag(offset) === 'fmt ') {
      if (format || length < 16 || data.getUint16(start, true) !== 1 || data.getUint16(start + 14, true) !== 16)
        throw new VoiceFailure('VOICE_AUDIO_INVALID');
      const channels = data.getUint16(start + 2, true), sampleRate = data.getUint32(start + 4, true);
      const byteRate = data.getUint32(start + 8, true), blockAlign = data.getUint16(start + 12, true);
      if (![1, 2].includes(channels) || ![16000, 22050, 24000, 44100, 48000].includes(sampleRate)
        || blockAlign !== channels * 2 || byteRate !== sampleRate * blockAlign) throw new VoiceFailure('VOICE_AUDIO_INVALID');
      format = {channels, sampleRate, blockAlign};
    } else if (tag(offset) === 'data') {
      if (pcm) throw new VoiceFailure('VOICE_AUDIO_INVALID');
      pcm = {offset: start, bytes: length};
    }
    offset = start + length + length % 2;
  }
  if (!format || !pcm || pcm.bytes === 0 || pcm.bytes % format.blockAlign !== 0) throw new VoiceFailure('VOICE_AUDIO_INVALID');
  const durationMs = Math.ceil(pcm.bytes / format.blockAlign / format.sampleRate * 1000);
  if (durationMs > maximumDurationMs) throw new VoiceFailure('VOICE_DURATION_EXCEEDED');
  let sum = 0, peak = 0;
  for (let index = pcm.offset; index < pcm.offset + pcm.bytes; index += 2) {
    const sample = data.getInt16(index, true) / 32768;
    sum += sample * sample; peak = Math.max(peak, Math.abs(sample));
  }
  const rmsDbfs = 10 * Math.log10(sum / (pcm.bytes / 2));
  if (!Number.isFinite(rmsDbfs) || rmsDbfs < -55) throw new VoiceFailure('VOICE_AUDIO_SILENT');
  return {durationMs, durationFrames: Math.ceil(durationMs * 30 / 1000), sampleRate: format.sampleRate,
    channels: format.channels, sampleFrames: pcm.bytes / format.blockAlign, rmsDbfs, peak,
    measurement: 'decoded_pcm16_samples' as const};
}

export function voiceSceneTiming(durationsMs: readonly number[],durationSeconds?:VideoDuration) {
  if (durationsMs.length < 4 || durationsMs.length > 6
    || durationsMs.some(value => !Number.isInteger(value) || value <= 0 || value > 35000)) throw new VoiceFailure('VOICE_AUDIO_INVALID');
  const frames = durationsMs.map(value => Math.ceil(value * 30 / 1000) + 6);
  const minimumFrames = frames.reduce((sum, value) => sum + value, 0);
  if(durationSeconds!==undefined){
    if(!VideoDuration.safeParse(durationSeconds).success)throw new VoiceFailure('VOICE_AUDIO_INVALID');
    const targetFrames=durationSeconds*30;
    if(minimumFrames>targetFrames)throw new VoiceFailure('VOICE_DURATION_EXCEEDED');
    // Keep the WAVs intact. Reserve a short contact tail and distribute the
    // rest over the visit, rather than holding the final card for 20 seconds.
    const tail=Math.min(30,targetFrames-minimumFrames),extra=targetFrames-minimumFrames-tail;
    const visitWeight=frames.slice(0,-1).reduce((n,f)=>n+f,0);let at=0;
    const result=frames.map((f,index)=>{
      if(index===frames.length-1)return f+tail;
      const before=at;at+=f;return f+Math.floor(at*extra/visitWeight)-Math.floor(before*extra/visitWeight);
    });
    return result;
  }
  if (minimumFrames > 1050) throw new VoiceFailure('VOICE_DURATION_EXCEEDED');
  // 0,3 s entre les pistes, environ 1,2 s après le contact. Si le minimum de
  // 20 s exige plus de temps, le réserver à la carte finale : ne pas hacher
  // chaque phrase par un long silence. Les WAV et leurs respirations restent intacts.
  const targetFrames = Math.max(600, Math.min(1050, minimumFrames + (frames.length - 1) * 3 + 30));
  let remaining = targetFrames - minimumFrames;
  for (let index = 0; index < frames.length - 1; index++) {
    const extra = Math.min(3, remaining); frames[index] += extra; remaining -= extra;
  }
  frames[frames.length - 1] += remaining;
  return frames;
}

// New descriptive narrations run consecutively. Legacy timing stays available
// for immutable snapshots; these frame counts work with the existing renderer.
export function compactVoiceSceneTiming(durationsMs:readonly number[],durationSeconds:VideoDuration){
  if(!VideoDuration.safeParse(durationSeconds).success||durationsMs.length<4||durationsMs.length>6
    ||durationsMs.some(n=>!Number.isInteger(n)||n<=0||n>35000))throw new VoiceFailure('VOICE_AUDIO_INVALID');
  const frames=durationsMs.map((n,index)=>Math.ceil(n*30/1000)+(index<durationsMs.length-1?4:0));
  const total=frames.reduce((a,b)=>a+b,0),target=durationSeconds*30;
  if(total>target)throw new VoiceFailure('VOICE_DURATION_EXCEEDED');
  frames[frames.length-1]+=target-total;
  return frames;
}
