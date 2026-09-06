// DOM-independent label placement. Positions are display coordinates, not astronomy.
export function layoutLabels(labels,{width,height},obstacles=[]) {
 const placed=[];
 const intersects=(a,b)=>a.x<b.x+b.width+4&&a.x+a.width+4>b.x&&a.y<b.y+b.height+4&&a.y+a.height+4>b.y;
 for(const label of labels){
  if(label.width>width-16||label.height>height-16)continue;
  const candidates=[[label.x+12,label.y-label.height],[label.x-label.width-12,label.y-label.height],[label.x-label.width/2,label.y-label.height-24],[label.x+12,label.y+12],[label.x-label.width/2,label.y+30]];
  for(const [x,y] of candidates){
   const point={...label,x:Math.max(8,Math.min(width-label.width-8,x)),y:Math.max(8,Math.min(height-label.height-8,y))};
   if(![...placed,...obstacles].some(p=>intersects(point,p))){placed.push(point);break;}
  }
 }
 return placed;
}
