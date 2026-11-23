/** New standalone save format (v19). Old v18 saves are explicitly unsupported.
 * Hashes/checksum detect corruption but are not cryptographic authentication.
 */
import {encode,decode} from '@msgpack/msgpack';
import {assertStrategyState,type StrategyState} from './model';

export const STRATEGY_SAVE_VERSION=19;
export interface StrategySave {header:{schema:'orbis-strategy';version:19;tick:number};state:StrategyState;checksum:number;}
export function strategyChecksum(bytes:Uint8Array):number{
  let h=0x811c9dc5;
  for(const b of bytes){h^=b;h=Math.imul(h,0x01000193);}
  return h>>>0;
}
export function strategyHash(state:StrategyState):number{
  assertStrategyState(state);
  return strategyChecksum(encode(state));
}
export function saveStrategy(state:StrategyState):Uint8Array{
  assertStrategyState(state);
  const header={schema:'orbis-strategy' as const,version:STRATEGY_SAVE_VERSION,tick:state.tick};
  const payload=encode({header,state});
  return encode({header,state,checksum:strategyChecksum(payload)});
}
export function loadStrategy(bytes:Uint8Array):{state:StrategyState|null;errors:string[]}{
  try{
    const data=decode(bytes) as StrategySave;
    if(!data||data.header?.schema!=='orbis-strategy'||data.header.version!==STRATEGY_SAVE_VERSION)
      return {state:null,errors:['unsupported save version']};
    if(data.header.tick!==data.state.tick)return {state:null,errors:['header tick mismatch']};
    const checksum=strategyChecksum(encode({header:data.header,state:data.state}));
    if(checksum!==data.checksum)return {state:null,errors:['payload checksum mismatch']};
    // No alternate encoding/stray entries: ensure a unique canonical byte layout.
    const canonical=encode(data);
    if(canonical.length!==bytes.length||canonical.some((b,i)=>b!==bytes[i]))
      return {state:null,errors:['noncanonical save']};
    assertStrategyState(data.state);
    return {state:data.state,errors:[]};
  }catch{
    return {state:null,errors:['invalid save']};
  }
}
