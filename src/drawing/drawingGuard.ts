export interface DrawingGuardState { id: string; projectId?: string; width: number; height: number; background: string; strokes: Array<{id:string;layerId?:string;color:string;size:number;points:Array<{x:number;y:number;pressure?:number}>}>; layers?: Array<{id:string;name:string;visible:boolean;locked:boolean;opacity?:number;blendMode?:string}> }
export function drawingGuardSignature(doc: DrawingGuardState): string {
 const layers=(doc.layers?.length?doc.layers:[{id:"layer-default",name:"Sketch",visible:true,locked:false}]).map(l=>({...l,opacity:l.opacity??1,blendMode:l.blendMode??"normal"}));
 const strokes=doc.strokes.map(s=>({id:s.id,layerId:s.layerId,color:s.color,size:s.size,points:s.points}));
 return JSON.stringify({id:doc.id,projectId:doc.projectId??"",width:doc.width,height:doc.height,background:doc.background,layers,strokes});
}
