// コマンドレジストリ — 全コマンドの検証と適用（game-core仕様）。
// UI（issuer='player'）とAI（issuer='ai:<id>'）は同一の検証を通る。
import { BATTALION_CATALOG_VERSION, previewTemplate } from './military/templateStats';
import { MAX_CUSTOM_TEMPLATES, MAX_CUSTOM_REVISIONS, latestTemplate, latestTemplates, validTemplateName, trainingSpec } from './military/customTemplates';
import { MAX_ARMIES, MAX_GROUPS, MAX_ARMY_UNITS, MAX_GROUP_ARMIES, validName, validColor, nextFormationName } from './military/armies';
import { allocateAiSequence } from './core/sequence';
import { issuerCountry, registerCommand } from './core/command';
import { addAlert, atWar, type Cmd, type TreatyType, type WorldState } from './core/state';
import { getEdge } from './map/adjacency';
import { findPath, segmentDays, planMovementEdit } from './systems/movement';
import { applyRelationDelta, endWar, startWar, warScoreFor } from './military/war';
import { UNIT_MAX_ART_EQUIPMENT, UNIT_MAX_INF_EQUIPMENT, UNIT_MAX_MANPOWER } from './scenario/unitCosts';
import { autoAssignCommander, releaseCommander } from './military/commanders';
import { AUTO_ATTACK_MIN_ORG, COUNTERATTACK_MIN_ORG, autoFrontProvinces, frontOf } from './military/fronts';
import { planFrontDeployment } from './military/frontDeployment';
import {planGroupFrontAssignments} from './military/groupFrontAssignments';
import {validateGarrisonCreation} from './military/garrisons';
import { divisionTemplate, MAX_TRAINING, type DivisionTemplateId } from './military/templates';
import { refundTraining, deployTrainingOrder } from './systems/training';
import { MAX_ART_SHARE } from './systems/production';
import { equipmentModels } from './military/equipmentCatalog';
import { MAX_EQUIPMENT_LINES, MAX_REQUESTED_FACTORIES, efficiencyAfterSwitch } from './systems/equipmentLinePlanner';
import { countryProductionLines, modelUnlocked } from './systems/productionLineState';
import { adjustWarehouse } from './systems/modelWarehouse';
import { attributeEquipment } from './systems/issuedEquipment';
import {validateModelExchange,applyModelExchange,planBatchModelExchange,applyBatchModelExchange} from './military/modelExchange';
import { applyBatchRefit, planBatchRefit } from './military/refit';
import { LAW_PP_COST } from './systems/politics';
import { techDefs, MAX_ACTIVE_RESEARCH } from './systems/research';
import { COST_INFRA, COST_MILFACTORY, MAX_CONCURRENT, constructionDays } from './systems/construction';
import {
  activeTreatyBetween, aiEvaluateTreaty, annulTreaty, isAllied, logDiplomacyDecision,
  proposedTreatyBetween, TREATY_TYPES, TREATY_DURATION_DAYS,
} from './diplomacy/treaties';
import { aiEvaluatePeace, validateDemands } from './diplomacy/peace';

export const UNIT_MANPOWER_COST = 10000;
export const UNIT_INF_EQUIPMENT_COST = 1000;
export const UNIT_ART_EQUIPMENT_COST = 200;
export { UNIT_MAX_ART_EQUIPMENT, UNIT_MAX_INF_EQUIPMENT, UNIT_MAX_MANPOWER };

function resolveIssuerCountry(w: WorldState, issuer: string, claimed: number): boolean {
  if (issuer === 'player') return claimed === w.playerCountry;
  const c = issuerCountry(issuer);
  return c !== null && c === claimed;
}

/** プレイヤー（手動='player'、戦線AI='frontai'）は w.playerCountry、AIは 'ai:<id>' の国家として解決する */
function actorCountry(w: WorldState, issuer: string): number | null {
  if (issuer === 'player' || issuer === 'frontai') return w.playerCountry;
  return issuerCountry(issuer);
}

function aiCmd(w: WorldState, issuer: string, type: string, p: Record<string, unknown>): void {
  const seq = allocateAiSequence(w, issuer);
  const cmd: Cmd = { issuer, seq, type, p };
  w.runtime.commandsSinceLastTick.push(cmd);
}

