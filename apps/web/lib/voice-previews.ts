import {cartesiaParisianVoices,type VideoCustomization,type CartesiaVoiceConfig} from '@bienvu/contracts';

export const VOICE_PREVIEW_TEXT = 'Bonjour, voici un aperçu de ma voix. Avec BienVu, transformez les photos de votre bien en une visite qui donne envie.';
// Versioned, public demo assets only. These URLs never synthesize narration.
export const voicePreviews: Record<VideoCustomization['voice'], {name: string; src: string}> = {
  'fr-FR-Chirp3-HD-Aoede': {name: 'Aoede', src: '/audio/voice-previews/v1/aoede.mp3'},
  'fr-FR-Chirp3-HD-Kore': {name: 'Kore', src: '/audio/voice-previews/v1/kore.mp3'},
  'fr-FR-Chirp3-HD-Charon': {name: 'Charon', src: '/audio/voice-previews/v1/charon.mp3'},
  ...Object.fromEntries(cartesiaParisianVoices.map(v=>[v.id,{name:v.name,src:`/audio/voice-previews/cartesia-v1/${v.providerVoiceId}.mp3`}])) as Record<CartesiaVoiceConfig['voice'],{name:string;src:string}>,
  'fish-manon':{name:'Manon',src:'/audio/voice-previews/fish-v1/manon.mp3'},
  'fish-lucas':{name:'Lucas',src:'/audio/voice-previews/fish-v1/lucas.mp3'},
  'fish-camille':{name:'Camille',src:'/audio/voice-previews/fish-v1/camille.mp3'},
};
