import { describe, expect, it } from "vitest";
import { buildRelationshipContext, proposeRelationshipTransition, relationshipAt, validateRelationshipRecord, type RelationshipRecord, type RelationshipSnapshot } from "./relationshipMemory";

const enemies: RelationshipSnapshot = {
  state: "enemies", trust: 5, warmth: 0, tension: 95,
  emotionalNotes: ["A betrayal neither has forgotten"],
  interactionPattern: ["They watch each other for signs of deception"],
  boundaries: ["Do not mention the destroyed village lightly"],
  unresolvedWounds: ["One still blames the other for the loss"],
};
const friends: RelationshipSnapshot = {
  state: "friends", trust: 72, warmth: 78, tension: 28,
  emotionalNotes: ["Care exists alongside lingering hurt"],
  interactionPattern: ["They trade dry jokes but check each other's injuries"],
  boundaries: ["Apologies do not erase the past"],
  unresolvedWounds: ["The destroyed village remains painful"],
};
function record(): RelationshipRecord {
  return {schemaVersion:1,id:"rel-1",universeId:"u-1",characterAId:"aya",characterBId:"ren",directional:false,current:enemies,history:[],updatedAt:"2026-01-01T00:00:00.000Z"};
}
describe("temporal relationship memory",()=>{
  it("proposes an enemy-to-friend transition without mutating approved state",()=>{
    const initial=record();
    const event=proposeRelationshipTransition(initial,{id:"event-1",title:"They choose to trust each other",summary:"They work together to save a friend.",cause:"Shared danger",sourceMessageIds:["message-8"],storyOrder:8,after:friends},()=>"event-1");
    expect(event.canonStatus).toBe("proposed");
    expect(event.before.state).toBe("enemies");
    expect(event.after.state).toBe("friends");
    expect(initial.current.state).toBe("enemies");
    expect(initial.history).toHaveLength(0);
  });
  it("uses approved story-time states and excludes proposed events",()=>{
    const value=record();
    const enemyEvent=proposeRelationshipTransition(value,{id:"e1",title:"The betrayal",summary:"They become enemies.",cause:"Betrayal",sourceMessageIds:["m1"],storyOrder:1,after:enemies},()=>"e1");
    const friendEvent=proposeRelationshipTransition({...value,history:[{...enemyEvent,canonStatus:"approved"}]}, {id:"e2",title:"A fragile reconciliation",summary:"They save each other.",cause:"Mutual sacrifice",sourceMessageIds:["m2"],storyOrder:2,after:friends},()=>"e2");
    value.history=[{...enemyEvent,canonStatus:"approved"},friendEvent];
    expect(relationshipAt(value,1)?.state).toBe("enemies");
    expect(relationshipAt(value,2)?.state).toBe("enemies");
    value.history[1]={...friendEvent,canonStatus:"approved"};
    expect(relationshipAt(value,2)?.state).toBe("friends");
  });
  it("keeps emotional detail and refuses cross-universe context",()=>{
    const value=record();
    const context=buildRelationshipContext([value],"u-1");
    expect(context).toContain("destroyed village");
    expect(buildRelationshipContext([value],"u-2")).toContain("No approved relationship records");
  });
  it("rejects self relationships and out-of-order history",()=>{
    const value=record();
    expect(validateRelationshipRecord({...value,characterBId:"aya"})).toBe(false);
    const event=proposeRelationshipTransition(value,{id:"e1",title:"A",summary:"B",cause:"C",sourceMessageIds:["m"],storyOrder:3,after:friends},()=>"e1");
    expect(validateRelationshipRecord({...value,history:[event,{...event,id:"e2",storyOrder:2}]})).toBe(false);
  });
});
