export interface DrawingGuardState {
 id:string; projectId?:string; width:number; height:number; background:string;
 strokes:Array<{id:string;layerId?:string;tool?:string;color:string;size:number;shape?:string;imageName?:string;text?:string;fontFamily?:string;filled?:boolean;fillColor?:string;rotation?:number;brushPreset?:string;points:Array<{x:number;y:number;pressure?:number}>}>;
 layers?:Array<{id:string;name:string;visible:boolean;locked:boolean;opacity?:number;blendMode?:string}>;
}
export function drawingGuardSignature(doc:DrawingGuardState):string {
 const layers=(doc.layers?.length?doc.layers:[{id:"layer-default",name:"Sketch",visible:true,locked:false}]).map(layer=>({...layer,opacity:layer.opacity??1,blendMode:layer.blendMode??"normal"}));
 const strokes=doc.strokes.map(s=>({id:s.id,layerId:s.layerId,tool:s.tool,color:s.color,size:s.size,shape:s.shape,imageName:s.imageName,text:s.text,fontFamily:s.fontFamily,filled:s.filled,fillColor:s.fillColor,rotation:s.rotation,brushPreset:s.brushPreset,points:s.points}));
 const input=JSON.stringify({id:doc.id,projectId:doc.projectId??"",width:doc.width,height:doc.height,background:doc.background,layers,strokes});
 let h=2166136261;
 for(let i=0;i<input.length;i++) h=Math.imul(h^input.charCodeAt(i),16777619)>>>0;
 return h.toString(16).padStart(8,"0");
}
