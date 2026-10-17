'use client';
import {useEffect,useId,useRef,useState} from 'react';
import type {AdminTraffic} from '@bienvu/contracts';
import {trafficChartSummary,trafficDayChange} from '../lib/traffic-chart';
import './admin-traffic-chart.css';

const n=(value:number)=>value.toLocaleString('fr-FR',{maximumFractionDigits:1});
const date=(day:string,full=false)=>new Date(day+'T12:00:00Z').toLocaleDateString('fr-FR',{day:'numeric',month:full?'long':'short',...(full?{year:'numeric' as const}:{}),timeZone:'UTC'});
const pageNames:Record<string,string>={home:'Accueil',login:'Connexion',explorer:'Explorer',offers:'Offres',sources:'Sources'};
function countryName(code:string){if(code==='XX')return 'Pays inconnu';try{return new Intl.DisplayNames(['fr'],{type:'region'}).of(code)??code;}catch{return code;}}

export function AdminTrafficChart({data}:{data:AdminTraffic}){
  const [day,setDay]=useState(data.daily.at(-1)?.day??'');
  const scroll=useRef<HTMLDivElement>(null),id=useId().replaceAll(':','');
  const index=Math.max(0,data.daily.findIndex(row=>row.day===day)),active=data.daily[index];
  const {today,measured,average,completedDays,peak}=trafficChartSummary(data);
  useEffect(()=>{const node=scroll.current;if(node)node.scrollLeft=node.scrollWidth;},[data.days]);
  if(!active)return <p className="admin-muted">Aucune donnée conservée sur cette période.</p>;
  const width=data.days>7?1000:620,height=278,left=46,right=18,top=32,bottom=235,plotWidth=width-left-right;
  const max=Math.max(1,...data.daily.map(row=>row.views)),magnitude=10**Math.floor(Math.log10(max)),step=Math.max(1,Math.ceil(max/(4*magnitude))*magnitude),ceiling=Math.ceil(max/step)*step;
  const slot=plotWidth/data.daily.length,x=(i:number)=>left+i*slot,y=(value:number)=>bottom-value/ceiling*(bottom-top);
  const change=trafficDayChange(data,index),known=measured(active.day),current=active.day===today;
  return <section className="admin-card admin-traffic-history" aria-labelledby={id+'title'}>
    <header className="admin-traffic-heading"><div><h3 id={id+'title'}>Fréquentation quotidienne</h3><p>{date(data.daily[0].day)} — {date(data.daily.at(-1)!.day)} · UTC</p></div><span className="admin-traffic-live">Aujourd’hui : journée en cours</span></header>
    <div className="admin-traffic-summary"><div><span>Moyenne / jour terminé</span><strong>{average===null?'Non mesurée':n(average)}{average!==null&&<small> chargements</small>}</strong><span>{completedDays} jour{completedDays>1?'s':''} conservé{completedDays>1?'s':''}, hors aujourd’hui</span></div><div><span>Plus haut volume observé</span><strong>{peak?n(peak.views):'Non mesuré'}{peak&&<small> chargements</small>}</strong><span>{peak?date(peak.day)+(peak.day===today?' · en cours':''):'Aucune mesure'}</span></div></div>
    <div className="admin-traffic-legend"><span><i/>Pages HTML servies</span><span><i className="is-current"/>Journée en cours</span>{average!==null&&<span><i className="is-average"/>Moyenne des jours terminés</span>}{data.firstDay&&data.daily[0].day<data.firstDay&&<span><i className="is-missing"/>Données non conservées</span>}</div>
    <div ref={scroll} className="admin-traffic-scroll" tabIndex={0} role="region" aria-label="Graphique quotidien, défilement horizontal sur petit écran">
      <div className="admin-traffic-plot" style={{minWidth:data.days>7?850:520}}>
        <svg viewBox={`0 0 ${width} ${height}`} aria-hidden="true">
          <defs><pattern id={id+'partial'} width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(35)"><rect width="6" height="6" fill="#d8e5cc"/><path d="M0 0V6" stroke="#a1bc8d" strokeWidth="2"/></pattern></defs>
          {Array.from({length:ceiling/step+1},(_,i)=>{const value=i*step;return <g key={value}><line x1={left} x2={width-right} y1={y(value)} y2={y(value)} className="admin-traffic-grid"/><text x={left-10} y={y(value)+4} textAnchor="end">{n(value)}</text></g>;})}
          <rect x={x(index)+1} y={top-10} width={slot-2} height={bottom-top+10} rx="5" className="admin-traffic-highlight"/>
          {data.daily.map((row,i)=>{const isKnown=measured(row.day),isCurrent=row.day===today,barWidth=Math.min(40,slot*.72),barHeight=isKnown?Math.max(1,bottom-y(row.views)):2;return <g key={row.day}>
            <rect x={x(i)+(slot-barWidth)/2} y={bottom-barHeight} width={barWidth} height={barHeight} rx="4" className={'admin-traffic-bar'+(i===index?' is-selected':'')+(!isKnown?' is-missing':'')} style={{fill:isCurrent?`url(#${id}partial)`:undefined}}/>
            {isKnown&&row.views>0&&(data.days===7||i===index||row===peak)&&<text x={x(i)+slot/2} y={y(row.views)-9} textAnchor="middle" className="admin-traffic-value">{n(row.views)}</text>}
            {(data.days===7||i===0||i===data.daily.length-1||i%5===0&&data.daily.length-1-i>2)&&<text x={x(i)+slot/2} y={height-13} textAnchor="middle">{date(row.day)}</text>}
          </g>;})}
          {average!==null&&<line x1={left} x2={width-right} y1={y(average)} y2={y(average)} className="admin-traffic-average"/>}
          <line x1={left} x2={width-right} y1={bottom} y2={bottom} className="admin-traffic-baseline"/>
        </svg>
        <div className="admin-traffic-columns" role="group" aria-label="Choisir un jour. Flèches gauche et droite pour naviguer." style={{left:`${left/width*100}%`,right:`${right/width*100}%`,top:`${top/height*100}%`,bottom:`${(height-bottom)/height*100}%`,gridTemplateColumns:`repeat(${data.daily.length},minmax(0,1fr))`}}>
          {data.daily.map((row,i)=><button key={row.day} type="button" tabIndex={i===index?0:-1} aria-pressed={i===index} aria-label={`${date(row.day,true)} : ${measured(row.day)?n(row.views)+' chargements':'aucune donnée conservée'}${row.day===today?', journée en cours':''}`} onPointerEnter={event=>{if(event.pointerType==='mouse')setDay(row.day);}} onFocus={()=>setDay(row.day)} onClick={()=>setDay(row.day)} onKeyDown={event=>{const next=event.key==='ArrowRight'?Math.min(data.daily.length-1,i+1):event.key==='ArrowLeft'?Math.max(0,i-1):event.key==='Home'?0:event.key==='End'?data.daily.length-1:null;if(next===null)return;event.preventDefault();const target=event.currentTarget.parentElement?.children.item(next);if(target instanceof HTMLElement)target.focus();}}/>) }
        </div>
      </div>
    </div>
    <p className="admin-traffic-help">Survolez ou sélectionnez un jour pour voir le détail. Sur mobile, faites glisser le graphique.</p>
    <div className="admin-traffic-detail">
      <div className="admin-traffic-day" aria-live="polite"><span>{date(active.day,true)} <small>UTC{current?' · en cours':''}</small></span><strong>{known?n(active.views):'—'} <small>{known?'chargements':'Aucune donnée conservée'}</small></strong><p>{!known?'La collecte ne reconstitue pas les anciennes visites.':current?'Total provisoire. À ne pas comparer directement à une journée complète.':change?change.percent===null?`${change.difference>=0?'+':''}${n(change.difference)} chargements par rapport à la veille.`:`${change.percent>0?'+':''}${n(change.percent)} % par rapport à la veille.`:'Pas de journée précédente conservée pour comparer.'}</p>{known&&<span className="admin-traffic-share">{n(data.total?active.views/data.total*100:0)} % du total de la période</span>}</div>
      <div className="admin-traffic-breakdown"><h4>Pages ce jour-là</h4>{active.pages?.length?<ul>{active.pages.map(row=><li key={row.page}><span>{pageNames[row.page]??row.page}</span><strong>{n(row.views)}</strong></li>)}</ul>:<p>Aucun chargement conservé.</p>}</div>
      <div className="admin-traffic-breakdown"><h4>Principaux pays</h4>{active.countries?.length?<ul>{active.countries.slice(0,4).map(row=><li key={row.country}><span>{countryName(row.country)}</span><strong>{n(row.views)}</strong></li>)}</ul>:<p>Aucune origine conservée.</p>}</div>
    </div>
    <details className="admin-traffic-values"><summary>Voir les chiffres par jour</summary><div className="admin-table-scroll"><table className="admin-table"><thead><tr><th scope="col">Date UTC</th><th scope="col">Chargements HTML</th><th scope="col">État</th></tr></thead><tbody>{data.daily.map(row=><tr key={row.day}><th scope="row">{date(row.day,true)}</th><td>{measured(row.day)?n(row.views):'—'}</td><td>{!measured(row.day)?'Aucune donnée conservée':row.day===today?'Journée en cours':'Journée terminée'}</td></tr>)}</tbody></table></div></details>
    <details className="admin-traffic-audits"><summary>PageSpeed, Lighthouse et tests internes</summary><p>Les anciens agrégats peuvent inclure des tests de performance. Leur part exacte ne peut pas être reconstituée : aucun navigateur ni événement individuel n’est conservé. Un pic ne prouve donc pas une hausse du nombre de visiteurs.</p><p>Pour vos prochains audits, utilisez cette URL dans PageSpeed ou Lighthouse :</p><code>https://bienvu.online/?bienvu_audit=1</code><p>Ce marqueur exclut le chargement concerné des compteurs de fréquentation et SEO. Sans ce marqueur, seuls les outils reconnaissables à leur navigateur sont filtrés. Les chiffres déjà conservés restent inchangés.</p></details>
  </section>;
}
