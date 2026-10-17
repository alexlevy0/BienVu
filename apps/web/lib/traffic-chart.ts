import type {AdminTraffic} from '@bienvu/contracts';
export function trafficChartSummary(data:AdminTraffic){
  const today=data.at.slice(0,10);
  const measured=(day:string)=>data.firstDay!==null&&day>=data.firstDay;
  const completed=data.daily.filter(row=>measured(row.day)&&row.day<today);
  const peak=data.daily.filter(row=>measured(row.day)).reduce<AdminTraffic['daily'][number]|null>((best,row)=>!best||row.views>best.views?row:best,null);
  return {today,measured,completedDays:completed.length,average:completed.length?completed.reduce((sum,row)=>sum+row.views,0)/completed.length:null,peak};
}
export function trafficDayChange(data:AdminTraffic,index:number){
  const row=data.daily[index],previous=data.daily[index-1];
  if(!row||!previous||!data.firstDay||previous.day<data.firstDay||row.day>=data.at.slice(0,10))return null;
  const difference=row.views-previous.views;
  return {difference,percent:previous.views>0?difference/previous.views*100:null};
}
