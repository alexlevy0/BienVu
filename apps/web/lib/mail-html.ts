import PostalMime from 'postal-mime';
import sanitizeHtml from 'sanitize-html';
import {MAILBOX_LIMITS} from '@bienvu/contracts';

const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function textHtml(text:string){
  return text.split(/(https?:\/\/[^\s<>]+|mailto:[^\s<>]+|tel:[+\d() .-]+)/gi).map((part,i)=>i%2?
    `<a href="${escape(part)}" target="_blank" rel="noopener noreferrer">${escape(part)}</a>`:escape(part)).join('');
}
// The sender's HTML never enters the parent DOM. Sanitize first, then isolate it in a scriptless iframe.
export async function mailHtmlDocument(raw:ArrayBuffer){
  if(raw.byteLength>MAILBOX_LIMITS.rawBytes)throw Error('MAIL_TOO_LARGE');
  const mail=await PostalMime.parse(raw,{maxNestingDepth:30,maxRfc822NestingDepth:3,maxHeadersSize:256*1024,forceRfc822Attachments:true});
  const inline=new Map<string,string>();let inlineBytes=0;
  for(const file of mail.attachments){
    if(!file.contentId||typeof file.content==='string'||!/^image\/(png|jpeg|gif|webp)$/i.test(file.mimeType)||file.content.byteLength>512000)continue;
    if((inlineBytes+=file.content.byteLength)>2*1024*1024)break;
    const bytes=new Uint8Array(file.content);let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));
    inline.set(file.contentId.replace(/^<|>$/g,''),`data:${file.mimeType};base64,${btoa(binary)}`);
  }
  const safeValue=/^[^()\\@{};]*$/;
  const html=sanitizeHtml(mail.html?.slice(0,1000000)??`<pre>${textHtml(mail.text?.slice(0,MAILBOX_LIMITS.bodyCharacters)??'Message sans texte.')}</pre>`,{
    allowedTags:['a','p','br','div','span','table','thead','tbody','tfoot','tr','td','th','h1','h2','h3','h4','h5','h6','strong','b','em','i','u','s','small','blockquote','ul','ol','li','hr','pre','img'],
    allowedAttributes:{'*':['style','align'],a:['href','title','target','rel'],img:['src','alt','width','height'],table:['width','cellpadding','cellspacing','border'],td:['width','height','colspan','rowspan','bgcolor'],th:['colspan','rowspan','bgcolor']},
    allowedSchemes:['http','https','mailto','tel'],allowedSchemesByTag:{img:['data']},allowProtocolRelative:false,
    allowedStyles:{'*':Object.fromEntries(['color','background-color','font-family','font-size','font-weight','font-style','line-height','text-align','text-decoration','white-space','word-break','overflow-wrap','vertical-align','display','width','max-width','height','max-height','margin','margin-top','margin-bottom','margin-left','margin-right','padding','padding-top','padding-bottom','padding-left','padding-right','border','border-color','border-radius','border-collapse','border-spacing'].map(p=>[p,[safeValue]]))},
    transformTags:{a:(_tag,attributes)=>({tagName:'a',attribs:{...attributes,target:'_blank',rel:'noopener noreferrer'}}),
      img:(_tag,attributes)=>({tagName:'img',attribs:{...attributes,src:inline.get((attributes.src??'').replace(/^cid:/i,''))??''}})},
    exclusiveFilter:frame=>frame.tag==='img'&&!frame.attribs.src,
  });
  return `<!doctype html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(mail.subject??'E-mail')}</title><style>body{margin:0;padding:20px;font:15px/1.6 Arial,sans-serif;color:#202722;background:#fff;overflow-wrap:anywhere}img,table{max-width:100%}img{height:auto}pre{white-space:pre-wrap;font:inherit}a{color:#2f6540}h1,h2,h3{line-height:1.25}</style></head><body>${html}<p style="color:#687368;font-size:12px">Les images externes sont désactivées. Les liens s’ouvrent dans un nouvel onglet.</p></body></html>`;
}
