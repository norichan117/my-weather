const { chromium } = require('/workspace/tool-results/_build/node_modules/playwright');
(async()=>{
 const b = await chromium.launch({executablePath:'/workspace/tool-results/_build/chromium/chrome-linux/chrome',
  args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu'], env:Object.assign({},process.env,{LD_LIBRARY_PATH:'/workspace/tool-results/_build/libroot/usr/lib/x86_64-linux-gnu:/workspace/tool-results/_build/libs/root/usr/lib/x86_64-linux-gnu'})});
 const p = await b.newPage({viewport:{width:390,height:844},deviceScaleFactor:2,isMobile:true,hasTouch:true});
 await p.goto('http://127.0.0.1:8899/index.html?cb='+Date.now(),{waitUntil:'load'});
 await p.waitForTimeout(3000);
 await p.tap('.card[data-id="home"]'); await p.waitForTimeout(500);
 const r = await p.evaluate(()=>{
  const sp=document.querySelector('.day .d-t span');
  const out={html:sp.outerHTML, rects:[]};
  const walk=(node)=>{ node.childNodes.forEach(n=>{ if(n.nodeType===3){ const rg=document.createRange(); rg.selectNodeContents(n);
      for(const rc of rg.getClientRects()) out.rects.push({t:n.textContent.slice(0,10),x:Math.round(rc.x),y:Math.round(rc.y),w:Math.round(rc.width),h:Math.round(rc.height)});
    } else if(n.nodeType===1){ const rc=n.getBoundingClientRect(); out.rects.push({el:n.tagName+'.'+n.className,x:Math.round(rc.x),y:Math.round(rc.y),w:Math.round(rc.width),h:Math.round(rc.height), disp:getComputedStyle(n).display, ws:getComputedStyle(n).whiteSpace}); walk(n);} }); };
  walk(sp);
  return out;
 });
 console.log(JSON.stringify(r,null,1));
 await b.close();
})();
