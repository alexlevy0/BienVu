import {containerGrossUsd} from '../apps/pipeline/src/budget';
const seconds=Number(process.argv[2]??120);
console.log(JSON.stringify({kind:'scenario-not-measured',instance:'standard-2',activeSecondsIncludingBootUploadAndIdle:seconds,
  worstCaseCpuSeconds:seconds,grossContainerUsd:containerGrossUsd(seconds,seconds),monthlyEnvelopeEur:30,spentEurConfirmedByUser:0,
  proposedFixedReserveEur:8,proposedAttemptReserveEur:0.5,initialRemoteRenderLimit:5,
  exclusions:'Workers/DO, Browser Run, stockage, réseau, conversion, taxes et allocations de compte à réconcilier.'},null,2));
