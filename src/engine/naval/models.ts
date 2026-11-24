// Phase8B: deliberately abstract naval game models, not real-world ship specifications.
// Ship ownership, commissioning and missions are introduced in later phases.
export type NavalRole='transport'|'escort'|'combat';
export interface NavalModel {
  id:string;
  role:NavalRole;
  nameJa:string;
  nameEn:string;
  hull:number; // game-only abstract HP, positive integer
  speed:number; // game-only movement weight, positive integer
  navalPower:number; // abstract combat score
  escortPower:number; // abstract anti-interdiction score
  transportCapacity:number; // game transport slots
  industryCost:number; // future production resource units, NOT real cost
  crew:number; // game manpower cost, NOT real crew complement
  buildDays:number;
}

const MODELS:readonly NavalModel[]=[
  {id:'convoy-basic',role:'transport',nameJa:'汎用輸送船',nameEn:'Basic convoy',
    hull:60,speed:5,navalPower:0,escortPower:0,transportCapacity:20,
    industryCost:70,crew:60,buildDays:12},
  {id:'escort-basic',role:'escort',nameJa:'護衛艦',nameEn:'Escort vessel',
    hull:85,speed:8,navalPower:12,escortPower:22,transportCapacity:0,
    industryCost:110,crew:110,buildDays:18},
  {id:'patrol-basic',role:'combat',nameJa:'哨戒戦闘艦',nameEn:'Patrol combat vessel',
    hull:120,speed:10,navalPower:24,escortPower:6,transportCapacity:0,
    industryCost:170,crew:170,buildDays:27},
  {id:'capital-basic',role:'combat',nameJa:'大型水上艦',nameEn:'Capital surface vessel',
    hull:360,speed:7,navalPower:75,escortPower:8,transportCapacity:0,
    industryCost:480,crew:400,buildDays:65},
];
const MODEL_ID=/^[a-z][a-z0-9-]{0,63}$/;
const validName=(n:unknown)=>typeof n==='string'&&n.trim()===n&&n.length>0&&n.length<=120;
const int=(v:unknown,min:number,max:number)=>Number.isSafeInteger(v)&&
  typeof v==='number'&&v>=min&&v<=max;
export function validateNavalModels(models:unknown):string[]{
  if(!Array.isArray(models)||!models.length||models.length>256)
    return ['invalid naval model list'];
  const errors:string[]=[];
  const seen=new Set<string>();
  for(const [idx,value] of models.entries()){
    if(!value||typeof value!=='object'||Array.isArray(value)){
      errors.push('invalid naval model at '+idx);continue;
    }
    const m=value as Partial<NavalModel>;
    if(typeof m.id!=='string'||!MODEL_ID.test(m.id)||seen.has(m.id)){
      errors.push('invalid or duplicate naval model id: '+String(m.id));continue;
    }
    seen.add(m.id);
    if(m.role!=='transport'&&m.role!=='escort'&&m.role!=='combat')
      errors.push('invalid naval role: '+m.id);
    if(!validName(m.nameJa)||!validName(m.nameEn))
      errors.push('invalid naval model name: '+m.id);
    for(const [field,min,max] of [
      ['hull',1,100000],['speed',1,10000],['navalPower',0,100000],
      ['escortPower',0,100000],['transportCapacity',0,100000],
      ['industryCost',1,1000000],['crew',1,1000000],['buildDays',1,1000000],
    ] as const){
      if(!int(m[field],min,max))errors.push('invalid '+field+': '+m.id);
    }
    if(m.role==='transport'&&(m.transportCapacity??0)<=0||
       m.role!=='transport'&&(m.transportCapacity??0)!==0)
      errors.push('invalid transport role capacity: '+m.id);
    if(m.role==='escort'&&(m.escortPower??0)<=0)
      errors.push('missing escort power: '+m.id);
    if(m.role==='combat'&&(m.navalPower??0)<=0)
      errors.push('missing naval power: '+m.id);
  }
  return errors;
}
export const NAVAL_MODELS:readonly NavalModel[]=Object.freeze(MODELS.map(m=>Object.freeze({...m})));
if(validateNavalModels(NAVAL_MODELS).length)throw new Error('invalid built-in naval models');
export function navalModel(id:string):NavalModel|undefined {
  return NAVAL_MODELS.find(m=>m.id===id);
}
