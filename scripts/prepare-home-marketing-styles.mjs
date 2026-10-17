// Non-critical homepage styles remain authored beside the components. The
// public bundle is loaded without delaying the composer and hero's first paint.
import {readFile,mkdir,writeFile} from 'node:fs/promises';
const files=['home-showcase','home-avatars','home-animation-comparison','home-render-comparison','home-mandate-kit','home-sharing','home-vitrine','home-editor-showcase','home-footer'];
const root=new URL('../apps/web/',import.meta.url),parts=[];
for(const name of files){
 const css=await readFile(new URL(`app/${name}.css`,root),'utf8');
 if(/@import\b/i.test(css)||[...css.matchAll(/url\(\s*(['"]?)(.*?)\1\s*\)/gi)].some(match=>!/^\s*(\/|data:|https?:)/i.test(match[2])))throw Error(`HOME_MARKETING_RELATIVE_IMPORT: ${name}`);
 parts.push(`/* ${name} */\n${css}`);
}
await mkdir(new URL('public/media/ui/',root),{recursive:true});
await writeFile(new URL('public/media/ui/home-marketing.css',root),parts.join('\n'));
console.log('Non-critical homepage styles prepared.');
