// IGN's aerial mosaic contains opaque white tiles outside the flight coverage,
// including when WMS is requested as transparent PNG. Repair only large, white,
// edge-connected components whose existing boundary is predominantly blue water.
// Interior white roofs, boats, labels and areas without evidence of water stay intact.
export function fillCoastalNoData(data:Uint8ClampedArray,width:number,height:number){
  const count=width*height;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||width>3840||height>3840||count>2160*3840||data.length!==count*4)throw Error('MAP_RASTER_DIMENSIONS');
  const visited=new Uint8Array(count),minimum=Math.max(256,Math.ceil(count*.001));let filled=0;
  const white=(p:number)=>data[p*4]>=248&&data[p*4+1]>=248&&data[p*4+2]>=248&&data[p*4+3]===255;
  const water=(p:number)=>{const i=p*4;return data[i+3]===255&&data[i+2]>data[i]+12&&data[i+1]>data[i]+5&&data[i+2]<220;};
  function component(seed:number){
    if(visited[seed]||!white(seed))return;
    const stack=[seed],spans:[number,number][]=[],samples=new Map<number,{x:number;y:number;r:number;g:number;b:number;n:number}>();
    let area=0,edges=0,blue=0;
    function boundary(p:number,step:number){
      if(white(p))return;edges++;
      // JPEG filtering leaves a narrow pale fringe at the edge of a blank tile.
      // Sample inside the existing image, past that fringe, never across a row.
      const end=p+step*7;
      if(end>=0&&end<count&&(Math.abs(step)!==1||Math.floor(end/width)===Math.floor(p/width)))p=end;
      if(!water(p))return;blue++;
      const x=p%width,y=Math.floor(p/width),key=Math.floor(y*12/height)*12+Math.floor(x*12/width),i=p*4,
        s=samples.get(key)??{x:0,y:0,r:0,g:0,b:0,n:0};
      s.x+=x;s.y+=y;s.r+=data[i];s.g+=data[i+1];s.b+=data[i+2];s.n++;samples.set(key,s);
    }
    while(stack.length){
      const p=stack.pop()!;if(visited[p]||!white(p))continue;
      const row=Math.floor(p/width)*width;let left=p,right=p;
      while(left>row&&!visited[left-1]&&white(left-1))left--;
      while(right<row+width-1&&!visited[right+1]&&white(right+1))right++;
      spans.push([left,right]);area+=right-left+1;
      if(left>row)boundary(left-1,-1);if(right<row+width-1)boundary(right+1,1);
      let above=false,below=false;
      for(let at=left;at<=right;at++){
        visited[at]=1;
        for(const direction of [-1,1]){
          const n=at+direction*width;if(n<0||n>=count)continue;
          const fresh=!visited[n]&&white(n),previous=direction===-1?above:below;
          if(fresh&&!previous)stack.push(n);if(!fresh)boundary(n,direction*width);
          if(direction===-1)above=fresh;else below=fresh;
        }
      }
    }
    if(area<minimum||blue<16||blue<edges*.6)return;
    const points=[...samples.values()].map(s=>({x:s.x/s.n,y:s.y/s.n,r:s.r/s.n,g:s.g/s.n,b:s.b/s.n})),
      columns=48,rows=Math.max(2,Math.min(96,Math.round(columns*height/width))),field=new Float32Array((columns+1)*(rows+1)*3),softness=(Math.min(width,height)*.025)**2;
    // Smoothly extend the measured sea colours, rather than painting a jagged
    // solid polygon or inventing satellite imagery. Evaluate a small colour grid once.
    for(let y=0;y<=rows;y++)for(let x=0;x<=columns;x++){
      let weights=0,r=0,g=0,b=0;
      for(const s of points){const weight=1/(((x*width/columns-s.x)**2+(y*height/rows-s.y)**2)+softness);weights+=weight;r+=s.r*weight;g+=s.g*weight;b+=s.b*weight;}
      const i=(y*(columns+1)+x)*3;field[i]=r/weights;field[i+1]=g/weights;field[i+2]=b/weights;
    }
    const fringe:number[]=[];
    for(const [left,right] of spans)for(let p=left;p<=right;p++)visited[p]=2;
    const pale=(p:number)=>{const i=p*4;return data[i]>115&&data[i+1]>115&&data[i+2]>115&&data[i]>data[i+2]*.78;};
    function edge(p:number){for(const step of [-width,width,-1,1]){const n=p+step;
      if(n<0||n>=count||Math.abs(step)===1&&Math.floor(n/width)!==Math.floor(p/width)||visited[n]===2||!pale(n))continue;
      visited[n]=2;fringe.push(n);
    }}
    // Remove only the 1–3 pixel JPEG halo immediately adjoining proven no-data.
    for(const [left,right] of spans){edge(left);edge(right);for(let p=left;p<=right;p++){if(p>=width&&visited[p-width]!==2)edge(p);if(p<count-width&&visited[p+width]!==2)edge(p);}}
    let start=0,end=fringe.length;for(let pass=1;pass<3;pass++){for(let i=start;i<end;i++)edge(fringe[i]);start=end;end=fringe.length;}
    function paint(p:number){
      const x=(p%width)*columns/width,y=Math.floor(p/width)*rows/height,x0=Math.floor(x),y0=Math.floor(y),dx=x-x0,dy=y-y0,
        a=(y0*(columns+1)+x0)*3,b=a+3,c=a+(columns+1)*3,d=c+3;
      for(let channel=0;channel<3;channel++)data[p*4+channel]=(field[a+channel]*(1-dx)+field[b+channel]*dx)*(1-dy)+(field[c+channel]*(1-dx)+field[d+channel]*dx)*dy;
    }
    for(const [left,right] of spans)for(let p=left;p<=right;p++)paint(p);
    for(const p of fringe)paint(p);filled+=area+fringe.length;
  }
  for(let x=0;x<width;x++){component(x);component((height-1)*width+x);}
  for(let y=1;y<height-1;y++){component(y*width);component((y+1)*width-1);}
  return filled;
}

// Browser-only adapter, also used by the offline Remotion browser. No provider
// request is added: the immutable local/first-party raster is decoded once.
export async function coastalMapSource(src:string,signal:AbortSignal):Promise<{url:string;dispose():void}>{
  const image=new Image();image.crossOrigin='anonymous';image.decoding='async';
  const loaded=new Promise<void>((resolve,reject)=>{
    image.onload=()=>resolve();image.onerror=()=>reject(Error('MAP_RASTER_LOAD'));
    signal.addEventListener('abort',()=>{image.src='';reject(signal.reason);},{once:true});
  });
  signal.throwIfAborted();image.src=src;await loaded;signal.throwIfAborted();
  const width=image.naturalWidth,height=image.naturalHeight;
  if(width>3840||height>3840||width*height>2160*3840||!width||!height)throw Error('MAP_RASTER_DIMENSIONS');
  const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true});if(!context)throw Error('MAP_RASTER_CANVAS');
  context.drawImage(image,0,0);
  try{
    const pixels=context.getImageData(0,0,width,height);
    if(!fillCoastalNoData(pixels.data,width,height))return {url:src,dispose(){}};
    context.putImageData(pixels,0,0);signal.throwIfAborted();
    const blob=await new Promise<Blob>((resolve,reject)=>canvas.toBlob(value=>value?resolve(value):reject(Error('MAP_RASTER_ENCODE')),'image/png'));
    signal.throwIfAborted();const url=URL.createObjectURL(blob);return {url,dispose:()=>URL.revokeObjectURL(url)};
  }finally{canvas.width=canvas.height=0;image.src='';}
}
