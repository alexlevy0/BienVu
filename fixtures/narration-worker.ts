import {GoogleVoiceConfig} from '../packages/contracts/src/index';
import {DEFAULT_SCRIPT_MODEL, openaiScripts} from '../packages/narration/src/index';
import {googleTts} from '../packages/voice/src/index';
import {handleNarrationRequest} from '../apps/pipeline/src/narration-worker';

// Entrée de recette uniquement, bundle dry-run jamais déployé.
export default {async fetch(request: Request, env: NarrationEnv) {
  if (new URL(request.url).hostname !== 'narration-fixture.invalid') return new Response(null,{status:404});
  // Vrai fetch workerd ; seules ses sorties sont interceptées par la sonde.
  // Une fonction fetch injectée ici masquerait les incompatibilités du runtime.
  const script = openaiScripts('sk-fixture-never-a-real-key',DEFAULT_SCRIPT_MODEL);
  const config=GoogleVoiceConfig.parse({projectId:'bienvu-fixture'});
  const voice=googleTts(config,async()=>'fixture-token-never-networked');
  return handleNarrationRequest(request,env,async()=>({mode:'mock',script,voice:{config,synthesize:voice.synthesize}}));
}};
