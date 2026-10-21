export interface DrawingGuardState {
 id:string; projectId?:string; width:number; height:number; background:string;
 strokes:Array<{id:string;layerId?:string;tool?:string;opacity?:number;color:string;size:number;shape?:string;imageDataUrl?:string;imageName?:string;text?:string;fontFamily?:string;filled?:boolean;fillColor?:string;rotation?:number;brushPreset?:string;points:Array<{x:number;y:number;pressure?:number}>}>;
 layers?:Array<{id:string;name:string;visible:boolean;locked:boolean;opacity?:number;blendMode?:string}>;
}

/** Streaming, deterministic content guard against applying a plan to changed artwork. */
export function drawingGuardSignature(doc:DrawingGuardState):string {
 const layers=(doc.layers?.length?doc.layers:[{id:"layer-default",name:"Sketch",visible:true,locked:false}])
  .map(layer=>({...layer,opacity:layer.opacity??1,blendMode:layer.blendMode??"normal"}));
 const strokes=doc.strokes.map(stroke=>({...stroke,points:stroke.points.map(point=>({x:point.x,y:point.y,pressure:point.pressure}))}));
 let a=2166136261,b=0x9e3779b9;
 const write=(value:string)=>{for(let i=0;i<value.length;i++){const code=value.charCodeAt(i);a=Math.imul(a^code,16777619)>>>0;b=Math.imul(b^code,2246822507)>>>0;}a=Math.imul(a^255,16777619)>>>0;b=Math.imul(b^127,2246822507)>>>0;};
 const visit=(value:unknown):void=>{
  if(value===null){write("null");return;}
  if(value===undefined){write("undefined");return;}
  if(typeof value==="string"){write("string:"+value.length+":");write(value);return;}
  if(typeof value==="number"){write("number:"+String(value));return;}
  if(typeof value==="boolean"){write(value?"true":"false");return;}
  if(Array.isArray(value)){write("array:"+value.length);for(const item of value)visit(item);write("end-array");return;}
  if(typeof value==="object"){const record=value as Record<string,unknown>;const keys=Object.keys(record).filter(key=>record[key]!==undefined).sort();write("object:"+keys.length);for(const key of keys){visit(key);visit(record[key]);}write("end-object");return;}
  write("unsupported:"+typeof value);
 };
 visit({id:doc.id,projectId:doc.projectId??"",width:doc.width,height:doc.height,background:doc.background,layers,strokes});
 return a.toString(16).padStart(8,"0")+b.toString(16).padStart(8,"0");
}
