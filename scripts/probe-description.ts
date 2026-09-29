// One bounded real provider call on a synthetic listing. No video rendering.
import {existsSync} from 'node:fs';
import {mkdir,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import assert from 'node:assert/strict';
import {extractDescription} from '../packages/narration/src/extraction';

async function main(){
  if(process.argv.length!==2||!existsSync('.env.script'))throw Error('PROBE_CONFIG_MISSING');
  process.loadEnvFile('.env.script');
  const sample='Appartement à vendre à Lyon 6, 65 m², 3 pièces, 280 000 €, avec terrasse.';
  const result=await extractDescription(sample,process.env.OPENAI_API_KEY??'',process.env.SCRIPT_MODEL??'');
  const {fields}=result.data;
  assert.equal(fields.propertyType,'apartment');assert.equal(fields.transaction,'sale');
  assert.match(fields.locality??'',/^Lyon 6(?:e)?$/);assert.equal(fields.area,65);assert.equal(fields.rooms,3);
  assert.equal(fields.priceCents,28_000_000);
  const report={at:new Date().toISOString(),mode:'real-provider',sampleKind:'synthetic',callCount:1,
    provider:'OpenAI Responses API',model:process.env.SCRIPT_MODEL,usage:result.usage,data:result.data,
    videoCreditsDebited:0,renderCalls:0,invoiceAmount:'not measured by probe',reservedBudgetCents:5};
  const directory=resolve('evidence/local/workflow-description');await mkdir(directory,{recursive:true,mode:0o700});
  await writeFile(resolve(directory,'real-provider.json'),JSON.stringify(report,null,2),{mode:0o600});
  console.log(JSON.stringify({passed:true,mode:report.mode,usage:report.usage,fields,reportFile:resolve(directory,'real-provider.json')}));
}
main().catch(error=>{console.error(JSON.stringify({error:error instanceof Error?error.message:'PROBE_FAILED'}));process.exitCode=1;});
