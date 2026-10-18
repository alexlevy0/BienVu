export type WorldVideo={id:string;url:string;poster:string|null;title:string;width:number;height:number;seconds:number;href?:string};
export type WorldPlace={id:string;locality:string;latitude:number;longitude:number;count:number;videos:WorldVideo[]};
export type WorldActivity={places:WorldPlace[];videoCount:number;placeCount:number;updatedAt:string};
export type WorldLocation={jobId:string;locality:string|null;latitude:number;longitude:number};

export function worldPlaceId(latitude:number,longitude:number){return `${latitude.toFixed(1)}:${longitude.toFixed(1)}`;}
export function groupWorldLocations(rows:WorldLocation[]):WorldPlace[]{
 const groups=new Map<string,WorldPlace>();
 for(const row of rows){
  if(!Number.isFinite(row.latitude)||!Number.isFinite(row.longitude)||Math.abs(row.latitude)>80||Math.abs(row.longitude)>180)continue;
  const latitude=Math.round(row.latitude*10)/10,longitude=Math.round(row.longitude*10)/10,id=worldPlaceId(latitude,longitude);
  const old=groups.get(id),locality=row.locality?.trim().slice(0,100)||'Lieu filmé';
  if(old){old.count++;if(old.locality==='Lieu filmé')old.locality=locality;}
  else groups.set(id,{id,locality,latitude,longitude,count:1,videos:[]});
 }
 return [...groups.values()].sort((a,b)=>b.count-a.count||a.locality.localeCompare(b.locality,'fr'));
}

// Cluster by screen distance in world pixels, independent of the viewport pan.
// Neighbouring grid cells are checked too, so a border never creates overlapping pins.
export function worldClusters(places:WorldPlace[],zoom:number){
 const scale=512*2**Math.max(0,zoom),radius=zoom>=6?36:56;
 const groups:{x:number;y:number;items:WorldPlace[]}[]=[],grid=new Map<string,number[]>();
 for(const place of places){
  const sin=Math.sin(place.latitude*Math.PI/180),x=(place.longitude+180)/360*scale,y=(.5-Math.log((1+sin)/(1-sin))/(4*Math.PI))*scale;
  const gx=Math.floor(x/radius),gy=Math.floor(y/radius);let found=-1,distance=radius*radius;
  for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const index of grid.get(`${gx+dx}:${gy+dy}`)??[]){
   const group=groups[index],d=(group.x-x)**2+(group.y-y)**2;if(d<distance){found=index;distance=d;}}
  if(found>=0)groups[found].items.push(place);
  else{const key=`${gx}:${gy}`,index=groups.length;groups.push({x,y,items:[place]});grid.set(key,[...grid.get(key)??[],index]);}
 }
 return groups.map(({items})=>({id:`${zoom.toFixed(2)}:${items.map(p=>p.id).join('|')}`,places:items,count:items.reduce((n,p)=>n+p.count,0),
  longitude:items.reduce((n,p)=>n+p.longitude,0)/items.length,latitude:items.reduce((n,p)=>n+p.latitude,0)/items.length}));
}
