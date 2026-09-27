const run=require('./harness');
run(async(pg)=>{
 await pg.evaluate(()=>window.ready);
 await pg.waitForTimeout(100);
 const r=await pg.evaluate(async()=>{await PLUGIN.openTracker();return {ribbon:!!window.RIBBON, items:LAST_MODAL.rendered, cmds:PLUGIN.cmds.map(c=>c.id)}});
 console.log(JSON.stringify(r,null,1));
 const y=await pg.evaluate(async()=>{PLUGIN.openCreateTracker();const m=LAST_MODAL;m.tag='home';await m.create();return {tags:PLUGIN.settings.taskTag, base:VAULT_CREATE[0].p, yaml:VAULT_CREATE[0].c.slice(0,260), sample:FMS[VAULT_CREATE[1].p].tags}});
 console.log(JSON.stringify(y,null,1));
});
