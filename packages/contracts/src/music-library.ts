import {z} from 'zod';
// product -> customization -> editor also depends on these music constraints.
// Keep the identifier primitive local to avoid an eager ESM initialization cycle.
const EntityId=z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{0,63}$/);

// Full source tracks, independently bounded from short voice-over assets.
export const MUSIC_LIMITS={durationMs:300_000,bytes:15*1024*1024,sourceBytes:50*1024*1024,waveformPeaks:1024} as const;
export const MusicWaveform=z.array(z.number().min(0).max(1)).length(MUSIC_LIMITS.waveformPeaks);
export const MusicMetadata=z.object({name:z.string().trim().min(1).max(100),description:z.string().trim().max(300),
  license:z.string().trim().min(1).max(300)}).strict();
export const LibraryMusic=MusicMetadata.extend({id:EntityId,durationMs:z.number().int().min(500).max(MUSIC_LIMITS.durationMs),
  waveform:MusicWaveform,active:z.boolean(),revision:z.number().int().positive(),createdAt:z.iso.datetime()}).strict();
export type LibraryMusic=z.infer<typeof LibraryMusic>;
export const MusicLibraryPage=z.object({items:z.array(LibraryMusic).max(30),nextCursor:EntityId.nullable()}).strict();
export type MusicLibraryPage=z.infer<typeof MusicLibraryPage>;
export const EditorMusicUpload=z.object({assetId:EntityId,durationMs:z.number().int().min(500).max(MUSIC_LIMITS.durationMs),
  normalizationGain:z.number().min(.1).max(4),waveform:MusicWaveform}).strict();
export type EditorMusicUpload=z.infer<typeof EditorMusicUpload>;
export const MUSIC_DRAG_TYPE='application/x-bienvu-music';
