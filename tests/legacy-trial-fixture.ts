import {admitAnonymous as admitCurrent,type Database} from '../packages/db/src/index';

// Emulate the pre-credit rollout's INSERT at admission, then exercise today's
// readers, claim, settlement and media authorization against that legacy row.
// Pricing is never mutated after insertion; production requests use version 1.
export async function admitLegacyAnonymous(...args:Parameters<typeof admitCurrent>){
  const [db,...rest]=args;
  const legacy:Database={prepare(sql){
    const statement=db.prepare(sql);
    if(!sql.startsWith('INSERT INTO generation_runs'))return statement;
    return {...statement,bind(...values){return statement.bind(...values.slice(0,-1),0);},
      first:()=>statement.first(),run:()=>statement.run()};
  }};
  return admitCurrent(legacy,...rest);
}
