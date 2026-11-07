const { chromium } = require('playwright');
const path = require('path');
(async()=>{
 const br=await chromium.launch({...(process.env.CHROMIUM ? { executablePath: process.env.CHROMIUM } : {})});
 const p=await br.newPage();
 await p.goto('file://'+path.resolve('docs/manual/index.html'),{waitUntil:'networkidle'});
 await p.pdf({path:'public/manual.pdf', format:'A4', printBackground:true, preferCSSPageSize:true,
   displayHeaderFooter:true, headerTemplate:'<div></div>',
   footerTemplate:'<div style="font-family:Inter,sans-serif;font-size:7px;color:#64748b;width:100%;padding:0 15mm;display:flex;justify-content:space-between"><span>Manual del operario · Gestión de Racks · noviembre 2026</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>',
   margin:{top:'16mm',bottom:'16mm',left:'15mm',right:'15mm'}});
 await br.close();
})();
