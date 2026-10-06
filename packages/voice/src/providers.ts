import {GoogleVoiceConfig,FishVoiceConfig,CartesiaVoiceConfig,VoiceFailure,VideoVoice} from '@bienvu/contracts';
import {googleServiceAccountAccess} from './google-auth';
import {googleTts} from './google-tts';
import {fishTts} from './fish-tts';
import {cartesiaTts} from './cartesia-tts';

export type VoiceProviderEnvironment={GOOGLE_SERVICE_ACCOUNT_JSON?:string;GOOGLE_CLOUD_PROJECT?:string;
  FISH_API_KEY?:string;FISH_TTS_ENABLED?:string;CARTESIA_API_KEY?:string;CARTESIA_TTS_ENABLED?:string};
export function frenchVoiceConfig(name:unknown,projectId?:string){
  const voice=VideoVoice.safeParse(name);if(!voice.success)throw new VoiceFailure('VOICE_CONFIG_INVALID');
  return voice.data.startsWith('cartesia-')?CartesiaVoiceConfig.parse({voice:voice.data}):voice.data.startsWith('fish-')?
    FishVoiceConfig.parse({voice:voice.data}):GoogleVoiceConfig.parse({voice:voice.data,projectId});
}
export async function frenchVoiceProvider(env:VoiceProviderEnvironment,name:unknown,options:{maximumDurationMs?:35000|300000}={}){
  const config=frenchVoiceConfig(name,env.GOOGLE_CLOUD_PROJECT);
  if(config.provider==='cartesia'){
    if(env.CARTESIA_TTS_ENABLED!=='true')throw new VoiceFailure('VOICE_UNAVAILABLE');
    return {config,synthesize:cartesiaTts(config,env.CARTESIA_API_KEY??'',options).synthesize};}
  if(config.provider==='fish'){
    if(env.FISH_TTS_ENABLED!=='true')throw new VoiceFailure('VOICE_UNAVAILABLE');
    return {config,synthesize:fishTts(config,env.FISH_API_KEY??'',options).synthesize};}
  if(!env.GOOGLE_SERVICE_ACCOUNT_JSON||env.GOOGLE_SERVICE_ACCOUNT_JSON.length>16384)throw new VoiceFailure('VOICE_CONFIG_INVALID');
  let account:unknown;try{account=JSON.parse(env.GOOGLE_SERVICE_ACCOUNT_JSON);}catch{throw new VoiceFailure('VOICE_CONFIG_INVALID');}
  const access=await googleServiceAccountAccess(account,config.projectId);
  return {config,synthesize:googleTts(config,access).synthesize};
}
