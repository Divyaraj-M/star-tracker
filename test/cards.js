const run=require('./harness');
run(async(pg)=>{
 await pg.evaluate(()=>window.ready);
 const chips=async()=>pg.$$eval('.base-board-card',e=>e.filter(c=>c.dataset.filePath).slice(0,3).map(c=>c.dataset.filePath.slice(0,5)+': '+[...c.querySelectorAll('.base-board-chip-label')].map(x=>x.textContent).join(',')).join(' | '));
 await pg.evaluate(()=>mount('star-board',{groupBy:{property:'note.status'},order:['file.name']}));await pg.waitForTimeout(300);
 console.log('no view props ->',await chips());
 await pg.evaluate(()=>mount('star-board',{groupBy:{property:'note.status'},order:['file.name','note.area']}));await pg.waitForTimeout(300);
 console.log('view props ->',await chips());
 await pg.evaluate(async()=>{PLUGIN.settings.cardFieldsOverride=true;PLUGIN.settings.cardShowEpic=false;PLUGIN.settings.cardFields=['points','owner'];await PLUGIN.saveSettings();mount('star-board',{groupBy:{property:'note.status'},order:['file.name','note.area']});});await pg.waitForTimeout(300);
 console.log('override ->',await chips());
});
