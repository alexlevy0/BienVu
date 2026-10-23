'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { publicErrors, type GenerationView, type PublicErrorCode, type VideoAspectRatio } from '@bienvu/contracts';
import { generationActive } from './generation-progress-state';
import { CreationMotion, CreationSwap, m } from './creation-motion';
import { HomeIcon } from './home-icons';
import { ProblemReport } from './problem-report';
import {
  generationSteps,
  generationProgressText,
  generationMapOmissionText,
  generationAnimationOmissionText,
} from '../lib/generation-steps';
import { ProgressiveVideo } from './progressive-video';
import { VideoBacklight } from './video-backlight';
import { GenerationRenderProgress } from './generation-estimate';
import { GenerationMapConfirmation } from './generation-map-confirmation';
import { GenerationQueueNotice } from './generation-queue-notice';
import { GenerationCelebration } from './generation-celebration';
import { GenerationAnimationCounter } from './generation-animation-counter';
import { VideoResultActions } from './video-result-actions';

type RequestMessage = { kind: 'url' | 'manual'; text: string };

export function ConversationGeneration({
  job,
  request,
  sending,
  anonymous,
  unavailable,
  onRefresh,
  aspectRatio,
}: {
  aspectRatio?: VideoAspectRatio;
  job: GenerationView | null;
  request: RequestMessage;
  sending: boolean;
  anonymous: boolean;
  unavailable?: boolean;
  onRefresh(): Promise<void>;
}) {
  const [posterFailed, setPosterFailed] = useState(false),
    [busy, setBusy] = useState(false),
    [feedback, setFeedback] = useState('');
  const poster =
    job && !['queued', 'importing', 'failed'].includes(job.status)
      ? `/api/${anonymous ? 'trial' : 'generations'}/${job.id}/source-photo`
      : null;
  useEffect(() => setPosterFailed(false), [poster]);
  const statusJob = job;
  const stages = generationSteps(sending ? null : statusJob, request.kind === 'manual');
  const horizontal = (job?.aspectRatio ?? aspectRatio) === '16:9';
  const ready = statusJob?.status === 'ready',
    active = statusJob && generationActive(statusJob);
  const mapOmission = generationMapOmissionText(statusJob);
  const statusAssembling = statusJob?.status === 'rendering',
    statusPercent = statusAssembling ? statusJob.progressPercent : 0;
  const assembling = job?.status === 'rendering';
  const percent = assembling ? job.progressPercent : 0;
  async function act(path: string) {
    setBusy(true);
    setFeedback('');
    try {
      const response = await fetch(path, { method: 'POST' });
      const value = (await response.json()) as { error?: { message?: string } };
      if (!response.ok) throw new Error(value.error?.message ?? 'Cette action n’a pas abouti. Réessayez.');
      if (path.endsWith('/login')) {
        window.location.assign('/connexion?trial=1');
        return;
      }
      await onRefresh();
    } catch (error) {
      setFeedback(error instanceof Error ? error.message : 'Réessayez.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <CreationMotion>
      <section className="home-conversation-job" aria-label="Votre création">
        <GenerationCelebration job={job} />
        <div className="home-request-bubble">
          <HomeIcon name={request.kind === 'manual' ? 'pencil' : 'link'} size={22} />
          <div>
            <strong>
              {request.kind === 'manual' ? 'Je souhaite ajouter mon annonce manuellement.' : request.text}
            </strong>
            {request.kind === 'url' && <small>Créer une vidéo de cette annonce</small>}
          </div>
        </div>
        <div className="home-conversation-response">
          <p className="home-conversation-lead" role="status">
            {sending
              ? 'Envoi de votre demande…'
              : ready
                ? 'Votre vidéo est prête.'
                : job?.status === 'failed'
                  ? 'La création a été interrompue.'
                  : job?.mapConfirmation
                    ? 'Confirmez la ville pour continuer.'
                    : 'Nous préparons votre visite en vidéo.'}
          </p>
          <div className={`home-conversation-result${horizontal ? ' is-horizontal' : ''}`}>
            <div className="home-conversation-preview">
              <div className={`home-conversation-media${horizontal ? ' is-horizontal' : ''}`}>
                {job && (assembling || job.videoUrl) ? (
                  <ProgressiveVideo
                    key={job.id}
                    jobId={job.id}
                    anonymous={anonymous}
                    active={assembling}
                    finalUrl={job.videoUrl}
                    poster={posterFailed ? null : poster}
                    percent={percent}
                    label={anonymous ? 'Aperçu filigrané de votre vidéo' : 'Votre vidéo immobilière'}
                  />
                ) : (
                  <div className="video-backlight-frame">
                    <VideoBacklight poster={posterFailed ? null : poster} />
                    <div className={`home-conversation-poster${job?.status === 'failed' ? ' home-poster-failed' : ''}`}>
                      {poster && !posterFailed && <img src={poster} alt="" onError={() => setPosterFailed(true)} />}
                      {(!poster || posterFailed) && <span className="home-poster-skeleton" aria-hidden="true" />}
                      <div className="home-poster-overlay">
                        {job?.status === 'failed' || ready ? (
                          <span className="home-poster-stopped" aria-hidden="true">
                            !
                          </span>
                        ) : (
                          <span className="home-activity-ring" aria-hidden="true" />
                        )}
                        <strong>
                          {sending
                            ? 'Envoi en cours'
                            : job?.status === 'failed'
                              ? 'Création interrompue'
                              : ready
                                ? 'Vidéo indisponible'
                                : job?.mapConfirmation
                                  ? 'En attente de votre choix'
                                  : 'Génération en cours'}
                        </strong>
                        {assembling && <span className="home-poster-percent">Assemblage · {percent} %</span>}
                      </div>
                      <small>
                        {horizontal ? 'Horizontal 16:9' : 'Vertical 9:16'} ·{' '}
                        {job?.syntheticVoice === false ? 'Sans voix off' : 'Voix française'}
                      </small>
                    </div>
                  </div>
                )}
              </div>
              {ready && job?.ownership === 'owned' && <VideoResultActions job={job} />}
            </div>
            <CreationSwap
              className="home-conversation-status-motion"
              identity={`${statusJob?.id}:${ready ? 'ready' : statusJob?.status === 'failed' ? 'failed' : 'progress'}`}
            >
              <div className="home-conversation-status">
                <GenerationQueueNotice job={statusJob} />
                {active || sending ? (
                  <ol className="home-conversation-steps" aria-label="Étapes de création">
                    {stages.map(({ key, state, label, detail, progress }) => {
                      const confirmMap = key === 'map' && statusJob?.mapConfirmation;
                      return (
                        <li
                          className={`step-${state}${detail || confirmMap ? ' step-with-detail' : ''}${confirmMap ? ' step-needs-confirmation' : ''}`}
                          key={key}
                          data-animations={key === 'animations' && progress ? true : undefined}
                          data-rendering={(statusAssembling && key === 'rendering') || undefined}
                          aria-current={state === 'current' ? 'step' : undefined}
                        >
                          <m.span
                            key={state}
                            className="home-step-symbol"
                            initial={{ opacity: 0, scale: 0.88 }}
                            animate={{ opacity: 1, scale: 1 }}
                            transition={{ duration: 0.2 }}
                            aria-hidden="true"
                          >
                            {state === 'done' ? '✓' : state === 'current' ? '◌' : state === 'skipped' ? '–' : '·'}
                          </m.span>
                          <div className="home-step-label">
                            {label}
                            {detail && <small className="home-step-detail">{detail}</small>}
                            {confirmMap && (
                              <GenerationMapConfirmation key={statusJob.id} job={statusJob} onRefresh={onRefresh} />
                            )}
                          </div>
                          <GenerationAnimationCounter progress={progress} />
                          {statusAssembling && key === 'rendering' && statusJob && (
                            <GenerationRenderProgress
                              job={statusJob}
                              unavailable={unavailable}
                              className="home-render-percent"
                            />
                          )}
                        </li>
                      );
                    })}
                  </ol>
                ) : null}
                {(active || sending) && (
                  <div
                    className={`home-stage-track${statusAssembling ? ' is-measured' : ''}`}
                    role="progressbar"
                    aria-label="Traitement de la vidéo"
                    aria-valuenow={statusAssembling ? statusPercent : undefined}
                    aria-valuemin={statusAssembling ? 0 : undefined}
                    aria-valuemax={statusAssembling ? 100 : undefined}
                    aria-valuetext={
                      sending || !statusJob
                        ? 'Envoi en cours'
                        : statusAssembling
                          ? `Assemblage de la vidéo : ${statusPercent} %`
                          : generationProgressText(statusJob)
                    }
                  >
                    <span style={statusAssembling ? { width: `${statusPercent}%` } : undefined} />
                  </div>
                )}
                {unavailable && (
                  <p role="status" className="home-stage-note">
                    Connexion momentanément interrompue. L’état sera actualisé à votre retour.
                  </p>
                )}
                {statusJob && ['ready', 'failed'].includes(statusJob.status) && mapOmission && (
                  <p className="home-stage-note">
                    <strong>Carte non ajoutée.</strong> {mapOmission}
                  </p>
                )}
                {statusJob &&
                  ['ready', 'failed'].includes(statusJob.status) &&
                  generationAnimationOmissionText(statusJob) && (
                    <p className="home-stage-note" role="status">
                      {generationAnimationOmissionText(statusJob)}
                    </p>
                  )}
                {statusJob?.status === 'failed' && (
                  <p role="alert" className="home-stage-error">
                    {publicErrors[statusJob.errorCode as PublicErrorCode]?.[1] ?? publicErrors.GENERATION_FAILED[1]}
                  </p>
                )}
                {statusJob?.retryAllowed && (
                  <button
                    type="button"
                    className="text-button"
                    disabled={busy}
                    onClick={() => void act(`/api/generations/${statusJob.id}/retry`)}
                  >
                    Relancer le démarrage
                  </button>
                )}
                {ready && anonymous && statusJob?.ownership === 'anonymous' && (
                  <>
                    <button
                      type="button"
                      className="home-primary-button"
                      disabled={busy}
                      onClick={() => void act(`/api/trial/${statusJob.id}/login`)}
                    >
                      Télécharger sans filigrane <span aria-hidden="true">↗</span>
                    </button>
                    <p className="home-stage-note">Créez votre compte gratuitement pour récupérer votre vidéo.</p>
                  </>
                )}
                {ready &&
                  statusJob?.ownership === 'owned' &&
                  statusJob.masterAccess === 'reserved' &&
                  !statusJob.downloadUrl && (
                    <p className="home-stage-note" role="status">
                      La récupération de votre vidéo est en cours. Le téléchargement apparaîtra ici dès qu’elle sera
                      terminée.
                    </p>
                  )}
                {ready &&
                  statusJob?.ownership === 'owned' &&
                  statusJob.masterAccess === 'locked' &&
                  !statusJob.downloadUrl &&
                  statusJob.videoUrl && (
                    <>
                      <p className="home-stage-note">
                        La vidéo est privée. Un crédit est nécessaire pour télécharger le master sans filigrane.
                      </p>
                      {!anonymous && (
                        <button
                          type="button"
                          className="home-primary-button"
                          disabled={busy}
                          onClick={() => void act(`/api/generations/${statusJob.id}/unlock`)}
                        >
                          Utiliser un crédit
                        </button>
                      )}
                    </>
                  )}
                {ready && statusJob?.ownership === 'owned' && anonymous && (
                  <Link href="/essai/recuperer">Retrouver ma vidéo dans mon compte</Link>
                )}
                {ready && !anonymous && (
                  <p className="home-stage-note">
                    {statusJob.creditsUsed} crédit{statusJob.creditsUsed > 1 ? 's' : ''} utilisé
                    {statusJob.creditsUsed > 1 ? 's' : ''}.
                    {statusJob.creditsRefunded > 0
                      ? ` ${statusJob.creditsRefunded} crédit(s) restitué(s) pour les animations indisponibles.`
                      : ''}
                  </p>
                )}
                {ready && !statusJob.videoUrl && (
                  <p className="home-stage-error" role="status">
                    Cette vidéo n’est plus disponible dans votre espace. Consultez Mes biens pour connaître son état.
                  </p>
                )}
                {(active || sending) && (
                  <p className="home-stage-note">
                    Vous pouvez revenir plus tard. Retrouvez votre création dans <Link href="/biens">Mes biens</Link>
                    {anonymous ? ' depuis ce navigateur' : ''}.
                  </p>
                )}
                {statusJob && ['ready', 'failed'].includes(statusJob.status) && (
                  <ProblemReport
                    key={statusJob.id}
                    jobId={statusJob.id}
                    anonymous={anonymous && statusJob.ownership === 'anonymous'}
                  />
                )}
                {feedback && (
                  <p className="home-stage-error" role="alert">
                    {feedback}
                  </p>
                )}
              </div>
            </CreationSwap>
          </div>
        </div>
      </section>
    </CreationMotion>
  );
}
