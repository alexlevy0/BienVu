import {render} from './render';
console.log(JSON.stringify(await render({id:process.argv[2]??'local-short',fixture:process.argv[3]??'short'}),null,2));
