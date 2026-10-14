'use client';
import type {GenerationView} from '@bienvu/contracts';
import {useGenerationStore} from './generation-store';

export const generationActive=(job:GenerationView|null)=>Boolean(job&&!['ready','failed'].includes(job.status));
// The composer only needs state. Keep players and rendering tools in the
// progress view, which is loaded once a generation actually exists.
export function useGenerationProgress(agencyId?:string){
  const store=useGenerationStore();
  return {job:agencyId?store.jobs[0]??null:null,jobs:agencyId?store.jobs:[],setJob:(job:GenerationView)=>{
    if(agencyId)store.setJob(job,agencyId);
  },unavailable:store.unavailable,refreshDrafts:store.refreshDrafts};
}