export function registerAllCommands(): void {
  registerCommand('setDifficulty', {
    validate(w, p, issuer) {
      if (issuer !== 'player') return 'notPlayer';
      if (w.tick !== 0) return 'onlyAtGameStart';
      const d = p.d;
      if (typeof d !== 'number' || d < 0 || d > 2 || !Number.isInteger(d)) return 'badDifficulty';
      return null;
    },
    apply(w, p) {
      w.difficulty = p.d as 0 | 1 | 2;
    },
  });

  registerCommand('createUnit', {
    validate(w, p, issuer) {
      const country = p.country as number;
      const prov = p.province as number;
      if (!Number.isInteger(country) || !Number.isInteger(prov)) return 'badParams';
      if (!resolveIssuerCountry(w, issuer, country)) return 'notYourCountry';
      if (country < 0 || country >= w.countries.count || !w.countries.alive[country]) return 'countryDead';
      if (prov < 0 || prov >= w.prov.count) return 'badProvince';
      if (w.prov.controller[prov] !== country) return 'notControlledByYou';
      if (w.countries.manpowerPool[country] < UNIT_MANPOWER_COST) return 'insufficientManpower';
      if (w.countries.infEquipmentStock[country] < UNIT_INF_EQUIPMENT_COST) return 'insufficientEquipment';
      if (w.countries.artEquipmentStock[country] < UNIT_ART_EQUIPMENT_COST) return 'insufficientArtillery';
      return null;
    },
    apply(w, p, issuer) {
      const country = p.country as number;
      const prov = p.province as number;
      w.countries.manpowerPool[country] -= UNIT_MANPOWER_COST;
      const infIssued=adjustWarehouse(w,country,'infantry',-UNIT_INF_EQUIPMENT_COST);
      const artIssued=adjustWarehouse(w,country,'artillery',-UNIT_ART_EQUIPMENT_COST);
      const unit = {
        id: w.nextUnitId++,
        owner: country,
        loc: prov,
        path: [],
        segIdx: 0,
        segProgress: 0,
        segDays: 0,
        manpower: UNIT_MAX_MANPOWER,
        maxManpower: UNIT_MAX_MANPOWER,
        infEquipment: UNIT_MAX_INF_EQUIPMENT,
        maxInfEquipment: UNIT_MAX_INF_EQUIPMENT,
        artEquipment: UNIT_MAX_ART_EQUIPMENT,
        maxArtEquipment: UNIT_MAX_ART_EQUIPMENT,
        org: 50,
        exp: 0,
        frontId: -1,
        commanderId: -1,
        encircled: false,
        destroyed: false,
      };
      w.units.push(unit);
      attributeEquipment(w,'unit',unit.id,[...infIssued,...artIssued]);
      // 空き指揮官の自動割当（最skill者。プレイヤーは後からUIで変更可能）
      autoAssignCommander(w, unit);
      addAlert(w, {
        kind: 'unitCreated', priority: 2,
        msgKey: 'alert.unitCreated',
        params: { where: w.prov.nameJa[prov] || w.prov.nameEn[prov] },
        actor: country, province: prov,
      });
      void issuer;
    },
  });

  registerCommand('exchangeUnitEquipment', {
    validate(w,p,issuer){
      const c=actorCountry(w,issuer);
      if(c===null||issuer==='frontai'||!w.countries.alive[c])return 'badIssuer';
      return validateModelExchange(w,c,p);
    },
    apply(w,p,issuer){
      const c=actorCountry(w,issuer)!;
      applyModelExchange(w,c,p);
    },
  });

  registerCommand('exchangeUnitsEquipment', {
    validate(w,p,issuer){
      const c=actorCountry(w,issuer);
      if(c===null||issuer==='frontai'||!w.countries.alive[c])return 'badIssuer';
      return planBatchModelExchange(w,c,p).reason;
    },
    apply(w,p,issuer){
      const c=actorCountry(w,issuer)!;
      applyBatchModelExchange(w,c,p);
    },
  });

  // Custom templates are country-scoped, immutable per revision and never silently refit existing units.
  registerCommand('createTemplate', {
    validate(w,p,issuer){
      const c=actorCountry(w,issuer);
      if(c===null||!w.countries.alive[c]||issuer==='frontai')return 'badIssuer';
      if(!validTemplateName(p.name))return 'badParams';
      if(!previewTemplate({battalionIds:p.battalionIds,supportIds:p.supportIds}).ok)return 'badComposition';
      if(latestTemplates(w,c).length>=MAX_CUSTOM_TEMPLATES ||
        w.customTemplates.filter(x=>x.country===c).length>=MAX_CUSTOM_REVISIONS ||
        w.nextCustomTemplateId>=Number.MAX_SAFE_INTEGER)return 'limitExceeded';
      return null;
    },
    apply(w,p,issuer){
      w.customTemplates.push({country:actorCountry(w,issuer)!,templateId:w.nextCustomTemplateId++,
        revision:1,name:p.name as string,catalogVersion:BATTALION_CATALOG_VERSION,
        battalionIds:[...(p.battalionIds as string[])],supportIds:[...(p.supportIds as string[])]});
    },
  });
  registerCommand('reviseTemplate', {
    validate(w,p,issuer){
      const c=actorCountry(w,issuer);
      if(c===null||!w.countries.alive[c]||issuer==='frontai')return 'badIssuer';
      if(!Number.isSafeInteger(p.templateId)||!Number.isSafeInteger(p.expectedRevision)||!validTemplateName(p.name))return 'badParams';
      const t=latestTemplate(w,c,p.templateId as number);
      if(!t)return 'notYourTemplate';
      if(t.revision!==p.expectedRevision)return 'staleRevision';
      if(t.revision>=Number.MAX_SAFE_INTEGER||w.customTemplates.filter(x=>x.country===c).length>=MAX_CUSTOM_REVISIONS)return 'limitExceeded';
      if(!previewTemplate({battalionIds:p.battalionIds,supportIds:p.supportIds}).ok)return 'badComposition';
      return null;
    },
    apply(w,p,issuer){
      const t=latestTemplate(w,actorCountry(w,issuer)!,p.templateId as number)!;
      w.customTemplates.push({country:t.country,templateId:t.templateId,revision:t.revision+1,
        name:p.name as string,catalogVersion:BATTALION_CATALOG_VERSION,
        battalionIds:[...(p.battalionIds as string[])],supportIds:[...(p.supportIds as string[])]});
    },
  });
  // refitUnit は旧UI/リプレイ互換。refitUnits は事前集計後の全件原子的な変更。
  registerCommand('refitUnit', {
    validate(w,p,issuer) {
      const country = actorCountry(w,issuer);
      if (country === null || !w.countries.alive[country] || issuer === 'frontai') return 'badIssuer';
      return planBatchRefit(w,country,[p.unitId],p.templateId,p.revision).reason;
    },
    apply(w,p,issuer) {
      const country = actorCountry(w,issuer)!;
      const result = planBatchRefit(w,country,[p.unitId],p.templateId,p.revision);
      if (!result.plan) throw new Error('validated single refit plan no longer valid');
      applyBatchRefit(w,country,result.plan);
    },
  });
  registerCommand('refitUnits', {
    validate(w,p,issuer) {
      const country = actorCountry(w,issuer);
      if (country === null || !w.countries.alive[country] || issuer === 'frontai') return 'badIssuer';
      return planBatchRefit(w,country,p.unitIds,p.templateId,p.revision).reason;
    },
    apply(w,p,issuer) {
      const country = actorCountry(w,issuer)!;
      const result = planBatchRefit(w,country,p.unitIds,p.templateId,p.revision);
      if (!result.plan) throw new Error('validated batch refit plan no longer valid');
      applyBatchRefit(w,country,result.plan);
    },
  });

  registerCommand('deleteTemplate', {
    validate(w,p,issuer){
      const c=actorCountry(w,issuer);
      if(c===null||!w.countries.alive[c]||issuer==='frontai')return 'badIssuer';
      const id=p.templateId as number;
      if(!Number.isSafeInteger(id)||!Number.isSafeInteger(p.expectedRevision))return 'badParams';
      const t=latestTemplate(w,c,id);
      if(!t)return 'notYourTemplate';
      if(t.revision!==p.expectedRevision)return 'staleRevision';
      // The training/refit integration uses numeric custom ID references; reject before extension.
      if(w.trainingQueue.some(o=>(o as {customTemplateId?:number}).customTemplateId===id) ||
         w.units.some(u=>(u as {customTemplateId?:number}).customTemplateId===id))return 'templateInUse';
      return null;
    },
    apply(w,p,issuer){
      const c=actorCountry(w,issuer)!;
      w.customTemplates=w.customTemplates.filter(t=>t.country!==c||t.templateId!==p.templateId);
    },
  });

  registerCommand('startTraining', {
    validate(w, p, issuer) {
      const c = actorCountry(w, issuer), prov = p.province as number;
      const t = divisionTemplate(p.templateId);
      if (c === null || !w.countries.alive[c]) return 'countryDead';
      if (!t) return 'badParams';
      if (!Number.isInteger(prov) || prov < 0 || prov >= w.prov.count) return 'badProvince';
      if (w.prov.controller[prov] !== c) return 'notControlledByYou';
      if (w.trainingQueue.filter(o => o.country === c).length >= MAX_TRAINING) return 'trainingFull';
      if (w.countries.manpowerPool[c] < t.manpower) return 'insufficientManpower';
      if (w.countries.infEquipmentStock[c] < t.infantry) return 'insufficientEquipment';
      if (w.countries.artEquipmentStock[c] < t.artillery) return 'insufficientArtillery';
      return null;
    },
    apply(w, p, issuer) {
      const c = actorCountry(w, issuer)!;
      const t = divisionTemplate(p.templateId)!;
      w.countries.manpowerPool[c] -= t.manpower;
      const id=w.nextUnitId++;
      const inf=adjustWarehouse(w,c,'infantry',-t.infantry);
      const art=adjustWarehouse(w,c,'artillery',-t.artillery);
      attributeEquipment(w,'training',id,[...inf,...art]);
      w.trainingQueue.push({ id, country: c, province: p.province as number, templateId: t.id, readyTick: w.tick + t.days });
    },
  });
  registerCommand('startCustomTraining', {
    validate(w,p,issuer){
      const c=actorCountry(w,issuer),prov=p.province as number;
      if(c===null||!w.countries.alive[c]||issuer==='frontai')return 'badIssuer';
      if(!Number.isSafeInteger(p.templateId)||!Number.isSafeInteger(p.revision))return 'badParams';
      const t=trainingSpec(w,{country:c,customTemplateId:p.templateId as number,customRevision:p.revision as number});
      if(!t)return 'notYourTemplate';
      if(!Number.isInteger(prov)||prov<0||prov>=w.prov.count)return 'badProvince';
      if(w.prov.controller[prov]!==c)return 'notControlledByYou';
      if(w.trainingQueue.filter(o=>o.country===c).length>=MAX_TRAINING||w.nextUnitId>=Number.MAX_SAFE_INTEGER)return 'trainingFull';
      if(w.countries.manpowerPool[c]<t.manpower)return 'insufficientManpower';
      if(w.countries.infEquipmentStock[c]<t.infantry)return 'insufficientEquipment';
      if(w.countries.artEquipmentStock[c]<t.artillery)return 'insufficientArtillery';
      return null;
    },
    apply(w,p,issuer){
      const c=actorCountry(w,issuer)!,t=trainingSpec(w,{country:c,customTemplateId:p.templateId as number,customRevision:p.revision as number})!;
      w.countries.manpowerPool[c]-=t.manpower;
      const id=w.nextUnitId++;
      const inf=adjustWarehouse(w,c,'infantry',-t.infantry);
      const art=adjustWarehouse(w,c,'artillery',-t.artillery);
      attributeEquipment(w,'training',id,[...inf,...art]);
      w.trainingQueue.push({id,country:c,province:p.province as number,
        customTemplateId:p.templateId as number,customRevision:p.revision as number,readyTick:w.tick+t.days});
    },
  });

  // The queued workflow is additive: legacy startTraining remains immediate-reservation.
  registerCommand('enqueueTraining',{
    validate(w,p,issuer){
      const c=actorCountry(w,issuer),prov=p.province as number;
      if(c===null||!w.countries.alive[c]||issuer==='frontai')return 'badIssuer';
      if(!Number.isInteger(prov)||prov<0||prov>=w.prov.count)return 'badProvince';
      if(w.prov.controller[prov]!==c)return 'notControlledByYou';
      if(!Number.isInteger(p.priority)||(p.priority as number)<0||(p.priority as number)>9||
         typeof p.autoDeploy!=='boolean')return 'badParams';
      if(w.trainingQueue.filter(o=>o.country===c).length>=MAX_TRAINING||w.nextUnitId>=Number.MAX_SAFE_INTEGER)return 'trainingFull';
      if(typeof p.templateId==='string'&&p.revision===undefined){
        return divisionTemplate(p.templateId)?null:'badParams';
      }
      if(!Number.isSafeInteger(p.templateId)||!Number.isSafeInteger(p.revision))return 'badParams';
      const t=trainingSpec(w,{country:c,customTemplateId:p.templateId as number,customRevision:p.revision as number});
      return t?null:'notYourTemplate';
    },
    apply(w,p,issuer){
      const c=actorCountry(w,issuer)!;
      const ref=typeof p.templateId==='string'?
        {templateId:p.templateId as DivisionTemplateId}:
        {customTemplateId:p.templateId as number,customRevision:p.revision as number};
      w.trainingQueue.push({id:w.nextUnitId++,country:c,province:p.province as number,
        ...ref,status:'queued',readyTick:-1,priority:p.priority as number,autoDeploy:p.autoDeploy as boolean});
    },
  });
  registerCommand('setTrainingPriority',{
    validate(w,p,issuer){
      const c=actorCountry(w,issuer);
      if(c===null||issuer==='frontai')return 'badIssuer';
      if(!Number.isInteger(p.priority)||(p.priority as number)<0||(p.priority as number)>9)return 'badParams';
      return w.trainingQueue.some(o=>o.id===p.orderId&&o.country===c&&o.status!==undefined)?null:'badParams';
    },
    apply(w,p){
      w.trainingQueue.find(o=>o.id===p.orderId)!.priority=p.priority as number;
    },
  });
  registerCommand('setDeploymentProvince',{
    validate(w,p,issuer){
      const c=actorCountry(w,issuer),prov=p.province as number;
      if(c===null||issuer==='frontai')return 'badIssuer';
      if(!Number.isInteger(prov)||prov<0||prov>=w.prov.count)return 'badProvince';
      if(w.prov.controller[prov]!==c)return 'notControlledByYou';
      return w.trainingQueue.some(o=>o.id===p.orderId&&o.country===c&&o.status!==undefined)?null:'badParams';
    },
    apply(w,p){
      w.trainingQueue.find(o=>o.id===p.orderId)!.province=p.province as number;
    },
  });
  registerCommand('deployTraining',{
    validate(w,p,issuer){
      const c=actorCountry(w,issuer);
      if(c===null||issuer==='frontai')return 'badIssuer';
      const o=w.trainingQueue.find(o=>o.id===p.orderId&&o.country===c&&o.status==='ready');
      if(!o)return 'badParams';
      return w.prov.controller[o.province]===c?null:'notControlledByYou';
    },
    apply(w,p){
      const index=w.trainingQueue.findIndex(o=>o.id===p.orderId);
      deployTrainingOrder(w,w.trainingQueue[index]);
      w.trainingQueue.splice(index,1);
    },
  });

  registerCommand('cancelTraining', {
    validate(w, p, issuer) {
      const c = actorCountry(w, issuer);
      return w.trainingQueue.some(o => o.id === p.id && o.country === c) ? null : 'badParams';
    },
    apply(w, p) {
      const index = w.trainingQueue.findIndex(o => o.id === p.id);
      refundTraining(w, w.trainingQueue[index]);
      w.trainingQueue.splice(index, 1);
    },
  });

  // V14 production plans: commands are journaled and persisted, but do not
  // modify actual two-goods stock until inventory migration is complete.
  const validateLineInput=(p:Record<string,unknown>)=>
    !Number.isInteger(p.factories)||(p.factories as number)<0||
    (p.factories as number)>MAX_REQUESTED_FACTORIES||
    !Number.isInteger(p.priority)||(p.priority as number)<0||
    (p.priority as number)>9 ? 'badParams' : null;
  registerCommand('createProductionLine',{
    validate(w,p,issuer){
      const country=actorCountry(w,issuer);
      if(country===null||issuer==='frontai'||!w.countries.alive[country])return 'badIssuer';
      const args=validateLineInput(p);if(args)return args;
      if(countryProductionLines(w,country).length>=MAX_EQUIPMENT_LINES||
        !Number.isSafeInteger(w.nextProductionLineId)||w.nextProductionLineId>=Number.MAX_SAFE_INTEGER)
        return 'limitExceeded';
      const model=equipmentModels().find(m=>m.id===p.modelId);
      if(!model)return 'unknownModel';
      return modelUnlocked(w,country,model)?null:'techLocked';
    },
    apply(w,p,issuer){
      const country=actorCountry(w,issuer)!;
      w.productionLines.push({country,id:w.nextProductionLineId++,modelId:p.modelId as string,
        requestedFactories:p.factories as number,priority:p.priority as number,
        efficiency:0.1,active:true});
    },
  });
  registerCommand('updateProductionLine',{
    validate(w,p,issuer){
      const country=actorCountry(w,issuer);
      if(country===null||issuer==='frontai'||!w.countries.alive[country])return 'badIssuer';
      if(!Number.isSafeInteger(p.lineId)||typeof p.active!=='boolean')return 'badParams';
      const args=validateLineInput(p);if(args)return args;
      return w.productionLines.some(l=>l.country===country&&l.id===p.lineId)?null:'notYourLine';
    },
    apply(w,p,issuer){
      const line=w.productionLines.find(l=>l.country===actorCountry(w,issuer)&&l.id===p.lineId)!;
      line.requestedFactories=p.factories as number;
      line.priority=p.priority as number;
      line.active=p.active as boolean;
    },
  });
  registerCommand('switchProductionModel',{
    validate(w,p,issuer){
      const country=actorCountry(w,issuer);
      if(country===null||issuer==='frontai'||!w.countries.alive[country])return 'badIssuer';
      if(!Number.isSafeInteger(p.lineId))return 'badParams';
      const line=w.productionLines.find(l=>l.country===country&&l.id===p.lineId);
      if(!line)return 'notYourLine';
      const model=equipmentModels().find(m=>m.id===p.modelId);
      if(!model)return 'unknownModel';
      return modelUnlocked(w,country,model)?null:'techLocked';
    },
    apply(w,p,issuer){
      const line=w.productionLines.find(l=>l.country===actorCountry(w,issuer)&&l.id===p.lineId)!;
      const source=equipmentModels().find(m=>m.id===line.modelId)!;
      const target=equipmentModels().find(m=>m.id===p.modelId)!;
      line.efficiency=efficiencyAfterSwitch(source,target,line.efficiency);
      line.modelId=target.id;
    },
  });
  registerCommand('deleteProductionLine',{
    validate(w,p,issuer){
      const country=actorCountry(w,issuer);
      if(country===null||issuer==='frontai'||!w.countries.alive[country])return 'badIssuer';
      if(!Number.isSafeInteger(p.lineId))return 'badParams';
      return w.productionLines.some(l=>l.country===country&&l.id===p.lineId)?null:'notYourLine';
    },
    apply(w,p,issuer){
      w.productionLines=w.productionLines.filter(l=>l.id!==p.lineId||l.country!==actorCountry(w,issuer));
    },
  });

  registerCommand('setProductionMode', {
    validate(w,p,issuer){
      const country=actorCountry(w,issuer);
      if(country===null||issuer==='frontai')return 'badIssuer';
      if(!w.countries.alive[country])return 'countryDead';
      if(p.mode!=='legacy'&&p.mode!=='lines')return 'badParams';
      if(p.mode==='lines'&&!equipmentModels().length)return 'noEquipmentCatalog';
      return null;
    },
    apply(w,p,issuer){
      w.productionMode[actorCountry(w,issuer)!]=p.mode as 'legacy'|'lines';
    },
  });

  registerCommand('setProductionShare', {
    validate(w, p, issuer) {
      const share = p.share as number;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'countryDead';
      if (typeof share !== 'number' || !Number.isFinite(share) || share < 0 || share > MAX_ART_SHARE) return 'badShare';
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      w.productionShare[country] = p.share as number;
      void issuer;
    },
  });

  registerCommand('createFront', {
    validate(w, p, issuer) {
      const enemy = p.enemy as number;
      const country = actorCountry(w, issuer);
      if (country === null || issuer === 'frontai') return 'badIssuer';
      if (!w.countries.alive[country]) return 'countryDead';
      if (!Number.isInteger(enemy) || enemy < 0 || enemy >= w.countries.count || !w.countries.alive[enemy]) return 'badTarget';
      if (enemy === country) return 'selfWar';
      const atWarNow = atWar(w, country, enemy);
      const provinces = p.provinces as number[] | undefined;
      // A peacetime front must be explicitly drawn; automatic frontline discovery is wartime-only.
      if (!atWarNow && provinces === undefined) return 'notAtWar';
      if (provinces !== undefined) {
        if (!Array.isArray(provinces) || provinces.length === 0 || new Set(provinces).size !== provinces.length) return 'badParams';
        for (const prov of provinces) {
          if (!Number.isInteger(prov) || prov < 0 || prov >= w.prov.count) return 'badProvince';
          if (w.prov.controller[prov] !== country) return 'notControlledByYou';
        }
      }
      if (p.targets !== undefined && (!Array.isArray(p.targets) || new Set(p.targets).size !== p.targets.length || p.targets.some(x=>!Number.isInteger(x)||x<0||x>=w.prov.count||w.prov.controller[x]!==enemy))) return 'badParams';
      // Optional atomic front + division assignment: validate the entire batch first.
      // Never create an orphaned front if even one unit is foreign, destroyed, duplicated, or invalid.
      const ids = p.units;
      if (ids !== undefined) {
        if (!Array.isArray(ids) || ids.length === 0 || ids.length > 256 ||
          new Set(ids).size !== ids.length || ids.some(id => !Number.isSafeInteger(id))) return 'badParams';
        if (ids.some(id => !w.units.some(u => u.id === id && u.owner === country && !u.destroyed))) return 'notYourUnit';
        if (ids.some(id=>w.garrisons.some(g=>g.unitIds.includes(id))))return 'unitAlreadyAssigned';
      }
      const cap = p.cap as number | undefined;
      if (cap !== undefined && (!Number.isInteger(cap) || cap < 1 || cap > 8)) return 'badParams';
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      const enemy = p.enemy as number;
      const provinces = Array.isArray(p.provinces) ? (p.provinces as number[]).slice().sort((a, b) => a - b) : autoFrontProvinces(w, country, enemy);
      const targets = Array.isArray(p.targets) ? (p.targets as number[]).slice().sort((a, b) => a - b) : [];
      const cap = typeof p.cap === 'number' ? p.cap : 2;
      const front = { id: w.nextFrontId++, owner: country, enemy, stance: 'hold' as const, provinces, targets, cap,
        revision: 1, paused: !atWar(w, country, enemy) };
      w.fronts.push(front);
      if (Array.isArray(p.units)) {
        const ids = new Set(p.units as number[]);
        for (const u of w.units) if (ids.has(u.id)) {
          u.frontId = front.id;
          // Even during war, atomic creation must not silently undo manual hold.
          // Explicit manual-resume remains a separate command.
        }
      }
      void issuer;
    },
  });

  // Existing front boundaries are revised atomically; stale UI drafts and queued AI orders
  // cannot overwrite a newer plan. Assignments, targets, stance and pause are preserved.
  registerCommand('updateFrontProvinces', {
    validate(w,p,issuer) {
      const f=frontOf(w,p.frontId as number),c=actorCountry(w,issuer);
      if(!f)return 'noFront';
      if(c===null||c!==f.owner||issuer==='frontai')return 'notYourFront';
      if(p.expectedRevision!==(f.revision??1))return 'staleFrontOrder';
      if((f.revision??1)>=Number.MAX_SAFE_INTEGER)return 'limitExceeded';
      const provinces=p.provinces;
      if(!Array.isArray(provinces)||!provinces.length||provinces.length>256||
        new Set(provinces).size!==provinces.length)return 'badParams';
      for(const province of provinces){
        if(!Number.isInteger(province)||province<0||province>=w.prov.count)return 'badProvince';
        if(w.prov.controller[province]!==c)return 'notControlledByYou';
      }
      if(!w.countries.alive[f.enemy])return 'badTarget';
      return null;
    },
    apply(w,p){
      const front=frontOf(w,p.frontId as number)!;
      front.provinces=(p.provinces as number[]).slice().sort((a,b)=>a-b);
      front.revision=(front.revision??1)+1;
    },
  });

  registerCommand('setFrontStance', {
    validate(w,p,issuer) {
      const f = frontOf(w,p.frontId as number), c = actorCountry(w,issuer);
      if (!f) return 'noFront';
      if (c === null || c !== f.owner || issuer === 'frontai') return 'notYourFront';
      if (!['hold','attack','counterattack','retreat'].includes(p.stance as string)) return 'badParams';
      if (p.cap !== undefined && (!Number.isInteger(p.cap) || (p.cap as number)<0 || (p.cap as number)>8)) return 'badParams';
      if (p.targets !== undefined && (!Array.isArray(p.targets) || new Set(p.targets).size !== p.targets.length || p.targets.some(x=>!Number.isInteger(x)||x<0||x>=w.prov.count||w.prov.controller[x]!==f.enemy))) return 'badParams';
      // An offensive can be drafted before war only while automation is paused.
      if (!atWar(w,f.owner,f.enemy) && p.stance === 'attack' && !f.paused) return 'notAtWar';
      if ((f.revision??1)>=Number.MAX_SAFE_INTEGER) return 'limitExceeded';
      return null;
    },
    apply(w,p) {
      const f=frontOf(w,p.frontId as number)!;
      f.stance=p.stance as 'hold'|'attack'|'counterattack'|'retreat';
      if(Array.isArray(p.targets)) f.targets=(p.targets as number[]).slice().sort((a,b)=>a-b);
      if(typeof p.cap==='number') f.cap=p.cap;
      f.revision=(f.revision??1)+1;
    },
  });
  registerCommand('setFrontPaused', {
    validate(w,p,issuer) {
      const f=frontOf(w,p.frontId as number);
      if(!f) return 'noFront';
      if(issuer==='frontai'||actorCountry(w,issuer)!==f.owner) return 'notYourFront';
      if(typeof p.paused!=='boolean') return 'badParams';
      if(!p.paused&&!atWar(w,f.owner,f.enemy)) return 'notAtWar';
      return (f.revision??1)>=Number.MAX_SAFE_INTEGER?'limitExceeded':null;
    },
    apply(w,p){const f=frontOf(w,p.frontId as number)!; f.paused=p.paused as boolean;f.revision=(f.revision??1)+1;},
  });
  registerCommand('deleteFront', {
    validate(w,p,issuer){const f=frontOf(w,p.frontId as number);return !f?'noFront':issuer==='frontai'||actorCountry(w,issuer)!==f.owner?'notYourFront':null;},
    apply(w,p){w.fronts=w.fronts.filter(f=>f.id!==p.frontId);for(const u of w.units)if(u.frontId===p.frontId)u.frontId=-1;},
  });
  registerCommand('assignToFront', {
    validate(w,p,issuer) {
      const f=frontOf(w,p.frontId as number), c=actorCountry(w,issuer), ids=p.units;
      if(!f)return 'noFront';
      if(c===null||f.owner!==c||issuer==='frontai')return 'notYourFront';
      if(!w.countries.alive[f.enemy])return 'badTarget';
      if(!Array.isArray(ids)||!ids.length||ids.length>256||new Set(ids).size!==ids.length)return 'badParams';
      for(const id of ids)if(!w.units.some(u=>u.id===id&&u.owner===c&&!u.destroyed))return 'notYourUnit';
      if(ids.some(id=>w.garrisons.some(g=>g.unitIds.includes(id))))return 'unitAlreadyAssigned';
      return null;
    },
    apply(w,p){
      const ids=new Set(p.units as number[]),f=frontOf(w,p.frontId as number)!;
      for(const u of w.units)if(ids.has(u.id)){
        u.frontId=f.id;
        // Pre-war assignment is organizational only and must never clear a player's manual hold.
        if(atWar(w,f.owner,f.enemy))u.manualHold=false;
      }
    },
  });
  // Multi-army assignment is a single journaled command, not a sequence of
  // per-army commands that could leave the group partially reassigned.
  registerCommand('assignGroupFronts', {
    validate(w,p,issuer){
      const country=actorCountry(w,issuer);
      if(country===null||issuer==='frontai')return 'badIssuer';
      return planGroupFrontAssignments(w,country,p.groupId,p.assignments).reason;
    },
    apply(w,p,issuer){
      const country=actorCountry(w,issuer)!;
      const plan=planGroupFrontAssignments(w,country,p.groupId,p.assignments);
      if(plan.reason)throw new Error('validated army group front plan no longer valid: '+plan.reason);
      const targets=new Map(plan.orders.map(order=>[order.unitId,order.frontId]));
      for(const unit of w.units){
        const target=targets.get(unit.id);
        if(target!==undefined){
          // Preserve explicit holds and routes: this is organizational assignment,
          // not consent to replace manual movement or resume automation.
          unit.frontId=target;
        }
      }
    },
  });

  registerCommand('unassignFromFront', {
    validate(w,p,issuer){const c=actorCountry(w,issuer),ids=p.units;if(c===null||issuer==='frontai')return 'badIssuer';if(!Array.isArray(ids)||!ids.length||ids.length>256||new Set(ids).size!==ids.length)return 'badParams';return ids.every(id=>w.units.some(u=>u.id===id&&u.owner===c&&!u.destroyed))?null:'notYourUnit';},
    apply(w,p){const ids=new Set(p.units as number[]);for(const u of w.units)if(ids.has(u.id))u.frontId=-1;},
  });
  // One-shot automatic formation deployment. Validate every path before any unit changes.
  // A manual hold/movement must be resumed explicitly; front assignment alone is not consent.
  registerCommand('deployToFront', {
    validate(w,p,issuer){
      const country=actorCountry(w,issuer);
      if(country===null||issuer==='frontai'||!w.countries.alive[country])return 'badIssuer';
      return planFrontDeployment(w,country,p.frontId,p.expectedRevision,p.units,p.strategy).reason;
    },
    apply(w,p,issuer){
      const country=actorCountry(w,issuer)!;
      const result=planFrontDeployment(w,country,p.frontId,p.expectedRevision,p.units,p.strategy);
      if(result.reason)throw new Error('validated front deployment plan no longer valid: '+result.reason);
      for(const order of result.orders){
        const unit=w.units.find(u=>u.id===order.unitId)!;
        unit.frontId=p.frontId as number;
        unit.path=order.path;
        unit.segIdx=0;unit.segProgress=0;
        unit.segDays=order.path.length>1?segmentDays(w,order.path[0],order.path[1],unit):0;
      }
    },
  });

  registerCommand('setManualHold', {
    validate(w,p,issuer){const c=actorCountry(w,issuer),ids=p.units;if(c===null||issuer==='frontai')return 'badIssuer';if(typeof p.hold!=='boolean'||!Array.isArray(ids)||!ids.length||ids.length>256||new Set(ids).size!==ids.length)return 'badParams';return ids.every(id=>w.units.some(u=>u.id===id&&u.owner===c&&!u.destroyed))?null:'notYourUnit';},
    apply(w,p){const ids=new Set(p.units as number[]);for(const u of w.units)if(ids.has(u.id))u.manualHold=p.hold as boolean;},
  });
  // Player controls which deployed division fills limited terrain frontage.
  // Separate from supply reinforcements and manualHold; commands take effect
  // when the following daily combat resolves, not mid-battle.
  registerCommand('setFrontlinePriority', {
    validate(w,p,issuer){
      const country=actorCountry(w,issuer),ids=p.unitIds;
      if(country===null||!w.countries.alive[country]||issuer==='frontai')return 'badIssuer';
      if(!Number.isSafeInteger(p.priority)||(p.priority as number)<0||
        (p.priority as number)>9)return 'badParams';
      if(!Array.isArray(ids)||ids.length<1||ids.length>256||
        new Set(ids).size!==ids.length||
        !ids.every(id=>Number.isSafeInteger(id)&&id>0))return 'badParams';
      return ids.every(id=>w.units.some(u=>u.id===id&&u.owner===country&&!u.destroyed))
        ?null:'notYourUnit';
    },
    apply(w,p){
      const ids=new Set(p.unitIds as number[]);
      for(const u of w.units)if(ids.has(u.id))u.frontlinePriority=p.priority as number;
    },
  });

  // Automated front orders are generation-bound and revalidated when consumed.
  registerCommand('frontMove', {
    validate(w,p,issuer){
      const f=frontOf(w,p.frontId as number),c=actorCountry(w,issuer);
      if(issuer==='player'||!f||c!==f.owner||f.paused||!atWar(w,f.owner,f.enemy)||p.revision!==(f.revision??1))return 'staleFrontOrder';
      const u=w.units.find(x=>x.id===p.unitId&&!x.destroyed);
      if(!u||u.owner!==c||u.frontId!==f.id||u.manualHold||u.path.length||u.encircled||w.runtime.activeBattles.has(u.loc))return 'staleFrontOrder';
      const target=p.target as number;
      if(!Number.isInteger(target)||target<0||target>=w.prov.count||target===u.loc)return 'badTarget';
      if(w.prov.controller[target]===f.enemy){
        const edge=getEdge(w,u.loc,target);
        if((f.stance!=='attack'&&f.stance!=='counterattack')||f.cap<1||
          u.org<(f.stance==='counterattack'?COUNTERATTACK_MIN_ORG:AUTO_ATTACK_MIN_ORG)||
          (f.stance==='counterattack'&&w.prov.owner[target]!==c)||
          w.prov.controller[u.loc]!==c||!edge||edge.strait||
          !Number.isFinite(segmentDays(w,u.loc,target,u))||
          (f.targets.length>0&&!f.targets.includes(target)))return 'staleFrontOrder';
      }else if(w.prov.controller[target]!==c||!findPath(w,u.loc,target,c,false))return 'noPath';
      return null;
    },
    apply(w,p){const f=frontOf(w,p.frontId as number)!,u=w.units.find(x=>x.id===p.unitId)!;const target=p.target as number;u.path=w.prov.controller[target]===f.enemy?[u.loc,target]:findPath(w,u.loc,target,f.owner,false)!;u.segIdx=0;u.segProgress=0;u.segDays=segmentDays(w,u.path[0],u.path[1],u);},
  });

  // Area garrisons guard owned locations and must never share control with
  // combat fronts. Unit assignments and creation happen in one atomic command.
  registerCommand('createGarrison', {
    validate(w,p,issuer){
      const owner=actorCountry(w,issuer);
      if(owner===null||issuer==='frontai')return 'badIssuer';
      return validateGarrisonCreation(w,owner,p.provinces,p.unitIds);
    },
    apply(w,p,issuer){
      const owner=actorCountry(w,issuer)!;
      w.garrisons.push({
        id:w.nextGarrisonId++,owner,
        provinces:(p.provinces as number[]).slice().sort((a,b)=>a-b),
        unitIds:(p.unitIds as number[]).slice().sort((a,b)=>a-b),
        paused:false,revision:1,
      });
    },
  });
  registerCommand('setGarrisonPaused', {
    validate(w,p,issuer){
      const owner=actorCountry(w,issuer),g=w.garrisons.find(g=>g.id===p.orderId);
      if(!g)return 'noGarrison';
      if(issuer==='frontai'||owner!==g.owner)return 'notYourGarrison';
      if(typeof p.paused!=='boolean')return 'badParams';
      if(p.expectedRevision!==g.revision)return 'staleGarrisonOrder';
      if(g.revision>=Number.MAX_SAFE_INTEGER)return 'limitExceeded';
      return null;
    },
    apply(w,p){
      const g=w.garrisons.find(g=>g.id===p.orderId)!;
      g.paused=p.paused as boolean;
      g.revision++;
    },
  });
  registerCommand('deleteGarrison', {
    validate(w,p,issuer){
      const owner=actorCountry(w,issuer),g=w.garrisons.find(g=>g.id===p.orderId);
      if(!g)return 'noGarrison';
      if(issuer==='frontai'||owner!==g.owner)return 'notYourGarrison';
      return p.expectedRevision===g.revision?null:'staleGarrisonOrder';
    },
    apply(w,p){
      w.garrisons=w.garrisons.filter(g=>g.id!==p.orderId);
    },
  });
  registerCommand('garrisonMove', {
    validate(w,p,issuer){
      const g=w.garrisons.find(g=>g.id===p.orderId),c=actorCountry(w,issuer);
      if(issuer==='player'||!g||g.paused||g.revision!==p.revision||
        c!==g.owner)return 'staleGarrisonOrder';
      const u=w.units.find(u=>u.id===p.unitId&&!u.destroyed);
      if(!u||u.owner!==g.owner||!g.unitIds.includes(u.id)||u.frontId>=0||
        u.manualHold||u.encircled||u.path.length||
        w.runtime.activeBattles.has(u.loc)||w.prov.controller[u.loc]!==g.owner)
        return 'staleGarrisonOrder';
      const target=p.target as number;
      if(!Number.isSafeInteger(target)||!g.provinces.includes(target)||
        w.prov.controller[target]!==g.owner||target===u.loc)return 'staleGarrisonOrder';
      const route=findPath(w,u.loc,target,g.owner,false);
      if(!route||route.length<2)return 'noPath';
      return null;
    },
    apply(w,p){
      const g=w.garrisons.find(g=>g.id===p.orderId)!;
      const u=w.units.find(u=>u.id===p.unitId)!;
      const route=findPath(w,u.loc,p.target as number,g.owner,false)!;
      u.path=route;u.segIdx=0;u.segProgress=0;
      u.segDays=segmentDays(w,route[0],route[1],u);
    },
  });

  registerCommand('setTaxRate', {
    validate(w, p, issuer) {
      const rate = p.rate as number;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'countryDead';
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 0.5) return 'badShare';
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      w.taxRate[country] = p.rate as number;
      void issuer;
    },
  });

  registerCommand('setBudgetEdu', {
    validate(w, p, issuer) {
      const rate = p.rate as number;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (typeof rate !== 'number' || !Number.isFinite(rate) || rate < 0 || rate > 1) return 'badShare';
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      w.budgetEdu[country] = p.rate as number;
      void issuer;
    },
  });

  registerCommand('enactLaw', {
    validate(w, p, issuer) {
      const slot = p.slot as string;
      const target = p.target as number;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'countryDead';
      if (slot !== 'conscription' && slot !== 'economy') return 'badParams';
      if (!Number.isInteger(target) || target < 0 || target > 2) return 'badParams';
      if (w.lawQueue[country]) return 'lawPending';
      if (w.laws[country][slot] === target) return 'badParams';
      if (w.pp[country] < LAW_PP_COST) return 'insufficientPP';
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      w.lawQueue[country] = {
        slot: p.slot as 'conscription' | 'economy',
        target: p.target as 0 | 1 | 2,
        cost: LAW_PP_COST,
        startTick: w.tick,
        enactDays: 30,
      };
      void issuer;
    },
  });

  registerCommand('startResearch', {
    validate(w, p, issuer) {
      const techId = p.techId as string;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'countryDead';
      const def = techDefs().find((t) => t.id === techId);
      if (!def) return 'noTech';
      const st = w.research[country];
      if (st.done.includes(techId) || st.active.some((a) => a.id === techId)) return 'badParams';
      if (st.active.length >= MAX_ACTIVE_RESEARCH) return 'researchSlotsFull';
      for (const req of def.req) {
        if (!st.done.includes(req)) return 'techPrereqMissing';
      }
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      w.research[country].active.push({ id: p.techId as string, progress: 0 });
      void issuer;
    },
  });

  registerCommand('startConstruction', {
    validate(w, p, issuer) {
      const prov = p.province as number;
      const type = p.type as string;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!Number.isInteger(prov) || prov < 0 || prov >= w.prov.count) return 'badProvince';
      if (w.prov.controller[prov] !== country) return 'notControlledByYou';
      if (type !== 'milFactory' && type !== 'infra') return 'badParams';
      if (type === 'infra' && w.prov.infra[prov] >= 10) return 'badParams';
      if (w.constructionQueue.filter((pr) => pr.country === country && pr.daysProgress < pr.daysTotal).length >= MAX_CONCURRENT) return 'constructionFull';
      if (w.treasury[country] < (type === 'milFactory' ? COST_MILFACTORY : COST_INFRA) / constructionDays(w, prov)) return 'insufficientFunds';
      return null;
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      const prov = p.province as number;
      const type = p.type as 'milFactory' | 'infra';
      const cost = type === 'milFactory' ? COST_MILFACTORY : COST_INFRA;
      w.constructionQueue.push({
        id: w.nextConstructionId++,
        country,
        prov,
        type,
        cost,
        costPaid: 0,
        daysTotal: constructionDays(w, prov),
        daysProgress: 0,
        paused: false,
      });
      void issuer;
    },
  });

  registerCommand('assignCommander', {
    validate(w,p,issuer){
      const c=actorCountry(w,issuer),u=w.units.find(u=>u.id===p.unitId&&!u.destroyed);
      if(c===null||!w.countries.alive[c]||issuer==='frontai')return 'badIssuer';
      if(!u||u.owner!==c)return 'notYourUnit';
      if(p.commanderId===-1)return null;
      return w.commanders.some(x=>x.id===p.commanderId&&x.country===c)?null:'notYourCommander';
    },
    apply(w,p){
      const u=w.units.find(u=>u.id===p.unitId)!;
      releaseCommander(w,u.commanderId);
      if(p.commanderId===-1)return;
      const c=w.commanders.find(c=>c.id===p.commanderId)!;
      releaseCommander(w,c.id);u.commanderId=c.id;c.assignedUnit=u.id;
    },
  });
  registerCommand('assignFormationCommander',{
    validate(w,p,issuer){
      const c=actorCountry(w,issuer);
      if(c===null||!w.countries.alive[c]||issuer==='frontai')return 'badIssuer';
      if(p.kind!=='army'&&p.kind!=='group')return 'badParams';
      const f=(p.kind==='army'?w.armies:w.armyGroups).find(f=>f.id===p.formationId);
      if(!f||f.owner!==c)return 'notYourArmy';
      if(p.commanderId===-1)return null;
      return w.commanders.some(x=>x.id===p.commanderId&&x.country===c)?null:'notYourCommander';
    },
    apply(w,p){
      const f=(p.kind==='army'?w.armies:w.armyGroups).find(f=>f.id===p.formationId)!;
      releaseCommander(w,f.commanderId??-1);
      if(p.commanderId===-1){f.commanderId=-1;return;}
      const id=p.commanderId as number;
      releaseCommander(w,id);f.commanderId=id;
    },
  });

  registerCommand('moveUnits', {
    validate(w, p, issuer) {
      const ids = p.units as number[];
      const target = p.target as number;
      const country = actorCountry(w, issuer);
      if (!Array.isArray(ids) || ids.length === 0) return 'noUnits';
      if (issuer === 'frontai') return 'staleFrontOrder';
      if (issuer === 'player' && (ids.length > 256 || new Set(ids).size !== ids.length)) return 'badParams';
      if (!Number.isInteger(target) || target < 0 || target >= w.prov.count) return 'badTarget';
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'badIssuer';
      let movable = 0;
      for (const id of ids) {
        const u = w.units.find((x) => x.id === id);
        if (!u) return 'unknownUnit:' + id;
        if (u.owner !== country) return 'notYourUnit:' + id;
        if (u.destroyed) return 'unitDestroyed:' + id;
        if (u.encircled) return 'unitEncircled:' + id;
        if (issuer === 'player' && (u.path.length > 0 || w.runtime.activeBattles.has(u.loc))) return 'unitBusy:' + id;
        if (u.loc !== target) movable++;
      }
      if (movable === 0) return 'alreadyAtTarget';
      // 経路の存在確認（applyで再計算し同じ結果を得る）
      for (const id of ids) {
        const u = w.units.find((x) => x.id === id)!;
        if (u.loc === target) continue;
        const path = findPath(w, u.loc, target, country);
        if (!path) return 'noPath';
      }
      return null;
    },
    apply(w, p, issuer) {
      const ids = p.units as number[];
      const target = p.target as number;
      const country = actorCountry(w, issuer)!;
      for (const id of ids) {
        const u = w.units.find((x) => x.id === id);
        if (!u || u.loc === target) continue;
        if (issuer === 'player') u.manualHold = true;
        const path = findPath(w, u.loc, target, country)!;
        u.path = path;
        u.segIdx = 0;
        u.segProgress = 0;
        u.segDays = segmentDays(w, path[0], path[1],u);
      }
    },
  });

  // Dedicated UI travel order: never routes through hostile-controlled territory.
  registerCommand('travelUnits', {
    validate(w, p, issuer) {
      const country = actorCountry(w, issuer);
      if (country === null || !w.countries.alive[country]) return 'badIssuer';
      if (!Array.isArray(p.units) || p.units.length < 1 || p.units.length > 256 ||
          new Set(p.units).size !== p.units.length) return 'badParams';
      const target = p.target as number;
      if (!Number.isInteger(target) || target < 0 || target >= w.prov.count) return 'badTarget';
      if (atWar(w, country, w.prov.controller[target])) return 'useAttack';
      let movable = false;
      for (const id of p.units) {
        const u = w.units.find(x => x.id === id && !x.destroyed);
        if (!u || u.owner !== country) return 'notYourUnit';
        if (u.path.length || u.encircled || w.runtime.activeBattles.has(u.loc)) return 'unitBusy';
        if (u.loc === target) continue;
        movable = true;
        if (!findPath(w, u.loc, target, country, false)) return 'noPath';
      }
      return movable ? null : 'alreadyAtTarget';
    },
    apply(w, p, issuer) {
      const country = actorCountry(w, issuer)!;
      for (const id of p.units as number[]) {
        const u = w.units.find(x => x.id === id)!;
        const target = p.target as number;
        if (u.loc === target) continue;
        if (issuer === 'player') u.manualHold = true;
        u.path = findPath(w, u.loc, target, country, false)!;
        u.segIdx = 0; u.segProgress = 0;
        u.segDays = segmentDays(w, u.path[0], u.path[1],u);
      }
    },
  });

  // A null target stops after the already-started segment, never teleports a unit.
  for (const kind of ['haltUnits','redirectUnits'] as const) registerCommand(kind, {
    validate(w,p,issuer) {
      const c=actorCountry(w,issuer),ids=p.units;
      if(c===null||!w.countries.alive[c]||issuer==='frontai')return 'badIssuer';
      if(!Array.isArray(ids)||!ids.length||ids.length>256||new Set(ids).size!==ids.length)return 'badParams';
      const target=kind==='haltUnits'?null:p.target as number;
      if(target!==null&&(!Number.isInteger(target)||target<0||target>=w.prov.count))return 'badTarget';
      if(kind==='redirectUnits'&&target===null)return 'badTarget';
      for(const id of ids){
        const u=w.units.find(x=>x.id===id&&!x.destroyed);
        if(!u||u.owner!==c)return 'notYourUnit';
        if(u.encircled||w.runtime.activeBattles.has(u.loc))return 'unitBusy';
        if(!planMovementEdit(w,u,target))return 'noPath';
      }
      return null;
    },
    apply(w,p,issuer){
      const target=kind==='haltUnits'?null:p.target as number;
      for(const id of p.units as number[]){
        const u=w.units.find(x=>x.id===id)!;
        Object.assign(u,planMovementEdit(w,u,target)!);
        if(issuer==='player')u.manualHold=true;
      }
    },
  });

  registerCommand('attackUnits', {
    validate(w, p, issuer) {
      const country = actorCountry(w, issuer);
      if (country === null || !w.countries.alive[country]) return 'badIssuer';
      const ids = p.units;
      const target = p.target as number;
      if (!Array.isArray(ids) || ids.length < 1 || ids.length > 256 || new Set(ids).size !== ids.length) return 'badParams';
      if (!Number.isInteger(target) || target < 0 || target >= w.prov.count) return 'badTarget';
      if (!atWar(w, country, w.prov.controller[target])) return 'notAtWar';
      for (const id of ids) {
        const u = w.units.find(x => x.id === id && !x.destroyed);
        if (!u || u.owner !== country) return 'notYourUnit';
        if (u.path.length || u.encircled || w.runtime.activeBattles.has(u.loc) || u.org <= 0) return 'unitBusy';
        if (w.prov.controller[u.loc] !== country) return 'notControlledByYou';
        const edge = getEdge(w, u.loc, target);
        if (!edge || edge.strait || !Number.isFinite(segmentDays(w, u.loc, target,u))) return 'attackNotAdjacent';
      }
      return null;
    },
    apply(w, p, issuer) {
      const target = p.target as number;
      for (const id of p.units as number[]) {
        const u = w.units.find(x => x.id === id)!;
        if (issuer === 'player') u.manualHold = true;
        u.path = [u.loc, target]; u.segIdx = 0; u.segProgress = 0;
        u.segDays = segmentDays(w, u.loc, target,u);
      }
    },
  });

  registerCommand('createArmy', {
    validate(w,p,issuer) {
      const c = actorCountry(w,issuer);
      if (c === null || !w.countries.alive[c] || issuer === 'frontai') return 'badIssuer';
      if ((p.name!==undefined&&!validName(p.name)) || !validColor(p.color)) return 'badParams';
      if (w.armies.filter(a => a.owner === c).length >= MAX_ARMIES || w.nextArmyId >= Number.MAX_SAFE_INTEGER) return 'limitExceeded';
      // Optional atomic creation+assignment: no orphan formation on failure.
      if(p.unitIds!==undefined){
        const ids=p.unitIds;
        if(!Array.isArray(ids)||!ids.length||ids.length>MAX_ARMY_UNITS||
          new Set(ids).size!==ids.length||
          !ids.every(id=>Number.isSafeInteger(id)&&id>0))return 'badParams';
        if(ids.some(id=>!w.units.some(u=>u.id===id&&u.owner===c&&!u.destroyed)))
          return 'notYourUnit';
      }
      return null;
    },
    apply(w,p,issuer) {
      const c=actorCountry(w,issuer)!;
      const name=p.name===undefined
        ? nextFormationName('army',w.armies.filter(a=>a.owner===c).map(a=>a.name))
        : p.name as string;
      const id=w.nextArmyId++;
      w.armies.push({id,owner:c,name,color:p.color as string,groupId:null});
      if(Array.isArray(p.unitIds)){
        const ids=new Set(p.unitIds as number[]);
        for(const u of w.units)if(ids.has(u.id))u.armyId=id;
      }
    },
  });
  registerCommand('createArmyGroup', {
    validate(w,p,issuer) {
      const c = actorCountry(w,issuer);
      if (c === null || !w.countries.alive[c] || issuer === 'frontai') return 'badIssuer';
      if ((p.name!==undefined&&!validName(p.name)) || !validColor(p.color)) return 'badParams';
      if (w.armyGroups.filter(a => a.owner === c).length >= MAX_GROUPS || w.nextArmyGroupId >= Number.MAX_SAFE_INTEGER) return 'limitExceeded';
      if(p.armyIds!==undefined){
        const ids=p.armyIds;
        if(!Array.isArray(ids)||!ids.length||ids.length>MAX_GROUP_ARMIES||
          new Set(ids).size!==ids.length||
          !ids.every(id=>Number.isSafeInteger(id)&&id>0))return 'badParams';
        if(ids.some(id=>!w.armies.some(a=>a.id===id&&a.owner===c)))
          return 'notYourArmy';
      }
      return null;
    },
    apply(w,p,issuer) {
      const c=actorCountry(w,issuer)!;
      const name=p.name===undefined
        ? nextFormationName('group',w.armyGroups.filter(a=>a.owner===c).map(a=>a.name))
        : p.name as string;
      const id=w.nextArmyGroupId++;
      w.armyGroups.push({id,owner:c,name,color:p.color as string});
      if(Array.isArray(p.armyIds)){
        const ids=new Set(p.armyIds as number[]);
        for(const a of w.armies)if(ids.has(a.id))a.groupId=id;
      }
    },
  });
  registerCommand('renameFormation', {
    validate(w,p,issuer){
      const c=actorCountry(w,issuer);
      if(c===null||!w.countries.alive[c]||issuer==='frontai')return 'badIssuer';
      if((p.kind!=='army'&&p.kind!=='group')||!Number.isSafeInteger(p.id)||
        !validName(p.name))return 'badParams';
      const formations=p.kind==='army'?w.armies:w.armyGroups;
      return formations.some(f=>f.id===p.id&&f.owner===c)?null:'notYourArmy';
    },
    apply(w,p){
      const formations=p.kind==='army'?w.armies:w.armyGroups;
      const formation=formations.find(f=>f.id===p.id)!;
      formation.name=p.name as string;
    },
  });
  registerCommand('setArmyReinforcementPriority', {
    validate(w,p,issuer){
      const c=actorCountry(w,issuer);
      if(c===null||!w.countries.alive[c]||issuer==='frontai')return 'badIssuer';
      if(!Number.isInteger(p.priority)||(p.priority as number)<0||(p.priority as number)>9)return 'badParams';
      return w.armies.some(a=>a.id===p.armyId&&a.owner===c)?null:'notYourArmy';
    },
    apply(w,p){
      const a=w.armies.find(a=>a.id===p.armyId)!;
      a.reinforcementPriority=p.priority as number;
    },
  });

  registerCommand('assignArmy', {
    validate(w,p,issuer) {
      const c = actorCountry(w,issuer), ids = p.unitIds;
      if (c === null || !w.countries.alive[c] || issuer === 'frontai') return 'badIssuer';
      if (!Array.isArray(ids) || !ids.length || ids.length > 256 || new Set(ids).size !== ids.length) return 'badParams';
      if (p.armyId !== null && !w.armies.some(a => a.id === p.armyId && a.owner === c)) return 'notYourArmy';
      for (const id of ids) if (!w.units.some(u => u.id === id && !u.destroyed && u.owner === c)) return 'notYourUnit';
      const count = w.units.filter(u => !u.destroyed && u.armyId === p.armyId && !ids.includes(u.id)).length;
      if (p.armyId !== null && count + ids.length > MAX_ARMY_UNITS) return 'limitExceeded';
      return null;
    },
    apply(w,p) { const ids = new Set(p.unitIds as number[]); for (const u of w.units) if (ids.has(u.id)) u.armyId = p.armyId as number | null; },
  });
  registerCommand('assignArmyGroup', {
    validate(w,p,issuer) {
      const c = actorCountry(w,issuer), ids = p.armyIds;
      if (c === null || !w.countries.alive[c] || issuer === 'frontai') return 'badIssuer';
      if (!Array.isArray(ids) || !ids.length || ids.length > MAX_ARMIES || new Set(ids).size !== ids.length) return 'badParams';
      if (p.groupId !== null && !w.armyGroups.some(g => g.id === p.groupId && g.owner === c)) return 'notYourArmy';
      for (const id of ids) if (!w.armies.some(a => a.id === id && a.owner === c)) return 'notYourArmy';
      if (p.groupId !== null && w.armies.filter(a => a.groupId === p.groupId && !ids.includes(a.id)).length + ids.length > MAX_GROUP_ARMIES) return 'limitExceeded';
      return null;
    },
    apply(w,p) { const ids = new Set(p.armyIds as number[]); for (const a of w.armies) if (ids.has(a.id)) a.groupId = p.groupId as number | null; },
  });
  registerCommand('deleteArmy', {
    validate(w,p,issuer) {
      const c = actorCountry(w,issuer);
      if (c === null || !w.countries.alive[c] || issuer === 'frontai') return 'badIssuer';
      if (!w.armies.some(a => a.id === p.id && a.owner === c)) return 'notYourArmy';
      return w.units.some(u => u.armyId === p.id) ? 'armyNotEmpty' : null;
    },
    apply(w,p) { const a=w.armies.find(a=>a.id===p.id)!;releaseCommander(w,a.commanderId??-1);w.armies = w.armies.filter(a => a.id !== p.id); },
  });
  registerCommand('deleteArmyGroup', {
    validate(w,p,issuer) {
      const c = actorCountry(w,issuer);
      if (c === null || !w.countries.alive[c] || issuer === 'frontai') return 'badIssuer';
      if (!w.armyGroups.some(a => a.id === p.id && a.owner === c)) return 'notYourArmy';
      return w.armies.some(a => a.groupId === p.id) ? 'armyNotEmpty' : null;
    },
    apply(w,p) { const g=w.armyGroups.find(a=>a.id===p.id)!;releaseCommander(w,g.commanderId??-1);w.armyGroups = w.armyGroups.filter(a => a.id !== p.id); },
  });

  registerCommand('declareWar', {
    validate(w, p, issuer) {
      const defender = p.defender as number;
      const country = actorCountry(w, issuer);
      if (!Number.isInteger(defender)) return 'badParams';
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'badIssuer';
      if (country === defender) return 'selfWar';
      if (defender < 0 || defender >= w.countries.count || !w.countries.alive[defender]) return 'targetDead';
      if (atWar(w, country, defender)) return 'alreadyAtWar';
      // 同盟国への宣戦は却下（diplomacy-system仕様: 矛盾する状態は存在しない）
      if (isAllied(w, country, defender)) return 'allied';
      return null;
    },
    apply(w, p, issuer) {
      const defender = p.defender as number;
      const country = actorCountry(w, issuer)!;
      const cb = w.claims.some((cl) => cl.country === country && w.prov.owner[cl.province] === defender);
      startWar(w, country, defender, cb);
      addAlert(w, {
        kind: 'warDeclared', priority: 8,
        msgKey: 'alert.warDeclared',
        params: {
          aggressor: w.countries.nameJa[country] || w.countries.nameEn[country],
          defender: w.countries.nameJa[defender] || w.countries.nameEn[defender],
          cb: cb ? 'yes' : 'no',
        },
        actor: country, target: defender,
      });
      void issuer;
    },
  });

  registerCommand('proposePeace', {
    validate(w, p, issuer) {
      const warId = p.warId as number;
      const country = actorCountry(w, issuer);
      const war = w.wars.find((x) => x.id === warId);
      if (!war || war.status === 'ended') return 'noWar';
      if (country === null) return 'badIssuer';
      if (war.aggressor !== country && war.defender !== country) return 'notParticipant';
      if (war.status === 'peaceOffered') return 'alreadyOffered';
      // 講和要求（phase4-peace-conference）: 占領現状に整合する州のみ
      if (Array.isArray(p.demands)) {
        for (const d of p.demands as number[]) {
          if (!Number.isInteger(d) || d < 0 || d >= w.prov.count) return 'badParams';
        }
        const { valid, invalid } = validateDemands(w, war, country, p.demands as number[]);
        if (invalid.length > 0) return 'invalidDemand:' + invalid.join(',');
        void valid;
      }
      return null;
    },
    apply(w, p, issuer) {
      const warId = p.warId as number;
      const country = actorCountry(w, issuer)!;
      const war = w.wars.find((x) => x.id === warId)!;
      const other = war.aggressor === country ? war.defender : war.aggressor;
      const nameOf = (c: number) => w.countries.nameJa[c] || w.countries.nameEn[c];
      const demands = Array.isArray(p.demands) ? validateDemands(w, war, country, p.demands as number[]).valid : [];
      const type = demands.length > 0 ? ('demand' as const) : (p.type === 'demand' ? ('demand' as const) : ('white' as const));
      if (other === w.playerCountry) {
        // プレイヤー側に提示 → 受諾待ち（要求州を保存して講和会議UIへ）
        war.status = 'peaceOffered';
        war.offeredBy = country;
        war.offerType = type;
        war.offerDemands = demands.slice().sort((a, b) => a - b);
        addAlert(w, {
          kind: 'peaceOffered', priority: 9, msgKey: 'alert.peaceOffered',
          params: { from: nameOf(country), type, demands: String(war.offerDemands.length) }, actor: country, target: other,
        });
      } else {
        // AI側が即時判断（phase4-peace-conference: 要求価値とwarScoreで決定論判断）
        if (demands.length > 0) {
          const decision = aiEvaluatePeace(w, war, country, other, demands);
          const options = ['accept', 'decline'];
          logDiplomacyDecision(w, other, 'peace-demand', options, [1, -1],
            decision.accept ? 'accept' : 'decline', decision.reason);
          if (decision.accept) {
            endWar(w, war, 'demand', demands);
            addAlert(w, { kind: 'peaceAccepted', priority: 6, msgKey: 'alert.peaceAccepted', params: { war: String(war.id), type: 'demand', demands: String(demands.length) } });
          } else {
            addAlert(w, { kind: 'peaceDeclined', priority: 4, msgKey: 'alert.peaceDeclined', params: { from: nameOf(other) }, actor: other });
          }
        } else {
          const otherScore = warScoreFor(w, war, other);
          const longWar = w.tick - war.startTick > 360;
          const accept = type === 'demand' ? otherScore < -30 || longWar : otherScore < 20 || longWar;
          logDiplomacyDecision(w, other, 'peace', ['accept', 'decline'], [accept ? 1 : -1, accept ? -1 : 1],
            accept ? 'accept' : 'decline', 'warScore=' + otherScore + (longWar ? ' 長期戦' : ''));
          if (accept) {
            endWar(w, war, type);
            addAlert(w, { kind: 'peaceAccepted', priority: 6, msgKey: 'alert.peaceAccepted', params: { war: String(war.id), type } });
          } else {
            addAlert(w, { kind: 'peaceDeclined', priority: 4, msgKey: 'alert.peaceDeclined', params: { from: nameOf(other) }, actor: other });
          }
        }
      }
      void issuer;
    },
  });

  registerCommand('acceptPeace', {
    validate(w, p, issuer) {
      const warId = p.warId as number;
      const country = actorCountry(w, issuer);
      const war = w.wars.find((x) => x.id === warId);
      if (!war) return 'noWar';
      if (war.status !== 'peaceOffered') return 'notOffered';
      if (country === null) return 'badIssuer';
      if (war.offeredBy === country) return 'ownOffer';
      if (war.aggressor !== country && war.defender !== country) return 'notParticipant';
      return null;
    },
    apply(w, p) {
      const war = w.wars.find((x) => x.id === p.warId)!;
      const demands = war.offerDemands ?? [];
      endWar(w, war, war.offerType === 'demand' ? 'demand' : 'white', demands);
      addAlert(w, { kind: 'peaceAccepted', priority: 6, msgKey: 'alert.peaceAccepted', params: { war: String(war.id), type: war.offerType === 'demand' ? 'demand' : 'white', demands: String(demands.length) } });
    },
  });

  registerCommand('declinePeace', {
    validate(w, p, issuer) {
      const warId = p.warId as number;
      const country = actorCountry(w, issuer);
      const war = w.wars.find((x) => x.id === warId);
      if (!war) return 'noWar';
      if (war.status !== 'peaceOffered') return 'notOffered';
      if (country === null) return 'badIssuer';
      if (war.offeredBy === country) return 'ownOffer';
      if (war.aggressor !== country && war.defender !== country) return 'notParticipant';
      return null;
    },
    apply(w, p) {
      const war = w.wars.find((x) => x.id === p.warId)!;
      const proposer = war.offeredBy;
      war.status = 'active';
      war.offeredBy = -1;
      war.offerDemands = [];
      addAlert(w, {
        kind: 'peaceDeclined', priority: 4, msgKey: 'alert.peaceDeclined',
        params: { from: proposer >= 0 ? w.countries.nameJa[proposer] || w.countries.nameEn[proposer] : '' },
      });
    },
  });

  // ── phase4-diplomacy-treaties: 条約コマンド ──

  registerCommand('proposeTreaty', {
    validate(w, p, issuer) {
      const target = p.target as number;
      const type = p.type as string;
      const country = actorCountry(w, issuer);
      if (country === null) return 'badIssuer';
      if (!w.countries.alive[country]) return 'countryDead';
      if (!Number.isInteger(target) || target < 0 || target >= w.countries.count || !w.countries.alive[target]) return 'badTarget';
      if (target === country) return 'badTarget';
      if (!TREATY_TYPES.includes(type as TreatyType)) return 'badParams';
      if (atWar(w, country, target)) return 'atWar';
      if (activeTreatyBetween(w, country, target, type as TreatyType)) return 'alreadyActive';
      if (proposedTreatyBetween(w, country, target, type as TreatyType)) return 'alreadyProposed';
      return null;
    },
    apply(w, p, issuer) {
      const target = p.target as number;
      const type = p.type as TreatyType;
      const country = actorCountry(w, issuer)!;
      const nameOf = (c: number) => w.countries.nameJa[c] || w.countries.nameEn[c];
      if (target === w.playerCountry) {
        // プレイヤー宛 → 受諾待ち（proposed状態で保存）
        w.treaties.push({
          id: w.nextTreatyId++,
          type,
          a: Math.min(country, target),
          b: Math.max(country, target),
          startTick: w.tick,
          expiryTick: w.tick + TREATY_DURATION_DAYS,
          status: 'proposed',
          proposer: country,
        });
        addAlert(w, {
          kind: 'treatyOffered', priority: 6, msgKey: 'alert.treatyOffered',
          params: { from: nameOf(country), type }, actor: country, target,
        });
      } else {
        // AI宛 → 即時判断（決定論RNG・decisionLog記録）
        const decision = aiEvaluateTreaty(w, target, country, type);
        logDiplomacyDecision(w, target, 'treaty', ['accept', 'decline'], [decision.score, -decision.score],
          decision.accept ? 'accept' : 'decline', decision.reason);
        if (decision.accept) {
          w.treaties.push({
            id: w.nextTreatyId++,
            type,
            a: Math.min(country, target),
            b: Math.max(country, target),
            startTick: w.tick,
            expiryTick: w.tick + TREATY_DURATION_DAYS,
            status: 'active',
            proposer: country,
          });
          addAlert(w, {
            kind: 'treatyAccepted', priority: 4, msgKey: 'alert.treatyAccepted',
            params: { a: nameOf(country), b: nameOf(target), type }, actor: country, target,
          });
        } else {
          addAlert(w, {
            kind: 'treatyDeclined', priority: 3, msgKey: 'alert.treatyDeclined',
            params: { from: nameOf(target), type }, actor: target,
          });
        }
      }
      void issuer;
    },
  });

  registerCommand('acceptTreaty', {
    validate(w, p, issuer) {
      const treaty = w.treaties.find((t) => t.id === p.treatyId as number);
      const country = actorCountry(w, issuer);
      if (!treaty) return 'noTreaty';
      if (treaty.status !== 'proposed') return 'notProposed';
      if (country === null) return 'badIssuer';
      if (treaty.proposer === country) return 'ownOffer';
      if (treaty.a !== country && treaty.b !== country) return 'notParticipant';
      return null;
    },
    apply(w, p) {
      const treaty = w.treaties.find((t) => t.id === p.treatyId as number)!;
      treaty.status = 'active';
      addAlert(w, {
        kind: 'treatyAccepted', priority: 4, msgKey: 'alert.treatyAccepted',
        params: {
          a: w.countries.nameJa[treaty.a] || w.countries.nameEn[treaty.a],
          b: w.countries.nameJa[treaty.b] || w.countries.nameEn[treaty.b],
          type: treaty.type,
        },
        actor: treaty.a, target: treaty.b,
      });
    },
  });

  registerCommand('declineTreaty', {
    validate(w, p, issuer) {
      const treaty = w.treaties.find((t) => t.id === p.treatyId as number);
      const country = actorCountry(w, issuer);
      if (!treaty) return 'noTreaty';
      if (treaty.status !== 'proposed') return 'notProposed';
      if (country === null) return 'badIssuer';
      if (treaty.proposer === country) return 'ownOffer';
      if (treaty.a !== country && treaty.b !== country) return 'notParticipant';
      return null;
    },
    apply(w, p) {
      const treaty = w.treaties.find((t) => t.id === p.treatyId as number)!;
      treaty.status = 'annulled';
      addAlert(w, {
        kind: 'treatyDeclined', priority: 3, msgKey: 'alert.treatyDeclined',
        params: {
          from: w.countries.nameJa[treaty.b] || w.countries.nameEn[treaty.b],
          type: treaty.type,
        },
        actor: treaty.b,
      });
    },
  });

  registerCommand('annulTreaty', {
    validate(w, p, issuer) {
      const treaty = w.treaties.find((t) => t.id === p.treatyId as number);
      const country = actorCountry(w, issuer);
      if (!treaty) return 'noTreaty';
      if (treaty.status !== 'active') return 'notActive';
      if (country === null) return 'badIssuer';
      if (treaty.a !== country && treaty.b !== country) return 'notParticipant';
      return null;
    },
    apply(w, p, issuer) {
      const treaty = w.treaties.find((t) => t.id === p.treatyId as number)!;
      const country = actorCountry(w, issuer)!;
      const other = treaty.a === country ? treaty.b : treaty.a;
      // 一方的な破棄は関係値に小さな負の影響
      applyRelationDelta(w, country, other, -5);
      annulTreaty(w, treaty, 'annulled');
    },
  });
}

export { aiCmd };
