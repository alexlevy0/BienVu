import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MAX_MONTHLY_BUDGET_CENTS,DEFAULT_MONTHLY_BUDGET_CENTS} from '../packages/contracts/src/admin';
import {monthlyBudgetForm} from '../apps/web/lib/admin-budget';

const data={at:'2026-10-09T18:00:00.000Z',budget:{month:'2026-10',baselineCents:4600,importsCents:4745,envelopeCents:20000,ceilingCents:18000,revision:2,paused:0}};
const fields={envelope:'300',ceiling:'180',opening:'8',paused:false};
test('budget superadmin : 300 € reste validable avec les engagements et la coupure existants',()=>{
  const result=monthlyBudgetForm(data,fields);assert.equal(result.error,null);assert.equal(result.engaged,9345);
  assert.deepEqual(result.input,{action:'monthly_budget',month:'2026-10',envelopeCents:30000,ceilingCents:18000,openingCents:0,paused:false,expected:2,reason:'À renseigner'});
  assert.equal(data.budget.envelopeCents,20000,'La validation du formulaire n’enregistre aucune hausse');
  assert.equal(monthlyBudgetForm(data,{...fields,ceiling:'93.45'}).error,null);
  assert.equal(monthlyBudgetForm(data,{...fields,envelope:'500',ceiling:'450',paused:true}).error,null);
  assert.equal(DEFAULT_MONTHLY_BUDGET_CENTS,20000,'La borne technique ne devient pas le montant proposé par défaut');
});
test('budget superadmin : les raisons du bouton désactivé sont explicites et les centimes ne sont pas arrondis silencieusement',()=>{
  for(const [values,message]of [
    [{envelope:''},/Renseignez/],[{envelope:'300.001'},/deux décimales/],[{envelope:'Infinity'},/montants valides/],
    [{envelope:String(MAX_MONTHLY_BUDGET_CENTS/100+.01)},/limite technique/],[{envelope:'4'},/au moins/],
    [{ceiling:'-1'},/négative/],[{ceiling:'298'},/295.*marge/],[{ceiling:'93.44'},/93,45.*provisionnés/],
  ] as const)assert.match(monthlyBudgetForm(data,{...fields,...values}).error!,message);
  assert.equal(monthlyBudgetForm({...data,budget:null},{...fields,opening:'181'}).error,'Les frais déjà engagés doivent être compris entre 0 € et la coupure.');
  assert.match(monthlyBudgetForm({...data,budget:null},{...fields,opening:''}).error!,/Renseignez/);
  assert.equal(monthlyBudgetForm({...data,budget:null},fields).input.openingCents,800);
  assert.equal(monthlyBudgetForm({...data,budget:null},fields).input.expected,null);
});
