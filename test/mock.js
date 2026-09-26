// Minimal Obsidian API mock for headless rendering
(function(){
const P=HTMLElement.prototype;
function mk(tag,o,parent){const el=document.createElement(tag);o=typeof o==='string'?{cls:o}:(o||{});
 if(o.cls)el.className=Array.isArray(o.cls)?o.cls.join(' '):o.cls; if(o.text!=null)el.textContent=o.text; if(o.href)el.href=o.href; if(o.type)el.type=o.type;
 if(o.attr)for(const k in o.attr)el.setAttribute(k,o.attr[k]); parent.appendChild(el); return el;}
P.createDiv=function(o){return mk('div',o,this)};P.createSpan=function(o){return mk('span',o,this)};P.createEl=function(t,o){return mk(t,o,this)};
P.empty=function(){this.innerHTML=''};P.setText=function(t){this.textContent=t};P.addClass=function(...c){this.classList.add(...c)};
P.removeClass=function(...c){this.classList.remove(...c)};P.hasClass=function(c){return this.classList.contains(c)};P.toggleClass=function(c,v){this.classList.toggle(c,v)};
P.setAttr=function(k,v){this.setAttribute(k,v)};P.setAttrs=function(o){for(const k in o)this.setAttribute(k,o[k])};P.getAttr=function(k){return this.getAttribute(k)};P.toggle=function(v){this.style.display=v?'':'none'};P.show=function(){this.style.display=''};P.hide=function(){this.style.display='none'};P.isShown=function(){return this.style.display!=='none'};P.detach=function(){this.remove()};P.find=function(q){return this.querySelector(q)};P.findAll=function(q){return [...this.querySelectorAll(q)]};P.onClickEvent=function(f){this.addEventListener('click',f)};P.setCssProps=function(o){for(const k in o)this.style.setProperty(k,o[k])};P.setCssStyles=function(o){Object.assign(this.style,o)};
SVGElement.prototype.setText=function(t){this.textContent=t};
class TAbstractFile{constructor(p){this.path=p;this.name=p.split('/').pop();this.basename=this.name.replace(/\.md$/,'');}}
class TFile extends TAbstractFile{constructor(p){super(p);this.stat={mtime:Date.now()-Math.random()*9*864e5};this.extension='md'}}
class TFolder extends TAbstractFile{}
class Component{constructor(){this._c=[]} register(cb){this._c.push(cb)} registerEvent(){} load(){} unload(){this._c.forEach(f=>f())}}
class Plugin extends Component{constructor(){super();this.views={}} registerBasesView(id,r){this.views[id]=r} addSettingTab(t){this.tab=t} addCommand(c){(this.cmds=this.cmds||[]).push(c)}
 async loadData(){return window.SAVED||null} async saveData(d){window.SAVED_OUT=JSON.parse(JSON.stringify(d))}}
class BasesView extends Component{constructor(c){super();this.controller=c} async createFileForView(name,fn){const fm={};fn(fm);window.CREATED=(window.CREATED||[]).concat([{name,fm}]);}}
class Notice{constructor(m){window.NOTICES=(window.NOTICES||[]).concat([m])}}
function chain(extra){const o=new Proxy(extra||{},{get(t,k){if(k in t)return t[k];if(k==='inputEl')return (t.inputEl=document.createElement('input'));if(k==='buttonEl')return (t.buttonEl=document.createElement('button'));return (...a)=>{if(k==='onChange'||k==='onClick')t['_'+k]=a[0];return o;}}});return o;}
class Setting{constructor(el){this.settingEl=el.createDiv({cls:'setting-item'});this.nameEl=this.settingEl.createDiv({cls:'setting-item-name'});this.controlEl=this.settingEl.createDiv({cls:'setting-item-control'})}
 setName(n){this.nameEl.textContent=n;return this} setDesc(){return this} setHeading(){this.settingEl.classList.add('setting-item-heading');return this} setClass(c){this.settingEl.classList.add(c);return this}
 _add(kind,cb){const c=chain({kind});c.inputEl;this.controlEl.appendChild(document.createElement(kind==='button'?'button':'input'));cb(c);return this}
 addText(cb){return this._add('text',cb)} addToggle(cb){return this._add('toggle',cb)} addDropdown(cb){const c=chain({options:[],addOption(v,l){this.options.push(v);return c}});cb(c);return this}
 addColorPicker(cb){return this._add('color',cb)} addButton(cb){return this._add('button',cb)} addExtraButton(cb){return this._add('extra',cb)}}
class Modal{constructor(app){this.app=app;this.contentEl=document.createElement('div')} open(){window.LAST_MODAL=this;this.onOpen()} close(){this.onClose&&this.onClose()} setTitle(){return this}}
class PluginSettingTab{constructor(app,p){this.app=app;this.plugin=p;this.containerEl=document.createElement('div')}}
class Menu{addItem(f){f(chain());return this} addSeparator(){return this} showAtMouseEvent(){}}
function setIcon(el,name){el.textContent=name==='plus'?'+':name.includes('right')?'▸':name.includes('down')?'▾':''}
function normalizePath(p){return p.replace(/\/+/g,'/').replace(/^\/|\/$/g,'')}
class Value{constructor(v){this.v=v} toString(){return Array.isArray(this.v)?this.v.join(', '):String(this.v)} isTruthy(){return !!this.v&&!(Array.isArray(this.v)&&!this.v.length)} renderTo(el){el.textContent=this.toString()}}
class NullValue extends Value{constructor(){super(null)} toString(){return 'null'} isTruthy(){return false}}
class StringValue extends Value{} class NumberValue extends Value{} class BooleanValue extends Value{} class DateValue extends Value{} class LinkValue extends Value{}
class ListValue extends Value{length(){return this.v.length} get(i){const x=this.v[i];return x==null?new NullValue():new StringValue(x)}}
const Keymap={isModEvent:()=>false};const Platform={isMobile:false,isDesktop:true};
function setTooltip(el,t){el.title=t}
class ButtonComponent{constructor(el){this.buttonEl=el.createEl('button')} setButtonText(t){this.buttonEl.textContent=t;return this} onClick(f){this.buttonEl.onclick=f;return this} setCta(){return this} setWarning(){return this}}
class TextComponent{constructor(el){this.inputEl=el.createEl('input')} setValue(v){this.inputEl.value=v;return this} getValue(){return this.inputEl.value} onChange(f){return this} setPlaceholder(){return this}}
window.OBS={Value,NullValue,StringValue,NumberValue,BooleanValue,DateValue,LinkValue,ListValue,Keymap,Platform,setTooltip,ButtonComponent,TextComponent,Plugin,BasesView,TFile,TFolder,TAbstractFile,Notice,Setting,Modal,PluginSettingTab,Menu,setIcon,normalizePath,Component};
})();
