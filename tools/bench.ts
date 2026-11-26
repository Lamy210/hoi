// npm run bench -- --iterations 5 --warmup 1 --format json
// Workload: synthetic 256 assigned divisions and 64 targets, on 110 real
// East Asia provinces. Results depend on hardware and runtime conditions.
import {runGarrisonBench,type GarrisonWorkload} from './garrisonBenchmark';

function integerArg(args:string[],name:string,fallback:number):number {
  const index=args.indexOf(name);
  if(index<0)return fallback;
  const raw=args[index+1];
  const value=Number(raw);
  if(!raw||!Number.isSafeInteger(value))throw new Error(name+' requires an integer');
  return value;
}

async function main():Promise<void>{
  const args=process.argv.slice(2);
  const allowed=new Set(['--iterations','--warmup','--units','--targets','--pattern','--format']);
  for(let i=0;i<args.length;i+=2){
    if(!allowed.has(args[i])||i+1>=args.length)throw new Error('unknown or incomplete option '+args[i]);
  }
  const iterations=integerArg(args,'--iterations',7);
  const warmup=integerArg(args,'--warmup',2);
  const units=integerArg(args,'--units',256);
  const targets=integerArg(args,'--targets',64);
  const patternIndex=args.indexOf('--pattern');
  const pattern=patternIndex<0?'all':args[patternIndex+1];
  const formatIndex=args.indexOf('--format');
  const format=formatIndex<0?'text':args[formatIndex+1];
  if(!['all','stacked','distributed'].includes(pattern))throw new Error('invalid --pattern');
  if(!['text','json'].includes(format))throw new Error('invalid --format');
  const workloads:GarrisonWorkload[]=pattern==='all'?['stacked','distributed']:[pattern as GarrisonWorkload];
  const results=[];
  for(const workload of workloads){
    results.push(await runGarrisonBench({workload,iterations,warmup,units,targets}));
  }
  if(format==='json'){
    process.stdout.write(JSON.stringify({kind:'garrison-benchmark-v1',results},null,2)+'\n');
    return;
  }
  console.log('Garrison planner benchmark (synthetic control; actual pack province graph)');
  console.log('The timings include ranking, route searches, and assignment; hardware/GC dependent.');
  for(const r of results){
    console.log([r.workload,r.units+' divisions',r.targets+' targets',
      'p50='+r.p50Ms.toFixed(2)+'ms','p95='+r.p95Ms.toFixed(2)+'ms',
      'lookups='+r.routeRequests,'searches='+r.pathSearches,'hits='+r.cacheHits,
      'unreachable='+r.unreachableSearches,'disconnected='+r.disconnectedSkips,
      'moves='+r.plannedMoves,
      'heapDelta='+r.heapDeltaKiB.toFixed(0)+'KiB (GC-sensitive)'].join(' | '));
  }
}

main().catch(error=>{console.error(error);process.exitCode=1;});
