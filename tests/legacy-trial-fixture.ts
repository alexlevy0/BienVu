import {admitAnonymous as admitCurrent,type Database} from '../packages/db/src/index';

// Emulate the pre-credit rollout's INSERT at admission, then exercise today's
// readers, claim, settlement and media authorization against that legacy row.
// Pricing is never mutated after insertion; production requests use version 1.
export async function admitLegacyAnonymous(...args:Parameters<typeof admitCurrent>){
  const [db,...rest]=args;
  const legacy:Database={prepare(sql){
    const statement=db.prepare(sql);
    if(!sql.startsWith('INSERT INTO generation_runs'))return statement;
    const columns=sql.match(/generation_runs\(([^)]+)\)/)![1].split(',').map(column=>column.trim());
    // allocation_id is a SQL literal and financial_mode is a subquery, rather
    // than bound values. Locate credit_version without replacing selected_voice.
    const creditColumn=columns.indexOf('credit_version');
    if(creditColumn<0)throw new Error('Legacy fixture requires credit_version');
    const creditBinding=columns.slice(0,creditColumn).filter(column=>!['allocation_id','financial_mode'].includes(column)).length;
    return {...statement,bind(...values){return statement.bind(...values.map((value,index)=>index===creditBinding?0:value));},
      first:()=>statement.first(),run:()=>statement.run()};
  }};
  return admitCurrent(legacy,...rest);
}
