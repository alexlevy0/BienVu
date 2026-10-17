// Coordinate the independent voice, music and mix auditions on the creation page.
export const previewAudioEvent='bienvu:preview-audio';
export function claimPreviewAudio(id:string){window.dispatchEvent(new CustomEvent(previewAudioEvent,{detail:id}));}
