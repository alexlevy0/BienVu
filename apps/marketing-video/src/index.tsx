import React from 'react';
import { Composition, registerRoot } from 'remotion';
import { BienVuMarketing } from './film';

const Root = () => (
  <Composition
    id="BienVuMarketing"
    component={BienVuMarketing}
    width={1920}
    height={1080}
    fps={30}
    durationInFrames={1080}
  />
);
registerRoot(Root);
