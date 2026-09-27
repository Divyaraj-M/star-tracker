const run=require('./harness');
run(async(pg)=>{
 await pg.evaluate(()=>window.ready);
 const colColor=()=>pg.$$eval('.base-board-column',e=>e.slice(0,2).map(c=>c.dataset.columnName+'='+(c.getAttribute('style')||'')).join(' | '));
 await pg.evaluate(()=>mount('star-board',{groupBy:{property:'note.status'},order:['file.name']}));await pg.waitForTimeout(300);
 console.log('main settings:',await colColor());
 await pg.evaluate(async()=>{const s=PLUGIN.settings;const {profileFrom}={profileFrom:(x)=>{const c=structuredClone(x);delete c.profiles;delete c.columnConfigs;delete c.showRibbon;return c}};
   const p=profileFrom(s);p.statuses[0].color='#000000';p.cardFields=['owner'];p.cardShowPriority=false;s.profiles['Work/Work.base']=p;await PLUGIN.saveSettings();
   window.HOST_BASE='Work/Work.base';mount('star-board',{groupBy:{property:'note.status'},order:['file.name']});});
 await pg.waitForTimeout(300);
 console.log('work profile:',await colColor());
 console.log('work chips:',await pg.$$eval('.base-board-card',e=>e.filter(c=>c.dataset.filePath).slice(0,2).map(c=>[...c.querySelectorAll('.base-board-chip-label')].map(x=>x.textContent).join(',')).join(' | ')));
 const t=await pg.evaluate(()=>{const tab=PLUGIN.tab;tab.display();const main=tab.containerEl.querySelectorAll('.setting-item').length;tab.editing='Work/Work.base';tab.display();return {main,work:tab.containerEl.querySelectorAll('.setting-item').length,firstNames:[...tab.containerEl.querySelectorAll('.setting-item-name')].slice(0,5).map(x=>x.textContent)}});
 console.log('settings tab:',JSON.stringify(t));
 const tagCheck=await pg.evaluate(()=>{PLUGIN.settings.profiles['Work/Work.base'].taskTag='work';return PLUGIN.allModels().map(m=>m.taskTags().join('/'))});
 console.log('models tags:',tagCheck);
});
