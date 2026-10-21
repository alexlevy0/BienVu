// Call only around a read or an explicitly idempotent write, never around a
// claim, counter, provider call, or a whole scheduled task.
export async function retryIdempotentD1<T>(action:()=>Promise<T>):Promise<T>{
 for(let attempt=0;;attempt++){
  try{return await action();}
  catch(error){
   const message=error instanceof Error?error.message:'';
   const transient=/^D1_ERROR: (?:Network connection lost\.|internal error; reference = [\w-]+|.*storage caused object to be reset\.|.*reset because its code was updated\.)$/.test(message);
   if(!transient||attempt>=2)throw error;
   await new Promise(resolve=>setTimeout(resolve,200*2**attempt+Math.random()*100));
  }
 }
}
