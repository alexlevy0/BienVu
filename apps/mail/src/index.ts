import {receiveMail} from './receive';

export default {
  fetch(){return new Response(null,{status:404});},
  async email(message,env){
    try{await receiveMail(message,env);}
    catch{console.error(JSON.stringify({event:'mail_storage_failed'}));throw Error('MAIL_STORAGE_UNAVAILABLE');}
  },
} satisfies ExportedHandler<MailEnv>;
