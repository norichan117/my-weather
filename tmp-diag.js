const { chromium } = require('/workspace/tool-results/_build/node_modules/playwright');
(async()=>{
 const b = await chromium.launch({executablePath:'/workspace/tool-results/_build/chromium/chrome-linux/chrome',
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'], env:Object.assign({},process.env,{LD_LIBRARY_PATH:'/workspace/tool-results/_build/libroot/usr/lib/x86_64-linux-gnu:/workspace/tool-results/_build/libs/root/usr/lib/x86_64-linux-gnu'})});
 const p = await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await p.goto('http://127.0.0.1:8899/index.html?cb='+Date.now(),{waitUntil:'load'});
 await p.waitForTimeout(3500);
 await p.tap('.card[data-id="home"]'); await p.waitForTimeout(600);
 const info = await p.evaluate(()=>{
   const day = document.querySelector('.day');
   const cs = day ? getComputedStyle(day) : null;
   const cells = day ? Array.from(day.children).map(c=>({cls:c.className, w:c.getBoundingClientRect().width, h:c.getBoundingClientRect().height, txt:c.textContent.trim().slice(0,30)})) : [];
   const span = day ? day.querySelector('.d-t span') : null;
   return {cols: cs && cs.gridTemplateColumns, cells, dayW: day && day.getBoundingClientRect().width,
     spanStyle: span && {ws:getComputedStyle(span).whiteSpace, ov:getComputedStyle(span).overflow, f:getComputedStyle(span).fontFamily}};
 });
 console.log(JSON.stringify(info,null,1));
 const em = await p.evaluate(()=>{ const e=document.querySelector('.metrics .emoji'); return e?{fam:getComputedStyle(e).fontFamily, w:e.getBoundingClientRect().width}:null; });
 console.log('emoji span', JSON.stringify(em));
 const more = await p.evaluate(()=>{
   const day=document.querySelector('.day'); const t=day.querySelector('.d-t');
   const b=t.querySelector('b'), sp=t.querySelector('.d-t span');
   return {bH:b.getBoundingClientRect().height, spH:sp.getBoundingClientRect().height, spW:sp.getBoundingClientRect().width,
     spLines: sp.getClientRects().length, inner: sp.innerHTML.slice(0,200)};
 });
 console.log(JSON.stringify(more));
 await p.screenshot({path:'/workspace/weather-app/screenshots/diag-day.png'});
 await p.evaluate(()=>document.querySelector('#detailSheet .sheet-body').scrollTop=300);
 await p.waitForTimeout(200);
 await p.screenshot({path:'/workspace/weather-app/screenshots/diag-day2.png'});
 await b.close();
})();
