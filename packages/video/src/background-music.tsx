import React from 'react';
import { Audio, Sequence } from 'remotion';
import { defaultEditorMix, editorMusicGain, musicForTimeline, type VideoManifest } from '@bienvu/contracts';

export function BackgroundMusic({ manifest: m, media }: { manifest: VideoManifest; media: Record<string, string> }) {
  if (m.editor || !m.music?.settings || m.music.settings.volume <= 0) return null;
  let total = 0;
  const intervals = m.scenes.map((scene) => {
    const startFrame = total;
    total += scene.durationFrames;
    return { startFrame, durationMs: m.audio.find((asset) => asset.id === scene.audioAssetId)?.durationMs ?? 0 };
  });
  const music = {
      ...musicForTimeline(m.music.settings, total),
      normalizationGain: m.music.asset.normalizationGain ?? 1,
    },
    mix = { music, durationSeconds: total / 30, voiceEnabled: m.voiceEnabled !== false, audioMix: defaultEditorMix };
  return (
    <Sequence from={0} durationInFrames={total} premountFor={30}>
      <Audio
        src={media[m.music.asset.id]}
        trimAfter={Math.floor((music.durationMs * 30) / 1000)}
        loop={music.loop}
        loopVolumeCurveBehavior="extend"
        volume={(frame) => editorMusicGain(mix, frame, intervals)}
      />
    </Sequence>
  );
}
