'use client';
import Link from 'next/link';
import { useState } from 'react';
import { publicErrors, type GenerationView, type PublicErrorCode } from '@bienvu/contracts';
import { CreationMotion, CreationSwap } from './creation-motion';
import { generationActive } from './generation-progress-state';
export { generationActive, useGenerationProgress } from './generation-progress-state';
import {
  generationSteps,
  generationProgressText,
  generationMapOmissionText,
  generationAnimationOmissionText,
} from '../lib/generation-steps';
import { ProgressiveVideo } from './progressive-video';
import { GenerationRenderProgress } from './generation-estimate';
import { GenerationMapConfirmation } from './generation-map-confirmation';
import { GenerationQueueNotice } from './generation-queue-notice';
import { GenerationCelebration } from './generation-celebration';
import { GenerationAnimationCounter } from './generation-animation-counter';
import { VideoResultActions } from './video-result-actions';
export function GenerationProgress({
  job: currentJob,
  unavailable = false,
}: {
  job: GenerationView;
  unavailable?: boolean;
}) {
  const job = currentJob;
  const [retrying, setRetrying] = useState(false),
    [feedback, setFeedback] = useState('');
  const mapOmission = generationMapOmissionText(job);
  async function retry() {
    setRetrying(true);
    try {
      const r = await fetch(`/api/generations/${job.id}/retry`, { method: 'POST' });
      if (!r.ok) throw 0;
      setFeedback('Démarrage demandé. Le même traitement sera repris.');
    } catch {
      setFeedback('La reprise reste en attente. Vous pouvez revenir plus tard.');
    } finally {
      setRetrying(false);
    }
  }
  return (
    <CreationMotion>
      <section id={`video-${job.id}`} className="generation-progress panel" aria-label="Votre génération">
        <GenerationCelebration job={currentJob} />
        <CreationSwap
          identity={`${job.id}:${job.status === 'ready' ? 'ready' : job.status === 'failed' ? 'failed' : 'progress'}`}
        >
          <div>
            <span className="section-kicker">{job.title}</span>
            <h3 aria-live="polite">{generationProgressText(job)}</h3>
            <GenerationQueueNotice job={job} />
            {generationActive(job) && (
              <>
                <ol className="generation-steps" aria-label="Étapes de création">
                  {generationSteps(job, job.sourceKind === 'manual').map(({ key, state, label, detail, progress }) => (
                    <li key={key} className={`step-${state}`} aria-current={state === 'current' ? 'step' : undefined}>
                      {state === 'done' ? '✓ ' : state === 'skipped' ? '– ' : ''}
                      {label}
                      <GenerationAnimationCounter progress={progress} />
                      {detail && <small className="generation-step-detail">{detail}</small>}
                      {key === 'map' && job.mapConfirmation && <GenerationMapConfirmation key={job.id} job={job} />}{' '}
                      {key === 'rendering' && <GenerationRenderProgress job={job} unavailable={unavailable} />}
                    </li>
                  ))}
                </ol>
                <p>
                  Vous pouvez fermer cette page. Retrouvez la vidéo dans <Link href="/biens">Mes biens</Link>.
                </p>
              </>
            )}
            {['ready', 'failed'].includes(job.status) && mapOmission && (
              <p className="field-help">
                <strong>Carte non ajoutée.</strong> {mapOmission}
              </p>
            )}
            {['ready', 'failed'].includes(job.status) && generationAnimationOmissionText(job) && (
              <p className="field-help" role="status">
                {generationAnimationOmissionText(job)}
              </p>
            )}
            {unavailable && (
              <p role="status">
                La connexion est interrompue. Le traitement continue ; son état sera actualisé à votre retour.
              </p>
            )}
            {job.status === 'failed' && (
              <p className="form-feedback error" role="alert">
                {publicErrors[job.errorCode as PublicErrorCode]?.[1] ?? publicErrors.GENERATION_FAILED[1]}
              </p>
            )}
            {job.retryAllowed && (
              <button type="button" className="text-button" disabled={retrying} onClick={() => void retry()}>
                Relancer le démarrage
              </button>
            )}
            {feedback && <p role="status">{feedback}</p>}
          </div>
        </CreationSwap>
        {(currentJob.status === 'rendering' || currentJob.videoUrl) && (
          <>
            <div className={`generated-video${job.aspectRatio === '16:9' ? ' is-horizontal' : ''}`}>
              <ProgressiveVideo
                key={currentJob.id}
                jobId={currentJob.id}
                anonymous={currentJob.ownership === 'anonymous'}
                active={currentJob.status === 'rendering'}
                finalUrl={currentJob.videoUrl}
                percent={currentJob.progressPercent}
                label={`Vidéo : ${currentJob.title}`}
              />
            </div>
            <VideoResultActions job={job} />
            {job.syntheticVoice && <p className="field-help">Voix de synthèse.</p>}
          </>
        )}
        {job.status === 'ready' && Boolean(job.avatar?.failed) && (
          <p role="status">
            La vidéo est prête.{' '}
            {job.avatar!.ready
              ? 'Un passage de l’avatar n’a pas pu être créé.'
              : 'L’avatar n’a pas pu être créé ; ses crédits supplémentaires ont été rendus.'}
          </p>
        )}
        {job.status === 'ready' && !job.videoUrl && <p>La période de conservation de cette vidéo est terminée.</p>}
      </section>
    </CreationMotion>
  );
}
