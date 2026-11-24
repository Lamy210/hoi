import {expect,test} from '@playwright/test';
import fs from 'node:fs';
import ts from 'typescript';

test('旧シナリオに港を捏造せず、港表示切替は無効',async({page})=>{
  await page.goto('/hoi/');
  await page.getByTestId('btn-new-game').click();
  await page.getByTestId('btn-to-country').click();
  await page.getByTestId('country-KOR').click();
  await page.getByTestId('btn-start').click();
  await expect(page.getByTestId('map')).toBeVisible();
  await expect(page.getByTestId('map-port-visibility')).toBeDisabled();
  await expect(page.getByTestId('map-port-visibility')).toContainText('(0)');
  await expect(page.getByTestId('port-directory')).toHaveCount(0);
  await expect(page.locator('[data-port-id]')).toHaveCount(0);
});

test('港マーカーは投影位置と選択を保持し、廃止された港だけを削除する',async({page})=>{
  await page.goto('/hoi/');
  // E2E runs against Vite preview (built output): raw /src TS modules
  // cannot be imported there. Compile the *real production source* in the
  // test process and exercise its DOM API in the browser instead.
  const source=fs.readFileSync('src/ui/maprender/portOverlay.ts','utf8')
    .replace(/^import type .*;\s*$/gm,'')
    .replace('export function createPortOverlay(','function createPortOverlay(');
  const browserJs=ts.transpileModule(source,{
    compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.None},
  }).outputText;
  await page.addScriptTag({content:browserJs+'\nwindow.__testCreatePortOverlay=createPortOverlay;'});
  await page.evaluate(()=>{
    const createPortOverlay=(window as typeof window&{
      __testCreatePortOverlay:(container:HTMLElement,project:(p:number)=>[number,number])=>{
        set:(markers:any[],cb:(province:number)=>void)=>void;
        dispose:()=>void;
      }
    }).__testCreatePortOverlay;
    const container=document.createElement('div');
    container.dataset.testid='synthetic-port-container';
    container.style.cssText='position:fixed;left:10px;top:120px;width:400px;height:280px;background:#233044;z-index:99999';
    document.body.appendChild(container);
    const map=createPortOverlay(container,(p:number)=>{
      if(p===1)return [65,95];
      if(p===2)return [220,145];
      return [Number.NaN,Number.NaN];
    });
    map.set([
      {id:'fictional-harbor-1',province:1,label:'架空港1',capacity:12,selected:false,controlledByPlayer:true},
      {id:'fictional-harbor-2',province:2,label:'架空港2',capacity:5,selected:false,controlledByPlayer:false},
    ],(p:number)=>container.dataset.selected=String(p));
    (window as typeof window & {__syntheticPorts?:typeof map}).__syntheticPorts=map;
  });
  const root=page.getByTestId('synthetic-port-container');
  await expect(page.getByTestId('port-marker-fictional-harbor-1')).toBeVisible();
  await expect(page.getByTestId('port-marker-fictional-harbor-1')).toHaveCSS('left','65px');
  await expect(page.getByTestId('port-marker-fictional-harbor-2')).toHaveCSS('top','145px');
  await page.getByTestId('port-marker-fictional-harbor-1').click();
  await expect(root).toHaveAttribute('data-selected','1');
  await page.evaluate(()=>{
    const map=(window as typeof window & {__syntheticPorts?:{set:(items:any[],cb:(p:number)=>void)=>void;dispose:()=>void}}).__syntheticPorts!;
    const container=document.querySelector<HTMLElement>('[data-testid="synthetic-port-container"]')!;
    map.set([{id:'fictional-harbor-2',province:2,label:'架空港2',capacity:7,selected:true,controlledByPlayer:true}],
      (p:number)=>container.dataset.selected=String(p));
  });
  await expect(page.getByTestId('port-marker-fictional-harbor-1')).toHaveCount(0);
  await expect(page.getByTestId('port-marker-fictional-harbor-2')).toHaveAttribute('aria-pressed','true');
  await expect(page.getByTestId('port-marker-fictional-harbor-2')).toHaveAttribute('data-capacity','7');
  await page.getByTestId('port-marker-fictional-harbor-2').click();
  await expect(root).toHaveAttribute('data-selected','2');
});
