import type {GenerationStep} from '../lib/generation-steps';
import './generation-animation-counter.css';

export function GenerationAnimationCounter({progress}:{progress:GenerationStep['progress']}){
  if(!progress)return null;
  const text=`${progress.completed} photo${progress.completed>1?'s':''} traitée${progress.completed>1?'s':''} sur ${progress.total}`;
  return <span className="generation-animation-counter" role="progressbar" aria-label="Avancement des animations des photos"
    aria-valuemin={0} aria-valuemax={progress.total} aria-valuenow={progress.completed} aria-valuetext={text} title={text}>
    {progress.completed}<span aria-hidden="true">/</span>{progress.total}
  </span>;
}
