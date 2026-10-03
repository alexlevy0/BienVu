export type AgencyAccessRole='owner'|'admin'|'editor'|'viewer';
export function canAgencyAction(role:AgencyAccessRole,method:string,path:string){
  if(['GET','HEAD','OPTIONS'].includes(method))return true;
  if(path==='/api/team')return true; // That route checks each team action separately.
  if(role==='viewer')return false;
  return !/^\/api\/(agency|billing)(\/|$)/.test(path)||role==='owner'||role==='admin';
}
