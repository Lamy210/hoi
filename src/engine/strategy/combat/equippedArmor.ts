/** Actual combat armor/piercing is derived only from already-issued models.
 * A blueprint in the catalog or a warehouse model does not protect a division.
 * Category demand is a tactical weight, never an additional inventory asset.
 */
import type {Division,StrategyState} from '../model';

const CATEGORY_WIDTH:Readonly<Record<string,number>>={
  infantry:2,artillery:3,tank:4,support:1,
};

export interface EquippedArmor {
  readonly armor:number;
  readonly piercing:number;
  readonly totalRequiredWidth:number;
  readonly weightedPiercing:number;
  readonly highestPiercing:number;
}

/** Deterministic model ID ordering makes exceeding/corrupt issue data stable.
 * Only a validated State should reach this function.
 */
export function issuedArmorPiercing(
  state:Pick<StrategyState,'lots'|'designs'>,division:Division,
):EquippedArmor {
  const req=division.requiredEquipment??{};
  const designs=new Map(state.designs.map(d=>[d.id,d]));
  let totalRequiredWidth=0,armorSum=0,piercingSum=0,highestPiercing=0;
  for(const [category,needed] of Object.entries(req).sort(([a],[b])=>a.localeCompare(b))){
    const unitWidth=CATEGORY_WIDTH[category];
    if(unitWidth===undefined||!Number.isSafeInteger(needed)||needed<0)
      throw new RangeError('invalid division equipment category/requirement');
    totalRequiredWidth+=needed*unitWidth;
    let issued=0;
    const lots=state.lots.filter(l=>l.holder==='division'&&l.holderId===division.id&&
      designs.get(l.modelId)?.category===category).sort((a,b)=>a.modelId.localeCompare(b.modelId));
    for(const lot of lots){
      const design=designs.get(lot.modelId)!;
      const qty=Math.min(lot.quantity,Math.max(0,needed-issued));
      if(qty<=0)continue;
      issued+=qty;
      const width=qty*unitWidth;
      armorSum+=design.armor*width;
      piercingSum+=design.piercing*width;
      highestPiercing=Math.max(highestPiercing,design.piercing);
    }
  }
  if(!Number.isFinite(totalRequiredWidth)||totalRequiredWidth<0||
    !Number.isFinite(armorSum)||!Number.isFinite(piercingSum))
    throw new RangeError('invalid equipped armor');
  return {
    totalRequiredWidth,
    armor:totalRequiredWidth?armorSum/totalRequiredWidth:0,
    piercing:totalRequiredWidth?
      .7*highestPiercing+.3*piercingSum/totalRequiredWidth:0,
    weightedPiercing:totalRequiredWidth?piercingSum/totalRequiredWidth:0,
    highestPiercing,
  };
}
