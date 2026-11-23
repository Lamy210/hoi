import {describe,expect,it} from 'vitest';
import {createTestEngine} from '../helpers';
import {applyCommands} from '../../src/engine/core/command';
import {startWar,endWar} from '../../src/engine/military/war';
import {frontView} from '../../src/ui/maprender/frontView';
import {hashWorld} from '../../src/engine/core/hash';

async function fixture(){
  const e=await createTestEngine(1,12,'KOR'),w=e.world,c=w.playerCountry,enemy=w.countries.id.indexOf('PRK');
  const from=w.prov.id.indexOf('KR-41'),to=w.prov.id.indexOf('KP-07');
  const war=startWar(w,c,enemy,false);
  const u=w.units.find(u=>u.owner===c)!;
  let seq=0;
  const issue=(type:string,p:Record<string,unknown>)=>applyCommands(w,[{issuer:'player',seq:++seq,type,p}])[0];
  expect(issue('createFront',{enemy,provinces:[from],targets:[to]}).ok).toBe(true);
  expect(issue('assignToFront',{frontId:1,units:[u.id]}).ok).toBe(true);
  expect(issue('setFrontStance',{frontId:1,stance:'attack',targets:[to]}).ok).toBe(true);
  return {e,w,c,enemy,from,to,u,war,issue};
}
describe('front map projection',()=>{
  it('projects only valid land links and explicit adjacent objectives without changing simulation state',async()=>{
    const {e,w,from,to,u}=await fixture();
    const before=hashWorld(w), snap=e.getUiSnapshot(0);
    const views=frontView(snap,[u.id],'selected');
    expect(views).toHaveLength(1);
    expect(views[0].highlighted).toBe(true);
    expect(views[0].links).toContainEqual({from,to});
    expect(views[0].arrows).toEqual([{from,to}]);
    expect(frontView(snap,[],'selected')).toEqual([]);
    expect(frontView(snap,[],'off')).toEqual([]);
    expect(hashWorld(w)).toBe(before);
  });
  it('retains paused objectives but removes arrows and hides ended wars',async()=>{
    const {e,w,u,to,war,issue}=await fixture();
    expect(issue('setFrontPaused',{frontId:1,paused:true}).ok).toBe(true);
    let view=frontView(e.getUiSnapshot(0),[u.id],'all')[0];
    expect(view.paused).toBe(true);
    expect(view.targets).toEqual([to]);
    expect(view.arrows).toEqual([]);
    endWar(w,war);
    const planned=frontView(e.getUiSnapshot(0),[u.id],'all');
    expect(planned).toHaveLength(1);
    expect(planned[0].planned).toBe(true);
    expect(planned[0].paused).toBe(true);
    expect(planned[0].arrows).toEqual([]);
  });
  it('removes obsolete targets and ownership-invalid front provinces from the view',async()=>{
    const {e,w,c,enemy,from,to,u}=await fixture();
    w.prov.controller[to]=c;
    let view=frontView(e.getUiSnapshot(0),[u.id],'all')[0];
    expect(view.targets).toEqual([]);
    expect(view.arrows).toEqual([]);
    w.prov.controller[from]=enemy;
    view=frontView(e.getUiSnapshot(0),[u.id],'all')[0];
    expect(view.provinces).toEqual([]);
    expect(view.links).toEqual([]);
  });
});
