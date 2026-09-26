const { chromium } = require(require('child_process').execSync('npm root -g').toString().trim()+'/playwright');
const fs=require('fs');const path=require('path');
const main=fs.readFileSync(path.join(__dirname,'../main.js'),'utf8');const css=fs.readFileSync(path.join(__dirname,'../styles.css'),'utf8');
const mock = fs.readFileSync(path.join(__dirname,'mock.js'),'utf8');
const html=`<html><head><meta charset="utf-8"><style>
body{margin:0;background:#1e1e1e;color:#dcddde;font-family:system-ui,sans-serif;font-size:14px;
--text-normal:#dcddde;--text-muted:#999;--text-faint:#777;--text-accent:#a78bfa;--text-on-accent:#fff;--interactive-accent:#7c3aed;
--background-primary:#1e1e1e;--background-secondary:#262626;--background-modifier-border:#3a3a3a;--background-modifier-border-hover:#555;--background-modifier-hover:#333;
--font-ui-small:13px;--font-ui-smaller:12px;--font-monospace:monospace}
#host{height:760px} button{background:#333;color:#ddd;border:1px solid #444;border-radius:6px;padding:4px 10px} button.mod-cta{background:#7c3aed}
${css}</style></head><body><div id="host"></div>
<script>${mock}</script>
<script>const module={exports:{}};const exports=module.exports;const require=()=>window.OBS;(function(){${main}})();window.PluginClass=module.exports.default;</script>
<script>${fs.readFileSync(path.join(__dirname,'scenario.js'),'utf8')}</script>
</body></html>`;
fs.writeFileSync(path.join(__dirname,'page.html'),html);
module.exports = async function run(fn){
  const b=await chromium.launch();const pg=await b.newPage({viewport:{width:1500,height:800}});const errs=[];
  pg.on('pageerror',e=>errs.push(e.message));pg.on('console',m=>{if(m.type()==='error')errs.push(m.text())});
  await pg.goto('file://'+path.join(__dirname,'page.html'));await pg.waitForTimeout(300);
  try{await fn(pg);}finally{console.log('errors:',errs);await b.close();}
};
