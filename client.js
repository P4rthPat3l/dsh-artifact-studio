window.__ModuleLoader__.load({
  id: "dsh-artifacts",
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
    globalThis.__dshArtifactsRequireAsync = require.async;
"use strict";var ga=Object.create;var Qe=Object.defineProperty;var ba=Object.getOwnPropertyDescriptor;var ha=Object.getOwnPropertyNames;var ya=Object.getPrototypeOf,va=Object.prototype.hasOwnProperty;var xa=(e,t)=>{for(var r in t)Qe(e,r,{get:t[r],enumerable:!0})},nr=(e,t,r,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of ha(t))!va.call(e,a)&&a!==r&&Qe(e,a,{get:()=>t[a],enumerable:!(n=ba(t,a))||n.enumerable});return e};var wa=(e,t,r)=>(r=e!=null?ga(ya(e)):{},nr(t||!e||!e.__esModule?Qe(r,"default",{value:e,enumerable:!0}):r,e)),ka=e=>nr(Qe({},"__esModule",{value:!0}),e);var fn={};xa(fn,{ARTIFACT_ID:()=>mt,ARTIFACT_KIND:()=>oa,ArtifactCard:()=>Ot,ArtifactTab:()=>zt,CARD_TOOLS:()=>ia,DocView:()=>nt,GALLERY_ID:()=>ft,Gallery:()=>Kt,PANEL_ID:()=>Gt,apply:()=>un,inject:()=>ln});module.exports=ka(fn);var Na=["page","doc"];function Sa(e){return Na.some(t=>t===e)}var Rt={page:["html"],doc:["md","docx","html"]};var Je=/^art_(ws|lib)_[a-z0-9]{10,32}$/;function Et(e){if(e===null||typeof e!="object")return!1;let t="origin"in e?e.origin:void 0,r="action"in e?e.action:void 0;return(t==="agent"||t==="user")&&(r==="create"||r==="update"||r==="restore")}function et(e){if(e===null||typeof e!="object")return!1;let t={...e};return t.schemaVersion===1&&typeof t.id=="string"&&Je.test(t.id)&&(t.scope==="workspace"||t.scope==="library")&&typeof t.type=="string"&&Sa(t.type)&&typeof t.title=="string"&&typeof t.createdAt=="string"&&typeof t.updatedAt=="string"&&typeof t.version=="number"&&Number.isInteger(t.version)&&t.version>=1&&typeof t.contentFile=="string"&&typeof t.contentBytes=="number"&&typeof t.contentHash=="string"&&Et(t.source)}var Ze="dsh-resource://artifact/";function E(e){return e.scope==="workspace"?`${Ze}workspace/${encodeURIComponent(e.workspaceId)}/${e.id}`:`${Ze}library/${e.id}`}function fe(e){if(typeof e!="string"||!e.startsWith(Ze))return;let t=e.slice(Ze.length).split("/");if(t[0]==="library"&&t.length===2){let r=t[1]??"";return Je.test(r)&&r.startsWith("art_lib_")?{scope:"library",id:r}:void 0}if(t[0]==="workspace"&&t.length===3){let r=t[2]??"",n;try{n=decodeURIComponent(t[1]??"")}catch{return}return n===""||!Je.test(r)||!r.startsWith("art_ws_")?void 0:{scope:"workspace",workspaceId:n,id:r}}}function or(e){if(Je.test(e))return e.startsWith("art_ws_")?"workspace":"library"}function ir(e){let t=[];for(let[r,n]of Object.entries(e.colors))t.push(`--artifact-color-${r}: ${n};`);t.push(`--artifact-font-family: ${e.typography.fontFamily};`),t.push(`--artifact-font-mono: ${e.typography.monoFamily};`),e.typography.scale.forEach((r,n)=>t.push(`--artifact-font-size-${n}: ${r}px;`)),t.push(`--artifact-space-unit: ${e.spacing.unit}px;`),e.spacing.scale.forEach((r,n)=>t.push(`--artifact-space-${n}: ${r}px;`));for(let[r,n]of Object.entries(e.radius))t.push(`--artifact-radius-${r}: ${n}px;`);return`:root {
  ${t.join(`
  `)}
}`}var Ta="/artifacts-rpc",Ce=class extends Error{code;details;constructor(t,r,n){super(r),this.name="ArtifactCallError",this.code=t,this.details=n}},Dt=null;function sr(e){Dt=e}async function W(e,t,r,n){if(Dt===null)throw new Ce("artifact/not-ready","The artifact channel is not ready.",{});let a=await Dt.rpc.call(Ta,e,t,n);if(!a.ok)throw new Ce(a.error.code,a.error.message,a.error.details);if(!r(a.value))throw new Ce("artifact/bad-response",`The ${e} response has an unexpected shape.`,{});return a.value}function O(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function Ca(e){return O(e)&&Array.isArray(e.items)&&e.items.every(et)&&typeof e.total=="number"&&typeof e.hasMore=="boolean"}function Aa(e){return O(e)&&et(e.manifest)&&typeof e.content=="string"&&typeof e.version=="number"&&typeof e.designCss=="string"}function tt(e){return O(e)&&et(e.manifest)}function Pa(e){return O(e)&&typeof e.version=="number"&&typeof e.createdAt=="string"&&typeof e.contentHash=="string"&&typeof e.contentBytes=="number"&&Et(e.source)}function Ra(e){return O(e)&&Array.isArray(e.versions)&&e.versions.every(Pa)}function Ea(e){return O(e)&&e.trashed===!0&&typeof e.trashPath=="string"}function Ma(e){return O(e)&&typeof e.path=="string"&&typeof e.bytes=="number"&&typeof e.fileName=="string"&&typeof e.mediaType=="string"&&typeof e.data=="string"}function Da(e){return O(e)&&typeof e.html=="string"}function La(e){return O(e)&&e.schemaVersion===1&&typeof e.name=="string"&&O(e.colors)&&O(e.typography)&&O(e.spacing)&&O(e.radius)}function Mt(e){return O(e)&&La(e.tokens)&&(e.source==="workspace"||e.source==="library"||e.source==="default")&&typeof e.css=="string"}function X(e){return{scope:e.scope,...e.workspaceId===null?{}:{workspaceId:e.workspaceId}}}var M={list:(e,t,r)=>W("list",{...X(e),...t},Ca,r),get:(e,t,r,n)=>W("get",{...X(e),id:t,...r===void 0?{}:{version:r}},Aa,n),create:(e,t,r,n)=>W("create",{...X(e),type:t,title:r,content:n},tt),update:(e,t,r,n,a)=>W("update",{...X(e),id:t,baseVersion:r,content:n,...a===void 0?{}:{title:a}},tt),rename:(e,t,r,n)=>W("update",{...X(e),id:t,baseVersion:r,title:n},tt),remove:(e,t)=>W("delete",{...X(e),id:t},Ea),history:(e,t,r)=>W("history",{...X(e),id:t},Ra,r),restore:(e,t,r,n)=>W("restore",{...X(e),id:t,version:r,baseVersion:n},tt),exportFile:(e,t,r,n)=>W("export",{...X(e),id:t,format:r,version:n},Ma),printable:(e,t,r)=>W("printable",{...X(e),id:t,version:r},Da),designSystem:(e,t)=>W("designSystem",e===null?{}:{workspaceId:e},Mt,t),saveDesignSystem:(e,t)=>W("saveDesignSystem",{...X(e),tokens:t},Mt),clearDesignSystem:e=>W("clearDesignSystem",{workspaceId:e,scope:"workspace"},Mt)};function H(e){return e instanceof Ce?e.code:void 0}function I(e){switch(e){case"artifact/not-found":return"error.notFound";case"artifact/stale-version":return"error.stale";case"artifact/too-large":return"error.tooLarge";case"artifact/no-workspace":return"error.noWorkspace";case"artifact/forbidden-path":return"error.forbidden";case"artifact/corrupt":return"error.corrupt";case"artifact/invalid-tokens":return"error.tokens";case"artifact/library-unavailable":return"error.library";default:return"error.generic"}}function lr(e){let t=atob(e.data),r=new Uint8Array(t.length);for(let s=0;s<t.length;s+=1)r[s]=t.charCodeAt(s);let n=URL.createObjectURL(new Blob([r],{type:e.mediaType})),a=document.createElement("a");a.href=n,a.download=e.fileName,a.rel="noopener",document.body.appendChild(a),a.click(),a.remove(),setTimeout(()=>URL.revokeObjectURL(n),3e4)}var Pe=require("react");var Ve=require("react");function at(e){let t=e,r=new Set;return{get:()=>t,set(n){t=n;for(let a of r)a()},subscribe(n){return r.add(n),()=>r.delete(n)}}}var Ae=at(new Map);function ve(e,t){if(Ae.get().get(e)===t)return;let r=new Map(Ae.get());r.set(e,t),Ae.set(r)}function cr(e){return Ae.get().get(e)}function dr(e){return(0,Ve.useSyncExternalStore)(Ae.subscribe,()=>e===void 0?void 0:Ae.get().get(e))}var je=at(new Map);function xe(e,t){if((je.get().get(e)??0)>=t)return;let r=new Map(je.get());r.set(e,t),je.set(r)}function pr(e){return(0,Ve.useSyncExternalStore)(je.subscribe,()=>e===void 0?0:je.get().get(e)??0)}var rt=at(0);function oe(){rt.set(rt.get()+1)}function ur(){return(0,Ve.useSyncExternalStore)(rt.subscribe,rt.get)}var $e,Fe=at(null);function q(e){Fe.set(e),$e!==void 0&&clearTimeout($e),$e=setTimeout(()=>Fe.set(null),3600)}function fr(){return(0,Ve.useSyncExternalStore)(Fe.subscribe,Fe.get)}function mr(){$e!==void 0&&clearTimeout($e),Fe.set(null)}var ie=new Map,Lt;function gr(){Lt?.();let e=t=>{[...ie.values()].some(r=>r.getSnapshot().draft!==null||r.getSnapshot().saving)&&(t.preventDefault(),t.returnValue="")};return window.addEventListener("beforeunload",e),Lt=()=>window.removeEventListener("beforeunload",e),Lt}var It=class{state={payload:null,draft:null,loading:!0,saving:!1,conflict:!1,revision:0};listeners=new Set;pending=null;readSequence=0;mounts=0;renameTo;where;key;address;constructor(t){this.address=t,this.key=E(t),this.where={scope:t.scope,workspaceId:t.scope==="workspace"?t.workspaceId:null}}getSnapshot=()=>this.state;subscribe=t=>(this.listeners.add(t),()=>this.listeners.delete(t));publish(t){this.state={...this.state,...t},this.state.draft!==null||this.state.saving?ie.set(this.key,this):this.mounts===0&&ie.get(this.key)===this&&ie.delete(this.key);for(let r of this.listeners)r()}attach(){return this.mounts+=1,ie.set(this.key,this),this.mounts===1&&(this.state.payload===null||this.state.draft===null)&&this.load(),()=>{this.mounts-=1,this.mounts===0&&this.state.draft===null&&!this.state.saving&&ie.get(this.key)===this&&ie.delete(this.key)}}async load(){let t=++this.readSequence;this.publish({loading:!0,failure:void 0});try{let r=await M.get(this.where,this.address.id);if(t!==this.readSequence)return;if(this.state.draft!==null&&this.state.payload!==null){this.publish({loading:!1,conflict:r.version!==this.state.payload.version});return}this.publish({payload:r,loading:!1,conflict:!1,failure:void 0,revision:this.state.revision+1}),ve(this.address.id,r.manifest.title),xe(this.address.id,r.version)}catch(r){t===this.readSequence&&this.publish({loading:!1,failure:H(r)??"artifact/storage-failure"})}}edit(t){this.publish({draft:t,failure:void 0})}async discardAndReload(){this.pending!==null&&await this.pending,this.publish({draft:null,conflict:!1,failure:void 0}),await this.load()}externalVersion(t){this.state.payload===null||t<=this.state.payload.version||this.state.saving||(this.state.draft!==null?this.publish({conflict:!0}):this.load())}save(t){return t!==void 0&&(this.renameTo=t),this.pending!==null?this.pending:this.state.conflict||this.state.payload===null?Promise.resolve(!1):(this.pending=Promise.resolve().then(()=>this.drain()),this.pending)}async drain(){this.publish({saving:!0,failure:void 0});try{for(;this.state.draft!==null||this.renameTo!==void 0;){let t=this.state.payload;if(t===null||this.state.conflict)return!1;let r=this.state.draft,n=r??t.content,a=this.renameTo,{manifest:s}=await M.update(this.where,this.address.id,t.version,n,a);this.renameTo===a&&(this.renameTo=void 0),this.accept(s,n,this.state.draft===r?null:this.state.draft)}return!0}catch(t){let r=H(t)??"artifact/storage-failure";return this.renameTo=void 0,this.publish({failure:r,conflict:r==="artifact/stale-version"}),!1}finally{this.pending=null,this.publish({saving:!1})}}accept(t,r,n){let a=this.state.payload;a!==null&&(++this.readSequence,this.publish({payload:{...a,manifest:t,content:r,version:t.version},draft:n,conflict:!1,loading:!1}),ve(t.id,t.title),xe(t.id,t.version),oe())}};function br(e){let t=E(e),r=(0,Pe.useMemo)(()=>{let a=ie.get(t);if(a!==void 0)return a;let s=new It(e);return ie.set(t,s),s},[t]),n=(0,Pe.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot);return(0,Pe.useEffect)(()=>r.attach(),[r]),{model:r,state:n}}var g=require("react");var j=require("react"),me=require("react/jsx-runtime"),Be=null;function Ia(){if(Be===null){let e=globalThis.__dshArtifactsRequireAsync;if(typeof e!="function")return Promise.reject(new Error("The document editor loader is unavailable."));Be=e("./client.doc.js"),Be.catch(()=>{Be=null})}return Be}function nt({markdown:e,revision:t,editable:r,label:n,loadingLabel:a,failedLabel:s,onChange:o,onSave:p,onSelectionText:c,t:y}){let b=(0,j.useRef)(null),u=(0,j.useRef)(null),N=(0,j.useRef)(o);N.current=o;let f=(0,j.useRef)(c);f.current=c;let v=(0,j.useRef)({markdown:e,editable:r,label:n});v.current={markdown:e,editable:r,label:n};let[F,Z]=(0,j.useState)([]),[S,A]=(0,j.useState)("loading");return(0,j.useEffect)(()=>{let k=!1;return Ia().then(K=>{k||b.current===null||(u.current=K.mountDocEditor({element:b.current,...v.current,onChange:ee=>N.current(ee),onSelectionChange:Z,onSelectionText:ee=>f.current?.(ee)}),A("ready"))}).catch(()=>{k||A("failed")}),()=>{k=!0,u.current?.destroy(),u.current=null}},[]),(0,j.useEffect)(()=>{let k=u.current;k!==null&&k.getMarkdown()!==e&&k.setMarkdown(e)},[t,e]),(0,j.useEffect)(()=>{u.current?.setEditable(r)},[r]),(0,j.useEffect)(()=>{let k=()=>f.current?.(u.current?.getSelectionText()??"");return document.addEventListener("selectionchange",k),()=>document.removeEventListener("selectionchange",k)},[]),(0,me.jsxs)("div",{className:"art-doc","data-doc-revision":t,onKeyDown:k=>{(k.ctrlKey||k.metaKey)&&k.key.toLowerCase()==="s"&&(k.preventDefault(),p())},children:[!r||y===void 0?null:(0,me.jsx)("div",{className:"art-doc-toolbar",role:"toolbar","aria-label":y("format.toolbar"),children:["heading","bold","italic","bulletList","orderedList","codeBlock"].map(k=>(0,me.jsx)("button",{type:"button",className:"art-button","aria-pressed":F.includes(k),disabled:S!=="ready",onMouseDown:K=>K.preventDefault(),onClick:()=>u.current?.format(k),children:y(`format.${k}`)},k))}),S==="loading"?(0,me.jsx)("p",{className:"art-note",children:a}):null,S==="failed"?(0,me.jsx)("p",{className:"art-note",children:s}):null,(0,me.jsx)("div",{className:"art-doc-mount",ref:b})]})}var yr="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";var Ht="<script>addEventListener('message',function(e){if(e.source!==parent||e.data!=='dsh-artifact-print')return;addEventListener('afterprint',function(){parent.postMessage('dsh-artifact-printed','*')},{once:true});print()})<\/script>";function hr(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Ha(e){return e.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi,"").replace(/<meta\b[^>]*content\s*=\s*["'][^"']*url\s*=[^>]*>/gi,"")}function vr(e,t,r,n,a=""){return`<!doctype html><html><head>${'<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+(r===null?"":`<meta http-equiv="Content-Security-Policy" content="${hr(r)}">`)+`<title>${hr(n)}</title><style data-artifact-tokens>${t}</style>`+a}</head><body>${Ha(e)}</body></html>`}var xr="allow-scripts",qa="allow-scripts allow-modals",za=3e4;function ot(e,t,r){return vr(e,t,yr,r)}function wr(e){let t=/<\/head>/i.test(e)?e.replace(/<\/head>/i,`${Ht}</head>`):`${Ht}${e}`,r=URL.createObjectURL(new Blob([t],{type:"text/html"})),n=document.createElement("iframe");n.setAttribute("sandbox",qa),n.setAttribute("aria-hidden","true"),n.tabIndex=-1,n.style.cssText="position:fixed;left:-10000px;top:0;width:800px;height:1000px;border:0;";let a=!1,s=()=>{a||(a=!0,clearTimeout(p),window.removeEventListener("message",o),n.remove(),URL.revokeObjectURL(r))},o=c=>{c.source===n.contentWindow&&c.data==="dsh-artifact-printed"&&s()};window.addEventListener("message",o);let p=setTimeout(s,za);n.addEventListener("load",()=>{n.contentWindow?.postMessage("dsh-artifact-print","*")},{once:!0}),n.src=r,document.body.appendChild(n)}var kr={"filter.scope":"Filter by storage","filter.type":"Filter by type","tab.mode":"Page view","tab.manualSave":"Page source saves with Save or Ctrl/Cmd+S.","tab.autosave":"Documents save automatically after typing.","tab.outputVersion":"Output uses saved v{version}","tab.versionPicker":"Choose version","tab.currentVersion":"current","tab.allVersions":"All versions","tab.agentUpdate":"Updated to v{version}","tab.viewHistory":"View history","tab.dismiss":"Dismiss","tab.leaveTitle":"Keep your changes?","tab.leaveHint":"Save your changes before continuing, or discard them. Cancel keeps you here.","tab.discardContinue":"Discard and continue","tab.saveContinue":"Save and continue","tab.copyDraft":"Copy my draft","tab.discardReload":"Discard mine and reload","history.close":"Close history","action.copied":"Copied","action.copyFailed":"Copy was blocked. Select the text and copy it manually.","agent.edit":"Ask agent to edit","agent.ask":"Ask agent","drawer.closeRequest":"Close request","agent.promptLabel":"What should change?","agent.promptPlaceholder":"Describe the change. Name the section or the effect you want.","agent.context":"Request context","agent.quote":"Selected text","agent.removeQuote":"Remove selected text","agent.copyRequest":"Copy request","agent.copyHint":"Copies a request for the conversation you choose. Nothing is sent automatically.","agent.copiedHint":"Copied. Paste it into the chat, then send.","agent.preview":"Preview copied request","agent.promptRequired":"Describe the change before copying.","agent.truncated":"The selected text was shortened to 2,000 characters.","agent.request":`Please edit artifact "{title}".
Artifact address: {address}
Artifact id: {id}
Scope: {scope}
Project: {workspace}
Reference version: {version}
{selection}
Requested changes:
{prompt}

Read the current artifact before updating it. If it has changed since the reference version, check the changes before applying this request. Update this artifact instead of creating a duplicate.`,"format.toolbar":"Document formatting","format.heading":"Heading","format.bold":"Bold","format.italic":"Italic","format.bulletList":"Bullet list","format.orderedList":"Numbered list","format.codeBlock":"Code block",panel:"Artifacts","panel.workspace":"Project","action.back":"Back","guide.title":"Artifacts","guide.description":"Pages and documents the agent made, with versions and export.","scope.workspace":"This project","scope.library":"Library","scope.workspaceHint":"Stored in this project under .dsh/artifacts.","scope.libraryHint":"Stored in your profile and shared by every project.","type.page":"Page","type.doc":"Document","type.all":"All types","filter.all":"All","gallery.search":"Search artifacts","gallery.searchLabel":"Search by title","gallery.new":"New","gallery.create":"New artifact","gallery.newPage":"New page","gallery.newDoc":"New document","gallery.design":"Design system","gallery.refresh":"Refresh","gallery.more":"Show more","gallery.truncated":"Only the first 500 artifacts are scanned.","gallery.version":"v{version}","gallery.updated":"Updated {time}","gallery.count":"{count} artifacts","gallery.pinned":"Pinned","gallery.recent":"Recently updated","gallery.coverTitle":"Preview of {title}","gallery.coverFailed":"Preview unavailable","gallery.pin":"Pin {title}","gallery.unpin":"Unpin {title}","gallery.allPinned":"Everything here is pinned.","gallery.templates":"Start from a template","gallery.templateHint":"Pages and documents the agent can extend. Nothing changes until you ask.","template.blankPage":"Blank page","template.blankPageHint":"An empty HTML page that uses the design tokens.","template.dashboard":"Dashboard","template.dashboardHint":"Metrics, a chart, and a table shell.","template.blankDoc":"Blank document","template.blankDocHint":"A Markdown document with a heading.","template.brief":"Project brief","template.briefHint":"Context, goal, scope, and open questions.","empty.workspaceTitle":"No artifacts in this project yet","empty.workspaceHint":"Ask the agent for a dashboard, report, or one-pager, or start one here.","empty.libraryTitle":"Your library is empty","empty.libraryHint":"Library artifacts follow you to every project. Ask the agent to save one to the library.","empty.noMatch":"Nothing matches that search.","empty.typeMatch":"No {type} artifacts match the filter.","empty.noWorkspace":"Open a session in a workspace to see its artifacts.","empty.loading":"Loading...","create.title":"New {type}","create.name":"Title","create.scope":"Save to","create.submit":"Create","create.cancel":"Cancel","create.untitledPage":"Untitled page","create.untitledDoc":"Untitled document","tab.preview":"Preview","tab.source":"Source","tab.history":"History","tab.export":"Export","tab.maximize":"Fill the window","tab.restoreSize":"Back to the side panel","tab.reload":"Reload","tab.rename":"Rename","tab.delete":"Move to trash","tab.deleteConfirm":'Move "{title}" to the trash? Its files stay in .trash for 7 days.',"tab.save":"Save","tab.saving":"Saving...","tab.saved":"Saved","tab.readOnly":"Read-only","tab.saveFailed":"Save failed","tab.unsaved":"Unsaved changes","tab.frameTitle":"Artifact preview: {title}","tab.versionOf":"Version {version}","tab.viewingOld":"Viewing version {version}. The current version is {current}.","tab.backToCurrent":"Back to current","tab.restoreThis":"Restore this version","tab.discardConfirm":`Discard your unsaved changes?

Save first if you want to keep them.`,"tab.printOldVersion":"Go back to the current version to print it.","tab.conflictTitle":"This artifact changed","tab.conflictHint":"A newer version was saved while you were editing. Your draft is kept here. Copy it before discarding, then reload the latest version.","tab.deleted":"This artifact is no longer here","tab.deletedHint":"It was moved to the trash or deleted.","tab.close":"Close tab","tab.scripts":"Scripts run in a sandbox with no network access.","history.title":"Versions","history.current":"Current","history.byAgent":"Agent","history.byUser":"You","history.restored":"Restored from v{version}","history.created":"Created","history.updated":"Edited","history.empty":"No earlier versions.","export.html":"HTML file","export.md":"Markdown file","export.docx":"Word document","export.print":"Print or save as PDF","export.done":"Saved {name} to {path}","design.title":"Design system","design.hint":"Pages and documents use these values through CSS variables.","design.source.workspace":"This project overrides the library.","design.source.library":"Inherited from your library.","design.source.default":"Built-in defaults. Save to start your own.","design.name":"Name","design.colors":"Colors","design.color.primary":"Primary","design.color.accent":"Accent","design.color.surface":"Surface","design.color.text":"Text","design.color.muted":"Muted","design.type":"Typography","design.font":"Body font stack","design.mono":"Code font stack","design.radius":"Corner radius","design.radius.sm":"Small","design.radius.md":"Medium","design.radius.lg":"Large","design.notes":"Notes for the agent","design.notesHint":"Tone, layout rules, or brand guidance the agent reads before it designs.","design.saveWorkspace":"Save for this project","design.saveLibrary":"Save to library","design.clear":"Remove project override","design.saved":"Design system saved","design.preview":"Preview","design.previewHeading":"Quarterly review","design.previewBody":"Revenue grew in every region this quarter.","design.previewButton":"Primary action","card.created":"Created","card.updated":"Updated","card.open":"Open","card.working":"Writing the artifact...","card.failed":"The artifact was not saved","card.missing":"This result has no artifact details.","composer.label":"Artifacts","error.generic":"Something went wrong. Try again.","error.notFound":"This artifact no longer exists.","error.stale":"The artifact changed. Reload to continue.","error.tooLarge":"The content is over the 2 MiB limit.","error.noWorkspace":"This session has no workspace.","error.forbidden":"That path is not allowed.","error.corrupt":"The artifact files are damaged.","error.tokens":"A design value is not valid CSS.","error.library":"The library folder cannot be created.","error.surface":"The artifact panel failed to draw.","error.surfaceHint":"Reload the window. Your artifacts are safe on disk.","action.retry":"Retry","action.reloadWindow":"Reload window","time.justNow":"just now","time.minutes":"{count} min ago","time.hours":"{count} h ago","time.days":"{count} d ago"},Nr={"filter.scope":"\u6309\u5B58\u50A8\u4F4D\u7F6E\u7B5B\u9009","filter.type":"\u6309\u7C7B\u578B\u7B5B\u9009","tab.mode":"\u9875\u9762\u89C6\u56FE","tab.manualSave":"\u9875\u9762\u6E90\u7801\u9700\u70B9\u51FB\u4FDD\u5B58\u6216\u6309 Ctrl/Cmd+S\u3002","tab.autosave":"\u6587\u6863\u5728\u8F93\u5165\u540E\u81EA\u52A8\u4FDD\u5B58\u3002","tab.outputVersion":"\u8F93\u51FA\u4F7F\u7528\u5DF2\u4FDD\u5B58\u7684 v{version}","tab.versionPicker":"\u9009\u62E9\u7248\u672C","tab.currentVersion":"\u5F53\u524D","tab.allVersions":"\u5168\u90E8\u7248\u672C","tab.agentUpdate":"\u5DF2\u66F4\u65B0\u5230 v{version}","tab.viewHistory":"\u67E5\u770B\u5386\u53F2","tab.dismiss":"\u5173\u95ED","tab.leaveTitle":"\u4FDD\u7559\u66F4\u6539\uFF1F","tab.leaveHint":"\u7EE7\u7EED\u524D\u4FDD\u5B58\u66F4\u6539\uFF0C\u6216\u653E\u5F03\u66F4\u6539\u3002\u53D6\u6D88\u5C06\u4FDD\u7559\u5F53\u524D\u7F16\u8F91\u3002","tab.discardContinue":"\u653E\u5F03\u5E76\u7EE7\u7EED","tab.saveContinue":"\u4FDD\u5B58\u5E76\u7EE7\u7EED","tab.copyDraft":"\u590D\u5236\u6211\u7684\u8349\u7A3F","tab.discardReload":"\u653E\u5F03\u6211\u7684\u66F4\u6539\u5E76\u91CD\u65B0\u52A0\u8F7D","history.close":"\u5173\u95ED\u5386\u53F2","action.copied":"\u5DF2\u590D\u5236","action.copyFailed":"\u590D\u5236\u88AB\u963B\u6B62\u3002\u8BF7\u9009\u4E2D\u6587\u672C\u540E\u624B\u52A8\u590D\u5236\u3002","agent.edit":"\u8BF7\u667A\u80FD\u4F53\u7F16\u8F91","agent.ask":"\u8BA9\u667A\u80FD\u4F53\u4FEE\u6539","drawer.closeRequest":"\u5173\u95ED\u4FEE\u6539\u8BF7\u6C42","agent.promptLabel":"\u9700\u8981\u6539\u4EC0\u4E48\uFF1F","agent.promptPlaceholder":"\u63CF\u8FF0\u4FEE\u6539\u5185\u5BB9\uFF0C\u8BF4\u660E\u4F4D\u7F6E\u6216\u671F\u671B\u6548\u679C\u3002","agent.context":"\u8BF7\u6C42\u4E0A\u4E0B\u6587","agent.quote":"\u9009\u4E2D\u7684\u6587\u672C","agent.removeQuote":"\u79FB\u9664\u9009\u4E2D\u6587\u672C","agent.copyRequest":"\u590D\u5236\u8BF7\u6C42","agent.copyHint":"\u5C06\u8BF7\u6C42\u590D\u5236\u5230\u4F60\u9009\u62E9\u7684\u4F1A\u8BDD\u3002\u4E0D\u4F1A\u81EA\u52A8\u53D1\u9001\u3002","agent.copiedHint":"\u5DF2\u590D\u5236\u3002\u8BF7\u7C98\u8D34\u5230\u5BF9\u8BDD\u4E2D\u5E76\u53D1\u9001\u3002","agent.preview":"\u9884\u89C8\u590D\u5236\u7684\u8BF7\u6C42","agent.promptRequired":"\u8BF7\u5148\u63CF\u8FF0\u8981\u4FEE\u6539\u7684\u5185\u5BB9\u3002","agent.truncated":"\u9009\u4E2D\u7684\u6587\u672C\u5DF2\u622A\u65AD\u4E3A 2,000 \u4E2A\u5B57\u7B26\u3002","agent.request":`\u8BF7\u7F16\u8F91\u4EA7\u7269\u201C{title}\u201D\u3002
\u4EA7\u7269\u5730\u5740\uFF1A{address}
\u4EA7\u7269\u6807\u8BC6\uFF1A{id}
\u5B58\u50A8\u4F4D\u7F6E\uFF1A{scope}
\u9879\u76EE\uFF1A{workspace}
\u53C2\u8003\u7248\u672C\uFF1A{version}
{selection}
\u9700\u8981\u7684\u66F4\u6539\uFF1A
{prompt}

\u66F4\u65B0\u524D\u8BF7\u8BFB\u53D6\u5F53\u524D\u4EA7\u7269\u3002\u5982\u679C\u4EA7\u7269\u81EA\u53C2\u8003\u7248\u672C\u540E\u5DF2\u66F4\u6539\uFF0C\u8BF7\u5148\u68C0\u67E5\u66F4\u6539\u3002\u8BF7\u66F4\u65B0\u6B64\u4EA7\u7269\uFF0C\u4E0D\u8981\u521B\u5EFA\u526F\u672C\u3002`,"format.toolbar":"\u6587\u6863\u683C\u5F0F","format.heading":"\u6807\u9898","format.bold":"\u7C97\u4F53","format.italic":"\u659C\u4F53","format.bulletList":"\u9879\u76EE\u7B26\u53F7\u5217\u8868","format.orderedList":"\u7F16\u53F7\u5217\u8868","format.codeBlock":"\u4EE3\u7801\u5757",panel:"\u4EA7\u7269","panel.workspace":"\u9879\u76EE","action.back":"\u8FD4\u56DE","guide.title":"\u4EA7\u7269","guide.description":"\u667A\u80FD\u4F53\u751F\u6210\u7684\u9875\u9762\u548C\u6587\u6863\uFF0C\u53EF\u67E5\u770B\u7248\u672C\u5E76\u5BFC\u51FA\u3002","scope.workspace":"\u5F53\u524D\u9879\u76EE","scope.library":"\u8D44\u6599\u5E93","scope.workspaceHint":"\u4FDD\u5B58\u5728\u672C\u9879\u76EE\u7684 .dsh/artifacts \u4E0B\u3002","scope.libraryHint":"\u4FDD\u5B58\u5728\u4E2A\u4EBA\u914D\u7F6E\u4E2D\uFF0C\u6240\u6709\u9879\u76EE\u5171\u4EAB\u3002","type.page":"\u9875\u9762","type.doc":"\u6587\u6863","type.all":"\u5168\u90E8\u7C7B\u578B","filter.all":"\u5168\u90E8","gallery.search":"\u641C\u7D22\u4EA7\u7269","gallery.searchLabel":"\u6309\u6807\u9898\u641C\u7D22","gallery.new":"\u65B0\u5EFA","gallery.create":"\u65B0\u5EFA\u4EA7\u7269","gallery.newPage":"\u65B0\u5EFA\u9875\u9762","gallery.newDoc":"\u65B0\u5EFA\u6587\u6863","gallery.design":"\u8BBE\u8BA1\u7CFB\u7EDF","gallery.refresh":"\u5237\u65B0","gallery.more":"\u663E\u793A\u66F4\u591A","gallery.truncated":"\u4EC5\u626B\u63CF\u524D 500 \u4E2A\u4EA7\u7269\u3002","gallery.version":"v{version}","gallery.updated":"\u66F4\u65B0\u4E8E {time}","gallery.count":"{count} \u4E2A\u4EA7\u7269","gallery.pinned":"\u5DF2\u7F6E\u9876","gallery.recent":"\u6700\u8FD1\u66F4\u65B0","gallery.coverTitle":"{title} \u7684\u9884\u89C8","gallery.coverFailed":"\u9884\u89C8\u4E0D\u53EF\u7528","gallery.pin":"\u7F6E\u9876 {title}","gallery.unpin":"\u53D6\u6D88\u7F6E\u9876 {title}","gallery.allPinned":"\u8FD9\u91CC\u7684\u4EA7\u7269\u90FD\u5DF2\u7F6E\u9876\u3002","gallery.templates":"\u4ECE\u6A21\u677F\u5F00\u59CB","gallery.templateHint":"\u667A\u80FD\u4F53\u53EF\u4EE5\u7EE7\u7EED\u6269\u5C55\u7684\u9875\u9762\u548C\u6587\u6863\u3002\u53EA\u6709\u4F60\u53D1\u51FA\u8BF7\u6C42\u65F6\u624D\u4F1A\u4FEE\u6539\u3002","template.blankPage":"\u7A7A\u767D\u9875\u9762","template.blankPageHint":"\u4F7F\u7528\u8BBE\u8BA1\u4EE4\u724C\u7684\u7A7A\u767D HTML \u9875\u9762\u3002","template.dashboard":"\u4EEA\u8868\u76D8","template.dashboardHint":"\u6307\u6807\u3001\u56FE\u8868\u548C\u8868\u683C\u6846\u67B6\u3002","template.blankDoc":"\u7A7A\u767D\u6587\u6863","template.blankDocHint":"\u5E26\u6807\u9898\u7684 Markdown \u6587\u6863\u3002","template.brief":"\u9879\u76EE\u7B80\u62A5","template.briefHint":"\u80CC\u666F\u3001\u76EE\u6807\u3001\u8303\u56F4\u548C\u5F85\u89E3\u51B3\u95EE\u9898\u3002","empty.workspaceTitle":"\u672C\u9879\u76EE\u8FD8\u6CA1\u6709\u4EA7\u7269","empty.workspaceHint":"\u8BA9\u667A\u80FD\u4F53\u751F\u6210\u4EEA\u8868\u76D8\u3001\u62A5\u544A\u6216\u5355\u9875\uFF0C\u6216\u5728\u8FD9\u91CC\u65B0\u5EFA\u3002","empty.libraryTitle":"\u8D44\u6599\u5E93\u4E3A\u7A7A","empty.libraryHint":"\u8D44\u6599\u5E93\u4E2D\u7684\u4EA7\u7269\u5728\u6240\u6709\u9879\u76EE\u53EF\u7528\u3002\u8BA9\u667A\u80FD\u4F53\u628A\u4EA7\u7269\u4FDD\u5B58\u5230\u8D44\u6599\u5E93\u3002","empty.noMatch":"\u6CA1\u6709\u5339\u914D\u7684\u4EA7\u7269\u3002","empty.typeMatch":"\u6CA1\u6709\u7B26\u5408\u7C7B\u578B\u7B5B\u9009\u7684{type}\u4EA7\u7269\u3002","empty.noWorkspace":"\u5728\u5DE5\u4F5C\u533A\u4E2D\u6253\u5F00\u4F1A\u8BDD\u4EE5\u67E5\u770B\u5176\u4EA7\u7269\u3002","empty.loading":"\u52A0\u8F7D\u4E2D...","create.title":"\u65B0\u5EFA{type}","create.name":"\u6807\u9898","create.scope":"\u4FDD\u5B58\u5230","create.submit":"\u521B\u5EFA","create.cancel":"\u53D6\u6D88","create.untitledPage":"\u672A\u547D\u540D\u9875\u9762","create.untitledDoc":"\u672A\u547D\u540D\u6587\u6863","tab.preview":"\u9884\u89C8","tab.source":"\u6E90\u7801","tab.history":"\u5386\u53F2","tab.export":"\u5BFC\u51FA","tab.maximize":"\u94FA\u6EE1\u7A97\u53E3","tab.restoreSize":"\u56DE\u5230\u4FA7\u8FB9\u680F","tab.reload":"\u91CD\u65B0\u52A0\u8F7D","tab.rename":"\u91CD\u547D\u540D","tab.delete":"\u79FB\u5230\u56DE\u6536\u7AD9","tab.deleteConfirm":"\u5C06\u201C{title}\u201D\u79FB\u5230\u56DE\u6536\u7AD9\uFF1F\u6587\u4EF6\u4F1A\u5728 .trash \u4E2D\u4FDD\u7559 7 \u5929\u3002","tab.save":"\u4FDD\u5B58","tab.saving":"\u6B63\u5728\u4FDD\u5B58...","tab.saved":"\u5DF2\u4FDD\u5B58","tab.readOnly":"\u53EA\u8BFB","tab.saveFailed":"\u4FDD\u5B58\u5931\u8D25","tab.unsaved":"\u6709\u672A\u4FDD\u5B58\u7684\u66F4\u6539","tab.frameTitle":"\u4EA7\u7269\u9884\u89C8\uFF1A{title}","tab.versionOf":"\u7248\u672C {version}","tab.viewingOld":"\u6B63\u5728\u67E5\u770B\u7248\u672C {version}\uFF0C\u5F53\u524D\u7248\u672C\u4E3A {current}\u3002","tab.backToCurrent":"\u56DE\u5230\u5F53\u524D\u7248\u672C","tab.restoreThis":"\u6062\u590D\u6B64\u7248\u672C","tab.discardConfirm":`\u653E\u5F03\u672A\u4FDD\u5B58\u7684\u66F4\u6539\uFF1F

\u5982\u9700\u4FDD\u7559\u8BF7\u5148\u4FDD\u5B58\u3002`,"tab.printOldVersion":"\u8BF7\u56DE\u5230\u5F53\u524D\u7248\u672C\u540E\u518D\u6253\u5370\u3002","tab.conflictTitle":"\u6B64\u4EA7\u7269\u5DF2\u66F4\u6539","tab.conflictHint":"\u7F16\u8F91\u671F\u95F4\u4FDD\u5B58\u4E86\u66F4\u65B0\u7248\u672C\u3002\u8349\u7A3F\u4ECD\u4FDD\u7559\u5728\u8FD9\u91CC\u3002\u653E\u5F03\u524D\u53EF\u5148\u590D\u5236\u8349\u7A3F\uFF0C\u518D\u91CD\u65B0\u52A0\u8F7D\u6700\u65B0\u7248\u672C\u3002","tab.deleted":"\u6B64\u4EA7\u7269\u5DF2\u4E0D\u5B58\u5728","tab.deletedHint":"\u5B83\u5DF2\u88AB\u79FB\u5230\u56DE\u6536\u7AD9\u6216\u5220\u9664\u3002","tab.close":"\u5173\u95ED\u6807\u7B7E\u9875","tab.scripts":"\u811A\u672C\u5728\u65E0\u7F51\u7EDC\u7684\u6C99\u7BB1\u4E2D\u8FD0\u884C\u3002","history.title":"\u7248\u672C","history.current":"\u5F53\u524D","history.byAgent":"\u667A\u80FD\u4F53","history.byUser":"\u4F60","history.restored":"\u4ECE v{version} \u6062\u590D","history.created":"\u521B\u5EFA","history.updated":"\u7F16\u8F91","history.empty":"\u6CA1\u6709\u66F4\u65E9\u7684\u7248\u672C\u3002","export.html":"HTML \u6587\u4EF6","export.md":"Markdown \u6587\u4EF6","export.docx":"Word \u6587\u6863","export.print":"\u6253\u5370\u6216\u53E6\u5B58\u4E3A PDF","export.done":"\u5DF2\u5C06 {name} \u4FDD\u5B58\u5230 {path}","design.title":"\u8BBE\u8BA1\u7CFB\u7EDF","design.hint":"\u9875\u9762\u548C\u6587\u6863\u901A\u8FC7 CSS \u53D8\u91CF\u4F7F\u7528\u8FD9\u4E9B\u503C\u3002","design.source.workspace":"\u672C\u9879\u76EE\u8986\u76D6\u4E86\u8D44\u6599\u5E93\u8BBE\u7F6E\u3002","design.source.library":"\u7EE7\u627F\u81EA\u8D44\u6599\u5E93\u3002","design.source.default":"\u5185\u7F6E\u9ED8\u8BA4\u503C\u3002\u4FDD\u5B58\u540E\u5373\u53EF\u81EA\u5B9A\u4E49\u3002","design.name":"\u540D\u79F0","design.colors":"\u989C\u8272","design.color.primary":"\u4E3B\u8272","design.color.accent":"\u5F3A\u8C03\u8272","design.color.surface":"\u5E95\u8272","design.color.text":"\u6587\u5B57","design.color.muted":"\u6B21\u8981","design.type":"\u5B57\u4F53","design.font":"\u6B63\u6587\u5B57\u4F53","design.mono":"\u4EE3\u7801\u5B57\u4F53","design.radius":"\u5706\u89D2","design.radius.sm":"\u5C0F","design.radius.md":"\u4E2D","design.radius.lg":"\u5927","design.notes":"\u7ED9\u667A\u80FD\u4F53\u7684\u8BF4\u660E","design.notesHint":"\u667A\u80FD\u4F53\u8BBE\u8BA1\u524D\u4F1A\u8BFB\u53D6\u7684\u8BED\u6C14\u3001\u6392\u7248\u89C4\u5219\u6216\u54C1\u724C\u89C4\u8303\u3002","design.saveWorkspace":"\u4FDD\u5B58\u5230\u672C\u9879\u76EE","design.saveLibrary":"\u4FDD\u5B58\u5230\u8D44\u6599\u5E93","design.clear":"\u79FB\u9664\u9879\u76EE\u8986\u76D6","design.saved":"\u8BBE\u8BA1\u7CFB\u7EDF\u5DF2\u4FDD\u5B58","design.preview":"\u9884\u89C8","design.previewHeading":"\u5B63\u5EA6\u56DE\u987E","design.previewBody":"\u672C\u5B63\u5EA6\u5404\u533A\u57DF\u6536\u5165\u5747\u6709\u589E\u957F\u3002","design.previewButton":"\u4E3B\u8981\u64CD\u4F5C","card.created":"\u5DF2\u521B\u5EFA","card.updated":"\u5DF2\u66F4\u65B0","card.open":"\u6253\u5F00","card.working":"\u6B63\u5728\u5199\u5165\u4EA7\u7269...","card.failed":"\u4EA7\u7269\u672A\u4FDD\u5B58","card.missing":"\u6B64\u7ED3\u679C\u6CA1\u6709\u4EA7\u7269\u4FE1\u606F\u3002","composer.label":"\u4EA7\u7269","error.generic":"\u51FA\u9519\u4E86\uFF0C\u8BF7\u91CD\u8BD5\u3002","error.notFound":"\u6B64\u4EA7\u7269\u5DF2\u4E0D\u5B58\u5728\u3002","error.stale":"\u4EA7\u7269\u5DF2\u66F4\u6539\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D\u3002","error.tooLarge":"\u5185\u5BB9\u8D85\u8FC7 2 MiB \u4E0A\u9650\u3002","error.noWorkspace":"\u6B64\u4F1A\u8BDD\u6CA1\u6709\u5DE5\u4F5C\u533A\u3002","error.forbidden":"\u4E0D\u5141\u8BB8\u8BBF\u95EE\u8BE5\u8DEF\u5F84\u3002","error.corrupt":"\u4EA7\u7269\u6587\u4EF6\u5DF2\u635F\u574F\u3002","error.tokens":"\u67D0\u4E2A\u8BBE\u8BA1\u503C\u4E0D\u662F\u6709\u6548\u7684 CSS\u3002","error.library":"\u65E0\u6CD5\u521B\u5EFA\u8D44\u6599\u5E93\u6587\u4EF6\u5939\u3002","error.surface":"\u4EA7\u7269\u9762\u677F\u7ED8\u5236\u5931\u8D25\u3002","error.surfaceHint":"\u8BF7\u91CD\u65B0\u52A0\u8F7D\u7A97\u53E3\u3002\u4F60\u7684\u4EA7\u7269\u4ECD\u5B89\u5168\u4FDD\u5B58\u5728\u78C1\u76D8\u4E0A\u3002","action.retry":"\u91CD\u8BD5","action.reloadWindow":"\u91CD\u65B0\u52A0\u8F7D\u7A97\u53E3","time.justNow":"\u521A\u521A","time.minutes":"{count} \u5206\u949F\u524D","time.hours":"{count} \u5C0F\u65F6\u524D","time.days":"{count} \u5929\u524D"};function it(e,t,r=Date.now()){let n=Math.max(0,r-Date.parse(t)),a=Math.floor(n/6e4);if(a<1)return e("time.justNow");if(a<60)return e("time.minutes",{count:a});let s=Math.floor(a/60);if(s<24)return e("time.hours",{count:s});let o=Math.floor(s/24);return o<7?e("time.days",{count:o}):new Date(t).toLocaleDateString()}var Q=require("react/jsx-runtime");function Oa(e,t){let r=t.source.origin==="agent"?e("history.byAgent"):e("history.byUser"),n=t.source.action==="restore"&&t.source.restoredFrom!==void 0?e("history.restored",{version:t.source.restoredFrom}):t.source.action==="create"?e("history.created"):e("history.updated");return`${r} \xB7 ${n} \xB7 ${it(e,t.createdAt)}`}function Sr({t:e,versions:t,failed:r,current:n,selected:a,onSelect:s}){return(0,Q.jsxs)("div",{className:"art-history-body",children:[t===null?(0,Q.jsx)("p",{className:"art-note",children:e("empty.loading")}):null,r?(0,Q.jsx)("p",{className:"art-note",children:e("error.generic")}):null,!r&&t!==null&&t.length<=1?(0,Q.jsx)("p",{className:"art-note",children:e("history.empty")}):null,t?.map(o=>(0,Q.jsxs)("button",{type:"button",className:"art-version","aria-current":o.version===a?"true":void 0,onClick:()=>s(o.version),children:[(0,Q.jsxs)("span",{className:"art-version-top",children:[(0,Q.jsx)("span",{children:e("tab.versionOf",{version:o.version})}),o.version===n?(0,Q.jsx)("span",{className:"art-badge",children:e("history.current")}):null]}),(0,Q.jsx)("span",{className:"art-version-sub",children:Oa(e,o)})]},o.version))]})}var En=require("react"),h=require("react/jsx-runtime");function $({children:e,size:t=16}){return(0,h.jsx)("svg",{viewBox:"0 0 24 24",width:t,height:t,fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:e})}var Re=({size:e})=>(0,h.jsxs)($,{size:e,children:[(0,h.jsx)("rect",{x:"3.5",y:"3.5",width:"7",height:"7",rx:"1.5"}),(0,h.jsx)("rect",{x:"13.5",y:"3.5",width:"7",height:"7",rx:"1.5"}),(0,h.jsx)("rect",{x:"3.5",y:"13.5",width:"7",height:"7",rx:"1.5"}),(0,h.jsx)("path",{d:"M17 13.5v7M13.5 17h7"})]}),se=({size:e})=>(0,h.jsxs)($,{size:e,children:[(0,h.jsx)("rect",{x:"3.5",y:"4.5",width:"17",height:"15",rx:"2"}),(0,h.jsx)("path",{d:"M3.5 8.5h17M9 13l-2 1.8L9 16.5M15 13l2 1.8-2 1.7"})]}),ge=({size:e})=>(0,h.jsxs)($,{size:e,children:[(0,h.jsx)("path",{d:"M6.5 3.5h7l4 4v13h-11z"}),(0,h.jsx)("path",{d:"M13.5 3.5v4h4M9 12h6M9 15.5h6"})]}),Tr=()=>(0,h.jsx)($,{children:(0,h.jsx)("path",{d:"M12 5v14M5 12h14"})}),Cr=()=>(0,h.jsx)($,{children:(0,h.jsx)("path",{d:"M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"})}),Ar=()=>(0,h.jsxs)($,{children:[(0,h.jsx)("path",{d:"M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"}),(0,h.jsx)("path",{d:"M4.5 4.5V9H9M12 8v4.5l3 2"})]}),Pr=()=>(0,h.jsx)($,{children:(0,h.jsx)("path",{d:"M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"})});var qt=()=>(0,h.jsx)($,{children:(0,h.jsx)("path",{d:"M6 6l12 12M18 6 6 18"})}),Rr=()=>(0,h.jsxs)($,{children:[(0,h.jsx)("circle",{cx:"6",cy:"12",r:".8"}),(0,h.jsx)("circle",{cx:"12",cy:"12",r:".8"}),(0,h.jsx)("circle",{cx:"18",cy:"12",r:".8"})]}),Er=()=>(0,h.jsxs)($,{children:[(0,h.jsx)("path",{d:"M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.4 1.6-2.4h1.8a3.7 3.7 0 0 0 3.7-3.7c0-5-3.8-9-8.5-9Z"}),(0,h.jsx)("circle",{cx:"7.8",cy:"11",r:"1"}),(0,h.jsx)("circle",{cx:"10.5",cy:"7.3",r:"1"}),(0,h.jsx)("circle",{cx:"15",cy:"7.5",r:"1"})]}),st=()=>(0,h.jsx)($,{children:(0,h.jsx)("path",{d:"M14.5 6 8.5 12l6 6"})}),Mr=()=>(0,h.jsxs)($,{children:[(0,h.jsx)("path",{d:"M9.5 4.5h5l-.8 4.6 2.8 2.7v1.7H7.5v-1.7l2.8-2.7-.8-4.6Z"}),(0,h.jsx)("path",{d:"M12 13.5v6"})]}),Dr=()=>(0,h.jsx)($,{children:(0,h.jsx)("path",{d:"m8 10 4 4 4-4"})}),Lr=()=>(0,h.jsxs)($,{children:[(0,h.jsx)("path",{d:"M5 4.5h11l3 3v12H5z"}),(0,h.jsx)("path",{d:"M8 4.5V9h7V4.5M8 19.5v-5h8v5"})]});var Ee=require("react"),Me=require("react/jsx-runtime");function De({label:e,items:t,onClose:r,align:n="right"}){let a=(0,Ee.useRef)(null),s=(0,Ee.useRef)(null),o=(0,Ee.useRef)(r);return o.current=r,(0,Ee.useEffect)(()=>{s.current=document.activeElement,a.current?.querySelector("button")?.focus();let p=c=>{c.target instanceof Node&&a.current?.contains(c.target)!==!0&&o.current()};return document.addEventListener("pointerdown",p,!0),()=>{document.removeEventListener("pointerdown",p,!0),s.current instanceof HTMLElement&&s.current.focus()}},[]),(0,Me.jsx)("div",{ref:a,className:"art-menu","data-align":n,role:"menu","aria-label":e,onKeyDown:p=>{let c=[...a.current?.querySelectorAll("button")??[]],y=c.findIndex(b=>b===document.activeElement);p.key==="Escape"?(p.preventDefault(),p.stopPropagation(),o.current()):p.key==="ArrowDown"?(p.preventDefault(),c[(y+1)%c.length]?.focus()):p.key==="ArrowUp"&&(p.preventDefault(),c[(y-1+c.length)%c.length]?.focus())},children:t.map(p=>(0,Me.jsxs)("div",{role:"none",children:[p.separatorBefore===!0?(0,Me.jsx)("hr",{}):null,(0,Me.jsxs)("button",{type:"button",role:"menuitem",onClick:()=>{r(),p.run()},children:[p.icon,p.label]})]},p.id))})}var we=require("react");var lt=require("react/jsx-runtime");function ct({content:e,designCss:t,title:r,frameTitle:n}){let[a,s]=(0,we.useState)(null),[o,p]=(0,we.useState)(!1),c=(0,we.useRef)(0);return(0,we.useEffect)(()=>{c.current=0,p(!1);let y=URL.createObjectURL(new Blob([ot(e,t,r)],{type:"text/html"}));return s(y),()=>URL.revokeObjectURL(y)},[e,t,r]),o?(0,lt.jsx)("div",{className:"art-center",role:"alert",children:r}):a===null?null:(0,lt.jsx)("iframe",{className:"art-frame",title:n,sandbox:xr,referrerPolicy:"no-referrer",src:a,onLoad:()=>{c.current+=1,c.current>1&&p(!0)}},a)}function Ir({value:e,readOnly:t,label:r,onChange:n,onSave:a,onSelectionText:s}){let o=p=>{t||s?.(p.value.slice(p.selectionStart,p.selectionEnd))};return(0,lt.jsx)("textarea",{className:"art-source","aria-label":r,spellCheck:!1,readOnly:t,value:e,onChange:p=>{n(p.target.value),s?.("")},onSelect:p=>o(p.currentTarget),onMouseUp:p=>o(p.currentTarget),onKeyUp:p=>o(p.currentTarget),onKeyDown:p=>{if((p.ctrlKey||p.metaKey)&&p.key.toLowerCase()==="s"){p.preventDefault(),a();return}if(p.key==="Tab"&&!p.shiftKey&&!t){p.preventDefault();let c=p.currentTarget,y=c.selectionStart,b=c.selectionEnd,u=`${e.slice(0,y)}  ${e.slice(b)}`;n(u),requestAnimationFrame(()=>c.setSelectionRange(y+2,y+2))}}})}var ja=2e3;function Hr(e,t=ja){let r=e.replace(/\r\n/g,`
`).replace(/[ \t]+\n/g,`
`).replace(/\n{3,}/g,`

`).trim();return r.length<=t?{text:r,truncated:!1}:{text:r.slice(0,t).trimEnd(),truncated:!0}}function qr(e,t){let r=t.quote.trim(),n=r===""?"":`Selected text:
"""
${r}
"""
`;return e("agent.request",{title:t.title,address:E(t.address),id:t.id,scope:t.address.scope,workspace:t.workspace,version:t.version,selection:n,prompt:t.prompt.trim()})}var i=require("react/jsx-runtime");function $a({quote:e,label:t,askLabel:r,dismissLabel:n,onAsk:a,onDismiss:s}){return(0,i.jsxs)("div",{className:"art-selection-bar",role:"toolbar","aria-label":t,children:[(0,i.jsx)("span",{className:"art-selection-quote",title:e,children:e}),(0,i.jsx)("button",{type:"button",className:"art-button art-button-primary",onClick:a,children:r}),(0,i.jsx)("button",{type:"button",className:"art-icon-button","aria-label":n,title:n,onClick:s,children:(0,i.jsx)(qt,{})})]})}function zr({label:e,closeLabel:t,overlay:r,onClose:n,children:a}){let s=(0,g.useRef)(null);return(0,g.useEffect)(()=>{(s.current?.querySelector("[data-drawer-initial]")??s.current?.querySelector("button"))?.focus()},[e]),(0,g.useEffect)(()=>{if(!r)return;let o=p=>{let c=s.current;if(c===null||p.target instanceof Node&&c.contains(p.target))return;(c.querySelector("[data-drawer-initial]")??c.querySelector("button"))?.focus()};return document.addEventListener("focusin",o),()=>document.removeEventListener("focusin",o)},[r]),(0,i.jsxs)("div",{className:"art-drawer-layer","data-overlay":r?"true":void 0,children:[r?(0,i.jsx)("div",{className:"art-drawer-scrim","aria-hidden":"true",onPointerDown:n}):null,(0,i.jsxs)("aside",{ref:s,className:"art-drawer",role:"dialog","aria-modal":r?"true":void 0,"aria-label":e,onKeyDown:o=>{if(o.key==="Escape"){o.preventDefault(),o.stopPropagation(),n();return}if(o.key!=="Tab"||!r)return;let p=[...s.current?.querySelectorAll("button:not(:disabled), textarea:not(:disabled), input:not(:disabled), select:not(:disabled), a[href]")??[]],c=p[0],y=p[p.length-1];c===void 0||y===void 0||(o.shiftKey&&document.activeElement===c?(o.preventDefault(),y.focus()):!o.shiftKey&&document.activeElement===y&&(o.preventDefault(),c.focus()))},children:[(0,i.jsxs)("div",{className:"art-drawer-head",children:[(0,i.jsx)("h2",{children:e}),(0,i.jsx)("button",{type:"button",className:"art-icon-button","aria-label":t,title:t,onClick:n,children:(0,i.jsx)(qt,{})})]}),(0,i.jsx)("div",{className:"art-drawer-body",children:a})]})]})}function zt(e){let t=e.useTabInfo(),r=fe(t.tab.contentId??t.tab.navigation?.address),n=e.useWorkspaces(a=>a.items.find(s=>r?.scope==="workspace"&&s.workspaceId===r.workspaceId)?.title);return r===void 0?(0,i.jsx)("section",{className:"art-root",children:(0,i.jsx)("p",{children:e.t("error.notFound")})}):(0,i.jsx)(jr,{t:e.t,address:r,useTabInfo:e.useTabInfo,onBack:t.tab.actions?.close,workspaceName:n},E(r))}function Or({t:e,address:t,onBack:r,workspaceName:n}){return(0,i.jsx)(jr,{t:e,address:t,onBack:r,workspaceName:n,back:!0},E(t))}function jr({t:e,address:t,useTabInfo:r,onBack:n,workspaceName:a,back:s}){let{model:o,state:p}=br(t),{payload:c,draft:y,saving:b,conflict:u,failure:N}=p,f=o.where,v=t.id,[F,Z]=(0,g.useState)("preview"),[S,A]=(0,g.useState)(null),[k,K]=(0,g.useState)(!1),[ee,ce]=(0,g.useState)(null),[Ie,Ne]=(0,g.useState)(!1),[G,z]=(0,g.useState)(!1),[P,ae]=(0,g.useState)(null),[ne,Se]=(0,g.useState)(null),[gt,Te]=(0,g.useState)(!1),[be,_e]=(0,g.useState)(""),[m,D]=(0,g.useState)(null),[V,B]=(0,g.useState)(!1),[R,de]=(0,g.useState)(null),[he,Y]=(0,g.useState)(!1),[Ue,pe]=(0,g.useState)(null),[bt,He]=(0,g.useState)(!1),[Yt,qe]=(0,g.useState)(null),te=(0,g.useRef)(0),ht=(0,g.useRef)(null),ze=(0,g.useRef)(null),yt=(0,g.useRef)(null),Xt=(0,g.useRef)(null),vt=(0,g.useRef)(null),xt=(0,g.useRef)(!1),Ke=pr(v),Qt=r?.();(0,g.useEffect)(()=>{c!==null&&Ke>c.version&&y===null&&!b&&!u&&qe(Ke),o.externalVersion(Ke)},[Ke,o,b,c?.version,y,u]),(0,g.useEffect)(()=>{u&&qe(null)},[u]);let sa=c!==null,ue=(0,g.useCallback)(()=>{let l=ze.current,x=l===null?0:l.clientWidth;K(x>0?x<=600:window.innerWidth<=600)},[]);(0,g.useEffect)(()=>{let l=ze.current;if(l===null)return;ue();let x=new ResizeObserver(ue);return x.observe(l),window.addEventListener("resize",ue),()=>{x.disconnect(),window.removeEventListener("resize",ue)}},[sa,ue]);let ye=(0,g.useCallback)(l=>{o.getSnapshot().draft!==null||o.getSnapshot().saving?D({run:l}):l()},[o]),wt=(0,g.useCallback)(()=>{++te.current,z(!1),ae(null),de(null),Y(!1),pe(null),He(!1),qe(null)},[]),Ge=(0,g.useCallback)(async()=>{wt(),await o.discardAndReload()},[o,wt]);(0,g.useEffect)(()=>Qt?.tab.actions?.bindCommands({refresh:()=>ye(Ge)}),[Qt?.tab.actions,ye,Ge]),(0,g.useEffect)(()=>{if(c?.manifest.type!=="doc"||y===null||u||b)return;let l=setTimeout(()=>void o.save(),1200);return()=>clearTimeout(l)},[y,u,b,o,c?.manifest.type]),(0,g.useEffect)(()=>{if(m===null)return;let l=document.activeElement;return ht.current?.querySelector("button")?.focus(),()=>{l instanceof HTMLElement&&l.isConnected&&l.focus()}},[m]),(0,g.useEffect)(()=>{if(S!=="history"||c===null)return;let l=new AbortController;return ce(null),Ne(!1),M.history(f,v,l.signal).then(x=>{l.signal.aborted||ce(x.versions)}).catch(()=>{l.signal.aborted||Ne(!0)}),()=>l.abort()},[S,c?.version,o]),(0,g.useEffect)(()=>()=>{++te.current},[]),(0,g.useEffect)(()=>{if(S!==null){xt.current=!0;return}if(!xt.current)return;xt.current=!1;let l=vt.current;(l!==null&&l.isConnected?l:yt.current)?.focus()},[S]),(0,g.useEffect)(()=>{if(S===null)return;let l=x=>{x.key!=="Escape"||x.defaultPrevented||(S==="history"&&(++te.current,z(!1),ae(null)),A(null))};return document.addEventListener("keydown",l),()=>document.removeEventListener("keydown",l)},[S]);let kt=()=>{S==="history"&&(++te.current,z(!1),ae(null)),Y(!1),A(null)},Nt=()=>{ue();let l=document.activeElement;vt.current=l instanceof HTMLElement&&l.isConnected?l:Xt.current,++te.current,z(!1),ae(null),A("history")},Jt=async l=>{let x=++te.current;if(He(!1),pe(null),l!==(P?.version??c?.version)&&(de(null),Y(!1),A(L=>L==="request"?null:L)),l===c?.version){z(!1),ae(null);return}z(!0);try{let L=await M.get(f,v,l);x===te.current&&ae(L)}catch(L){x===te.current&&q(e(I(H(L))))}finally{x===te.current&&z(!1)}},Zt=async()=>G?null:P!==null?P.version:await o.save()?o.getSnapshot().payload?.version??null:null,Ye=async l=>{if(!V){B(!0);try{let x=await Zt();if(x===null)return;if(l==="print")wr((await M.printable(f,v,x)).html);else{let L=await M.exportFile(f,v,l,x);lr(L),q(e("export.done",{name:L.fileName,path:L.path}))}}catch(x){q(e(I(H(x))))}finally{B(!1)}}},la=async()=>{be.trim()===""||b||await o.save(be.trim())&&Te(!1)},ca=async()=>{if(P===null||V)return;let l=P.version;ye(async()=>{B(!0);try{let x=await M.restore(f,v,l,o.getSnapshot().payload?.version??0);xe(v,x.manifest.version),oe(),wt(),await o.load()}catch(x){q(e(I(H(x))))}finally{B(!1)}})},er=async l=>{try{return await navigator.clipboard.writeText(l),q(e("action.copied")),!0}catch{return q(e("action.copyFailed")),!1}},St=async(l="",x=!1)=>{if(V||u||G)return;ue();let L=document.activeElement,Xe=L instanceof HTMLElement&&L.isConnected?L:yt.current;B(!0);try{let Pt=await Zt();if(Pt===null)return;de(Oe=>Oe!==null&&Oe.version===Pt?{...Oe,quote:l.trim()===""?Oe.quote:l,truncated:l.trim()===""?Oe.truncated:x}:{prompt:"",quote:l,truncated:x,version:Pt}),Y(!1),vt.current=l.trim()===""?Xe:ze.current?.querySelector(".art-prose, .art-source")??Xe,pe(null),A("request")}finally{B(!1)}},tr=(0,g.useCallback)(l=>{let x=Hr(l);pe(x.text===""?null:x)},[]),da=async()=>{if(bt){He(!1);return}if(c!==null){try{let l=await M.history(f,v);ce(l.versions)}catch(l){q(e(I(H(l))));return}ue(),He(!0)}},pa=[...Rt[c?.manifest.type??"page"].map(l=>({id:`export-${l}`,label:e(`export.${l}`),run:()=>void Ye(l)})),{id:"export-print",label:e("export.print"),run:()=>void Ye("print")}];if(c===null)return(0,i.jsx)("section",{className:"art-root","data-dsh-artifacts":"",ref:ze,children:(0,i.jsxs)("div",{className:"art-center",role:N===void 0?"status":"alert",children:[(0,i.jsx)("p",{children:e(N===void 0?"empty.loading":I(N))}),N===void 0?null:(0,i.jsx)("button",{className:"art-button",onClick:()=>void o.load(),children:e("action.retry")}),n===void 0?null:(0,i.jsx)("button",{className:"art-button",onClick:n,children:e("tab.close")})]})});let Tt=P?.content??y??c.content,Ct=P!==null,rr=P?.version??c.version,ua=e(b?"tab.saving":u?"tab.conflictTitle":G?"empty.loading":P!==null?"tab.readOnly":N!==void 0?"tab.saveFailed":y!==null?"tab.unsaved":"tab.saved"),fa=u||N!==void 0&&!b?"error":b?"warn":void 0,ar=t.scope==="workspace"?a??t.workspaceId:e("scope.library"),At=R===null?"":qr(e,{title:c.manifest.title,address:t,id:v,version:R.version,workspace:ar,quote:R.quote,prompt:R.prompt}),ma=async()=>{R===null||R.prompt.trim()===""||At===""||await er(At)&&Y(!0)};return(0,i.jsxs)("section",{className:"art-root","data-dsh-artifacts":"","data-artifact-id":v,"aria-busy":V,ref:ze,children:[(0,i.jsxs)("header",{className:"art-header art-editor-header",children:[(0,i.jsxs)("div",{className:"art-heading",children:[!s||n===void 0?null:(0,i.jsx)("button",{className:"art-icon-button","aria-label":e("action.back"),title:e("action.back"),onClick:()=>ye(n),children:(0,i.jsx)(st,{})}),(0,i.jsxs)("div",{className:"art-identity",children:[(0,i.jsx)("h1",{className:"art-title",title:c.manifest.title,children:c.manifest.title}),(0,i.jsxs)("div",{className:"art-meta",children:[(0,i.jsxs)("span",{className:"art-meta-text",children:[ar,t.scope==="workspace"?` \xB7 ${e("scope.workspace")}`:null," \xB7"]}),(0,i.jsxs)("button",{type:"button",className:"art-version-button","aria-label":e("tab.versionPicker"),"aria-haspopup":"menu","aria-expanded":bt,onClick:()=>void da(),children:[e("gallery.version",{version:rr}),(0,i.jsx)(Dr,{})]}),(0,i.jsx)("span",{className:"art-meta-text",children:" \xB7 "}),(0,i.jsx)("span",{className:"art-save-status","data-tone":fa,"aria-live":"polite",children:ua})]})]})]}),(0,i.jsxs)("div",{className:"art-actions art-editor-actions",children:[c.manifest.type!=="page"?null:(0,i.jsxs)("div",{className:"art-segment",role:"group","aria-label":e("tab.mode"),children:[(0,i.jsx)("button",{type:"button","aria-pressed":F==="preview",onClick:()=>{Z("preview"),pe(null)},children:e("tab.preview")}),(0,i.jsx)("button",{type:"button","aria-pressed":F==="source",onClick:()=>{Z("source"),pe(null)},children:e("tab.source")})]}),y===null||Ct?null:(0,i.jsx)("button",{className:"art-icon-button","aria-label":e("tab.save"),title:e("tab.save"),disabled:u,onClick:()=>void o.save(),children:(0,i.jsx)(Lr,{})}),(0,i.jsx)("button",{ref:Xt,className:"art-icon-button","aria-label":e("tab.history"),title:e("tab.history"),"aria-pressed":S==="history",onClick:()=>{S==="history"?kt():Nt()},children:(0,i.jsx)(Ar,{})}),k?null:(0,i.jsxs)("button",{className:"art-button","aria-label":e("tab.export"),"aria-haspopup":"menu","aria-expanded":ne==="export",disabled:V||G,onClick:()=>Se(ne==="export"?null:"export"),children:[(0,i.jsx)(Pr,{}),e("tab.export")]}),(0,i.jsx)("button",{ref:yt,type:"button",className:"art-button art-button-primary art-request-button","aria-haspopup":"dialog",disabled:V||u||G,onClick:()=>void St(),children:e("agent.ask")}),(0,i.jsx)("button",{className:"art-icon-button","aria-label":e("gallery.more"),title:e("gallery.more"),"aria-haspopup":"menu","aria-expanded":ne==="more",onClick:()=>Se(ne==="more"?null:"more"),children:(0,i.jsx)(Rr,{})})]}),bt?(0,i.jsx)(De,{label:e("tab.versionPicker"),align:"left",onClose:()=>He(!1),items:[...(ee??[]).map(l=>({id:`version-${l.version}`,label:`${e("tab.versionOf",{version:l.version})}${l.version===c.version?` \xB7 ${e("tab.currentVersion")}`:""}`,run:()=>void Jt(l.version)})),{id:"versions-all",label:e("tab.allVersions"),separatorBefore:!0,run:Nt}]}):null,ne==="export"?(0,i.jsx)(De,{label:e("tab.export"),onClose:()=>Se(null),items:[...Rt[c.manifest.type].map(l=>({id:l,label:e(`export.${l}`),run:()=>void Ye(l)})),{id:"print",label:e("export.print"),separatorBefore:!0,run:()=>void Ye("print")}]}):null,ne==="more"?(0,i.jsx)(De,{label:e("gallery.more"),onClose:()=>Se(null),items:[...k?pa:[],{id:"rename",label:e("tab.rename"),separatorBefore:k,run:()=>{_e(c.manifest.title),Te(!0)}},{id:"reload",label:e("tab.reload"),run:()=>ye(Ge)},{id:"agent",label:e("agent.edit"),run:()=>void St()},{id:"delete",label:e("tab.delete"),separatorBefore:!0,run:()=>{window.confirm(e("tab.deleteConfirm",{title:c.manifest.title}))&&ye(async()=>{try{await M.remove(f,v),oe(),n?.()}catch(l){q(e(I(H(l))))}})}}]}):null]}),gt?(0,i.jsxs)("form",{className:"art-inline-form",onSubmit:l=>{l.preventDefault(),la()},children:[(0,i.jsx)("input",{"aria-label":e("tab.rename"),value:be,maxLength:120,autoFocus:!0,onChange:l=>_e(l.target.value),onKeyDown:l=>{l.key==="Escape"&&Te(!1)}}),(0,i.jsx)("button",{className:"art-button",disabled:b||u,children:e("tab.save")}),(0,i.jsx)("button",{className:"art-button",type:"button",onClick:()=>Te(!1),children:e("create.cancel")})]}):null,Yt===null?null:(0,i.jsxs)("div",{className:"art-bar",role:"status",children:[(0,i.jsx)("span",{children:e("tab.agentUpdate",{version:Yt})}),(0,i.jsxs)("span",{className:"art-bar-actions",children:[(0,i.jsx)("button",{className:"art-button",onClick:()=>{qe(null),Nt()},children:e("tab.viewHistory")}),(0,i.jsx)("button",{className:"art-button",onClick:()=>qe(null),children:e("tab.dismiss")})]})]}),u?(0,i.jsxs)("div",{className:"art-bar","data-tone":"warn",role:"alert",children:[(0,i.jsxs)("span",{className:"art-bar-text",children:[(0,i.jsx)("strong",{children:e("tab.conflictTitle")}),(0,i.jsx)("span",{children:e("tab.conflictHint")})]}),(0,i.jsxs)("span",{className:"art-bar-actions",children:[(0,i.jsx)("button",{className:"art-button",onClick:()=>void er(y??""),children:e("tab.copyDraft")}),(0,i.jsx)("button",{className:"art-button",onClick:()=>ye(Ge),children:e("tab.discardReload")})]})]}):null,!u&&N!==void 0?(0,i.jsxs)("div",{className:"art-bar",role:"alert",children:[(0,i.jsx)("span",{children:e(I(N))}),(0,i.jsx)("button",{className:"art-button",onClick:()=>void o.save(),children:e("action.retry")})]}):null,P===null?null:(0,i.jsxs)("div",{className:"art-bar",role:"status",children:[(0,i.jsx)("span",{children:e("tab.viewingOld",{version:P.version,current:c.version})}),(0,i.jsxs)("span",{className:"art-bar-actions",children:[(0,i.jsx)("button",{className:"art-button",onClick:()=>{++te.current,z(!1),ae(null),de(null),Y(!1),pe(null),A(l=>l==="request"?null:l)},children:e("tab.backToCurrent")}),(0,i.jsx)("button",{className:"art-button",disabled:V,onClick:()=>void ca(),children:e("tab.restoreThis")})]})]}),(0,i.jsxs)("div",{className:"art-body",children:[(0,i.jsxs)("div",{className:"art-stage",children:[Ue===null||S!==null?null:(0,i.jsx)($a,{quote:Ue.text,label:e("agent.ask"),askLabel:e("agent.ask"),dismissLabel:e("tab.dismiss"),onAsk:()=>void St(Ue.text,Ue.truncated),onDismiss:()=>pe(null)}),c.manifest.type==="page"?F==="preview"?(0,i.jsx)(ct,{content:Tt,designCss:c.designCss,title:c.manifest.title,frameTitle:e("tab.frameTitle",{title:c.manifest.title})}):(0,i.jsx)(Ir,{value:Tt,readOnly:Ct,label:e("tab.source"),onChange:l=>o.edit(l),onSave:()=>void o.save(),onSelectionText:tr}):(0,i.jsx)(nt,{markdown:Tt,revision:`${P?.version??0}:${p.revision}`,editable:!Ct&&!u,label:c.manifest.title,loadingLabel:e("empty.loading"),failedLabel:e("error.generic"),t:e,onChange:l=>o.edit(l),onSave:()=>void o.save(),onSelectionText:tr})]}),S!=="request"||R===null?null:(0,i.jsx)(zr,{label:e("agent.ask"),closeLabel:e("drawer.closeRequest"),overlay:k,onClose:kt,children:(0,i.jsxs)("div",{className:"art-request art-request-body",children:[(0,i.jsxs)("div",{className:"art-request-context","aria-label":e("agent.context"),children:[(0,i.jsx)("span",{className:"art-badge","data-scope":t.scope,children:e(`scope.${t.scope}`)}),(0,i.jsx)("span",{className:"art-request-dot","aria-hidden":"true",children:"\xB7"}),(0,i.jsx)("span",{className:"art-request-title",title:c.manifest.title,children:c.manifest.title}),(0,i.jsx)("span",{className:"art-request-dot","aria-hidden":"true",children:"\xB7"}),(0,i.jsx)("span",{className:"art-request-version",children:e("gallery.version",{version:R.version})})]}),R.quote===""?null:(0,i.jsxs)("div",{className:"art-quote",children:[(0,i.jsxs)("div",{className:"art-quote-head",children:[(0,i.jsx)("span",{children:e("agent.quote")}),(0,i.jsx)("button",{type:"button",className:"art-quote-remove",onClick:()=>{de({...R,quote:"",truncated:!1}),Y(!1)},children:e("agent.removeQuote")})]}),(0,i.jsx)("blockquote",{children:R.quote}),R.truncated?(0,i.jsx)("p",{className:"art-field-hint",children:e("agent.truncated")}):null]}),(0,i.jsxs)("label",{className:"art-field",children:[e("agent.promptLabel"),(0,i.jsx)("textarea",{"data-drawer-initial":!0,value:R.prompt,placeholder:e("agent.promptPlaceholder"),onChange:l=>{de({...R,prompt:l.target.value}),Y(!1)}})]}),R.prompt.trim()===""?(0,i.jsx)("p",{className:"art-field-hint",children:e("agent.promptRequired")}):null,(0,i.jsx)("p",{className:"art-note",children:e("agent.copyHint")}),he?(0,i.jsx)("p",{className:"art-note",role:"status",children:e("agent.copiedHint")}):null,(0,i.jsxs)("details",{className:"art-request-preview",children:[(0,i.jsx)("summary",{children:e("agent.preview")}),(0,i.jsx)("pre",{children:At})]}),(0,i.jsx)("div",{className:"art-form-actions",children:(0,i.jsx)("button",{type:"button",className:"art-button art-button-primary",disabled:R.prompt.trim()==="",onClick:()=>void ma(),children:e("agent.copyRequest")})})]})}),S!=="history"?null:(0,i.jsx)(zr,{label:e("history.title"),closeLabel:e("history.close"),overlay:k,onClose:kt,children:(0,i.jsx)(Sr,{t:e,versions:ee,failed:Ie,current:c.version,selected:P?.version??c.version,onSelect:l=>void Jt(l)})})]}),c.manifest.type!=="page"?null:(0,i.jsxs)("footer",{className:"art-status",children:[(0,i.jsx)("span",{children:e("tab.manualSave")}),(0,i.jsx)("span",{children:e("tab.outputVersion",{version:rr})})]}),m===null?null:(0,i.jsx)("div",{className:"art-dialog-shade",children:(0,i.jsxs)("div",{className:"art-dialog",role:"alertdialog","aria-modal":"true","aria-label":e("tab.leaveTitle"),"aria-describedby":`leave-hint-${v}`,ref:ht,onKeyDown:l=>{if(l.key==="Escape"&&(l.stopPropagation(),D(null)),l.key==="Tab"){let x=[...ht.current?.querySelectorAll("button:not(:disabled)")??[]],L=x.findIndex(Xe=>Xe===document.activeElement);l.preventDefault(),x[(L+(l.shiftKey?-1:1)+x.length)%x.length]?.focus()}},children:[(0,i.jsx)("h2",{children:e("tab.leaveTitle")}),(0,i.jsx)("p",{id:`leave-hint-${v}`,children:e(u?"tab.conflictHint":"tab.leaveHint")}),N===void 0?null:(0,i.jsx)("p",{role:"alert",children:e(I(N))}),(0,i.jsxs)("div",{className:"art-form-actions",children:[(0,i.jsx)("button",{className:"art-button",disabled:V,onClick:()=>D(null),children:e("create.cancel")}),(0,i.jsx)("button",{className:"art-button",disabled:b||V,onClick:()=>{let l=m.run;D(null),o.discardAndReload().then(l)},children:e("tab.discardContinue")}),(0,i.jsx)("button",{className:"art-button art-button-primary",disabled:u||V,onClick:async()=>{B(!0);let l=await o.save();if(B(!1),l){let x=m.run;D(null),await x()}},children:e("tab.saveContinue")})]})]})})]})}var $r=wa(require("react"),1),ke=require("react/jsx-runtime"),dt=class extends $r.default.Component{constructor(t){super(t),this.state={failed:!1}}static getDerivedStateFromError(){return{failed:!0}}render(){return this.state.failed?(0,ke.jsx)("section",{className:"art-root","data-dsh-artifacts":"",children:(0,ke.jsxs)("div",{className:"art-center",role:"alert",children:[(0,ke.jsx)("p",{className:"art-center-title",children:this.props.title}),(0,ke.jsx)("p",{className:"art-center-hint",children:this.props.hint}),(0,ke.jsx)("button",{type:"button",className:"art-button",onClick:()=>window.location.reload(),children:this.props.reloadLabel})]})}):this.props.children}};var Fr=require("react");var Le={sidebarRight:null};var T=require("react/jsx-runtime");function Fa(e){if(e===null||typeof e!="object")return null;let t={...e},{id:r,type:n,title:a,version:s,workspaceId:o}=t;if(t.kind!=="artifact"||typeof r!="string"||typeof a!="string"||typeof s!="number"||n!=="page"&&n!=="doc")return null;let p=or(r);return p===void 0?null:p==="workspace"?typeof o!="string"||o===""?null:{id:r,type:n,title:a,version:s,address:{scope:p,workspaceId:o,id:r}}:{id:r,type:n,title:a,version:s,address:{scope:p,id:r}}}function Va(e){return Array.isArray(e)?e.map(t=>{if(t===null||typeof t!="object")return"";let r={...t};return r.type==="text"&&typeof r.text=="string"?r.text:""}).filter(t=>t!=="").join(`
`).trim():""}function Ot({t:e,phase:t,toolName:r,block:n}){let a=t==="result"&&n?.isError!==!0?Fa(n?.meta):null;if((0,Fr.useEffect)(()=>{a!==null&&(ve(a.id,a.title),xe(a.id,a.version),oe())},[a?.id,a?.version,a?.title]),t!=="result")return(0,T.jsxs)("div",{className:"art-card","data-artifact-card":"working",children:[(0,T.jsx)("span",{className:"art-card-icon",children:(0,T.jsx)(se,{})}),(0,T.jsx)("span",{className:"art-card-status",role:"status",children:e("card.working")}),(0,T.jsx)("span",{})]});if(n?.isError===!0)return(0,T.jsxs)("div",{className:"art-card","data-artifact-card":"error",children:[(0,T.jsx)("span",{className:"art-card-icon",children:(0,T.jsx)(se,{})}),(0,T.jsxs)("span",{className:"art-card-text",children:[(0,T.jsx)("span",{className:"art-card-title",children:e("card.failed")}),(0,T.jsx)("span",{className:"art-card-status","data-tone":"error",children:Va(n.content)})]}),(0,T.jsx)("span",{})]});if(a===null)return(0,T.jsxs)("div",{className:"art-card","data-artifact-card":"missing",children:[(0,T.jsx)("span",{className:"art-card-icon",children:(0,T.jsx)(se,{})}),(0,T.jsx)("span",{className:"art-card-status",children:e("card.missing")}),(0,T.jsx)("span",{})]});let s=E(a.address);return(0,T.jsxs)("div",{className:"art-card","data-artifact-card":"ready","data-artifact-id":a.id,children:[(0,T.jsx)("span",{className:"art-card-icon",children:a.type==="page"?(0,T.jsx)(se,{}):(0,T.jsx)(ge,{})}),(0,T.jsxs)("span",{className:"art-card-text",children:[(0,T.jsx)("span",{className:"art-card-title",title:a.title,children:a.title}),(0,T.jsxs)("span",{className:"art-card-sub",children:[(0,T.jsx)("span",{children:e(r==="artifact_update"?"card.updated":"card.created")}),(0,T.jsx)("span",{children:"\xB7"}),(0,T.jsx)("span",{children:e(`type.${a.type}`)}),(0,T.jsx)("span",{className:"art-badge","data-scope":a.address.scope,children:e(`scope.${a.address.scope}`)}),(0,T.jsx)("span",{children:e("gallery.version",{version:a.version})})]})]}),(0,T.jsx)("button",{type:"button",className:"art-button",onClick:()=>Le.sidebarRight?.openResource(s),children:e("card.open")})]})}var jt=require("react/jsx-runtime"),$t="artifacts";function Vr({t:e}){return(0,jt.jsx)("button",{type:"button",className:"art-composer","aria-label":e("composer.label"),title:e("composer.label"),onClick:()=>Le.sidebarRight?.openTab($t),children:(0,jt.jsx)(Re,{})})}var C=require("react");var Br=require("react");function Wr({sessionId:e,useSessions:t,useWorkspaces:r}){let n=r(s=>s.items),a=t(s=>s.byId[e]);return(0,Br.useMemo)(()=>{let s=typeof a?.cwd=="string"?a.cwd:null,o=n.find(p=>p.sessionIds?.includes(e))??n.find(p=>s!==null&&(s===p.path||s.startsWith(`${p.path}/`)))??null;return{root:s??o?.path??null,workspaceId:o?.workspaceId??null}},[n,a,e])}var le=require("react");var w=require("react/jsx-runtime"),Ba=["primary","accent","surface","text","muted"],Wa=["sm","md","lg"],_a=e=>`<!doctype html><html><head><style>
body { margin: 0; padding: 20px; font-family: var(--artifact-font-family); background: var(--artifact-color-surface); color: var(--artifact-color-text); }
h2 { margin: 0 0 6px; font-size: var(--artifact-font-size-4); letter-spacing: -0.02em; }
p { margin: 0 0 14px; color: var(--artifact-color-muted); }
.row { display: flex; gap: 8px; align-items: center; }
button { padding: 8px 14px; border: 0; border-radius: var(--artifact-radius-md); background: var(--artifact-color-primary); color: #fff; font: inherit; }
.tag { padding: 3px 8px; border-radius: var(--artifact-radius-sm); background: var(--artifact-color-accent); color: #fff; font-size: 12px; }
code { font-family: var(--artifact-font-mono); font-size: 12px; }
</style></head><body><h2>${e("design.previewHeading")}</h2><p>${e("design.previewBody")}</p>
<div class="row"><button>${e("design.previewButton")}</button><span class="tag">+12%</span><code>var(--artifact-color-primary)</code></div></body></html>`;function Ua(e){return/^#[0-9a-f]{6}$/i.test(e)}function _r({t:e,workspaceId:t}){let[r,n]=(0,le.useState)(null),[a,s]=(0,le.useState)(null),[o,p]=(0,le.useState)(!1),[c,y]=(0,le.useState)(!1);(0,le.useEffect)(()=>{let f=new AbortController;return M.designSystem(t,f.signal).then(v=>{n(v),s(v.tokens)}).catch(()=>{f.signal.aborted||p(!0)}),()=>f.abort()},[t]);let b=(0,le.useMemo)(()=>a===null?"":ir(a),[a]);if(o)return(0,w.jsx)("p",{className:"art-note",children:e("error.generic")});if(r===null||a===null)return(0,w.jsx)("p",{className:"art-note",children:e("empty.loading")});let u=async f=>{y(!0);try{let v=await M.saveDesignSystem({scope:f,workspaceId:t},a);n(v),s(v.tokens),q(e("design.saved"))}catch(v){q(e(I(H(v))))}finally{y(!1)}},N=async()=>{if(t!==null){y(!0);try{let f=await M.clearDesignSystem(t);n(f),s(f.tokens)}catch(f){q(e(I(H(f))))}finally{y(!1)}}};return(0,w.jsxs)("div",{className:"art-design",children:[(0,w.jsxs)("p",{className:"art-design-source",children:[e("design.hint")," ",e(`design.source.${r.source}`)]}),(0,w.jsxs)("div",{className:"art-design-group",children:[(0,w.jsx)("h3",{children:e("design.preview")}),(0,w.jsx)("div",{className:"art-design-preview",style:{height:150,display:"flex"},children:(0,w.jsx)(ct,{content:_a(e),designCss:b,title:a.name,frameTitle:e("design.preview")})})]}),(0,w.jsxs)("label",{className:"art-field",children:[e("design.name"),(0,w.jsx)("input",{type:"text",value:a.name,maxLength:80,onChange:f=>s({...a,name:f.target.value})})]}),(0,w.jsxs)("div",{className:"art-design-group",children:[(0,w.jsx)("h3",{children:e("design.colors")}),(0,w.jsx)("div",{className:"art-swatches",children:Ba.map(f=>(0,w.jsxs)("div",{className:"art-swatch",children:[(0,w.jsx)("input",{type:"color","aria-label":e(`design.color.${f}`),value:Ua(a.colors[f])?a.colors[f]:"#000000",onChange:v=>s({...a,colors:{...a.colors,[f]:v.target.value}})}),(0,w.jsxs)("span",{className:"art-swatch-text",children:[e(`design.color.${f}`),(0,w.jsx)("input",{type:"text","aria-label":`${e(`design.color.${f}`)} CSS`,value:a.colors[f],onChange:v=>s({...a,colors:{...a.colors,[f]:v.target.value}})})]})]},f))})]}),(0,w.jsxs)("div",{className:"art-design-group",children:[(0,w.jsx)("h3",{children:e("design.type")}),(0,w.jsxs)("label",{className:"art-field",children:[e("design.font"),(0,w.jsx)("input",{type:"text",value:a.typography.fontFamily,onChange:f=>s({...a,typography:{...a.typography,fontFamily:f.target.value}})})]}),(0,w.jsxs)("label",{className:"art-field",children:[e("design.mono"),(0,w.jsx)("input",{type:"text",value:a.typography.monoFamily,onChange:f=>s({...a,typography:{...a.typography,monoFamily:f.target.value}})})]})]}),(0,w.jsxs)("div",{className:"art-design-group",children:[(0,w.jsx)("h3",{children:e("design.radius")}),(0,w.jsx)("div",{className:"art-radius-row",children:Wa.map(f=>(0,w.jsxs)("label",{children:[e(`design.radius.${f}`),(0,w.jsx)("input",{type:"number",min:0,max:64,value:a.radius[f],onChange:v=>s({...a,radius:{...a.radius,[f]:Number(v.target.value)||0}})})]},f))})]}),(0,w.jsxs)("label",{className:"art-field",children:[e("design.notes"),(0,w.jsx)("textarea",{value:a.notes,maxLength:4e3,onChange:f=>s({...a,notes:f.target.value})}),(0,w.jsx)("span",{className:"art-field-hint",children:e("design.notesHint")})]}),(0,w.jsxs)("div",{className:"art-design-actions",children:[t===null?null:(0,w.jsx)("button",{type:"button",className:"art-button art-button-primary",disabled:c,onClick:()=>void u("workspace"),children:e("design.saveWorkspace")}),(0,w.jsx)("button",{type:"button",className:t===null?"art-button art-button-primary":"art-button",disabled:c,onClick:()=>void u("library"),children:e("design.saveLibrary")}),r.source==="workspace"&&t!==null?(0,w.jsx)("button",{type:"button",className:"art-button",disabled:c,onClick:()=>void N(),children:e("design.clear")}):null]})]})}var Ur=require("react"),Kr="dsh-artifacts.pins";function Ka(){if(typeof window>"u")return new Set;try{let e=window.localStorage.getItem(Kr);if(e===null)return new Set;let t=JSON.parse(e);return Array.isArray(t)?new Set(t.filter(r=>typeof r=="string")):new Set}catch{return new Set}}var pt=Ka(),Ft=new Set;function Ga(e){return Ft.add(e),()=>Ft.delete(e)}function Gr(){return(0,Ur.useSyncExternalStore)(Ga,()=>pt,()=>pt)}function Yr(e){let t=new Set(pt);t.has(e)?t.delete(e):t.add(e),pt=t;try{window.localStorage.setItem(Kr,JSON.stringify([...t]))}catch{}for(let r of Ft)r()}var Ya=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  body {
    margin: 0;
    font-family: var(--artifact-font-family);
    color: var(--artifact-color-text);
    background: var(--artifact-color-surface);
  }
  main { max-width: 720px; margin: 0 auto; padding: var(--artifact-space-6) var(--artifact-space-4); }
  h1 { font-size: var(--artifact-font-size-5); margin: 0 0 var(--artifact-space-2); letter-spacing: -0.02em; }
  p { color: var(--artifact-color-muted); line-height: 1.6; }
  button {
    padding: var(--artifact-space-1) var(--artifact-space-3);
    border: 0;
    border-radius: var(--artifact-radius-md);
    background: var(--artifact-color-primary);
    color: #fff;
    font: inherit;
    cursor: pointer;
  }
</style>
</head>
<body>
<main>
  <h1>{{title}}</h1>
  <p>Edit this page in Source, or ask the agent to build it out.</p>
  <button type="button" onclick="this.textContent = 'Clicked ' + (++this.dataset.n || (this.dataset.n = 1)) + ' times'">Try me</button>
</main>
</body>
</html>
`,Xa=`# {{title}}

Start writing, or ask the agent to draft this document.
`,Qa=`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
  * { box-sizing: border-box; }
  body {
    margin: 0;
    font-family: var(--artifact-font-family);
    color: var(--artifact-color-text);
    background: var(--artifact-color-surface);
  }
  main { max-width: 960px; margin: 0 auto; padding: 40px 32px 64px; }
  .eyebrow { margin: 0 0 8px; font-size: 12px; letter-spacing: .08em; text-transform: uppercase; color: var(--artifact-color-muted); }
  h1 { margin: 0 0 8px; font-size: 32px; line-height: 1.15; letter-spacing: -0.02em; }
  .lede { margin: 0 0 28px; color: var(--artifact-color-muted); line-height: 1.6; max-width: 60ch; }
  .metrics { display: grid; grid-template-columns: repeat(auto-fit, minmax(180px, 1fr)); gap: 12px; margin-bottom: 20px; }
  .metric { padding: 16px; border: 1px solid color-mix(in srgb, var(--artifact-color-text) 12%, transparent); border-radius: var(--artifact-radius-md); background: #fff; }
  .metric span { display: block; font-size: 12px; color: var(--artifact-color-muted); }
  .metric strong { display: block; margin: 6px 0 4px; font-size: 26px; letter-spacing: -0.02em; }
  .metric small { color: var(--artifact-color-accent); font-size: 12px; }
  .panel { margin-top: 16px; padding: 20px; border: 1px solid color-mix(in srgb, var(--artifact-color-text) 12%, transparent); border-radius: var(--artifact-radius-md); background: #fff; }
  .panel-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  h2 { margin: 0; font-size: 15px; }
  .panel-head span { font-size: 12px; color: var(--artifact-color-muted); }
  svg { display: block; width: 100%; height: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 13px; }
  th, td { padding: 9px 8px; border-bottom: 1px solid color-mix(in srgb, var(--artifact-color-text) 10%, transparent); text-align: left; }
  th { color: var(--artifact-color-muted); font-weight: 500; }
  td:last-child, th:last-child { text-align: right; }
</style>
</head>
<body>
<main>
  <p class="eyebrow">Overview</p>
  <h1>{{title}}</h1>
  <p class="lede">A starter dashboard built from the example numbers below. Replace the data, or ask the agent to connect a real source.</p>

  <section class="metrics" aria-label="Key metrics">
    <article class="metric"><span>Revenue</span><strong>$128.4k</strong><small>+12.6% vs last month</small></article>
    <article class="metric"><span>Orders</span><strong>1,842</strong><small>+4.1% vs last month</small></article>
    <article class="metric"><span>Average order</span><strong>$69.70</strong><small>+8.2% vs last month</small></article>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Revenue by month</h2><span>Last 6 months</span></div>
    <svg viewBox="0 0 640 220" role="img" aria-label="Bar chart of monthly revenue">
      <g style="fill: var(--artifact-color-primary)">
        <rect x="20" y="120" width="72" height="80" rx="4" />
        <rect x="120" y="96" width="72" height="104" rx="4" />
        <rect x="220" y="108" width="72" height="92" rx="4" />
        <rect x="320" y="72" width="72" height="128" rx="4" />
        <rect x="420" y="48" width="72" height="152" rx="4" />
        <rect x="520" y="28" width="72" height="172" rx="4" />
      </g>
      <g style="fill: var(--artifact-color-muted); font-size: 12px">
        <text x="56" y="216" text-anchor="middle">Jun</text>
        <text x="156" y="216" text-anchor="middle">Jul</text>
        <text x="256" y="216" text-anchor="middle">Aug</text>
        <text x="356" y="216" text-anchor="middle">Sep</text>
        <text x="456" y="216" text-anchor="middle">Oct</text>
        <text x="556" y="216" text-anchor="middle">Nov</text>
      </g>
    </svg>
  </section>

  <section class="panel">
    <div class="panel-head"><h2>Recent orders</h2><span>Example rows</span></div>
    <table>
      <thead><tr><th>Customer</th><th>Product</th><th>Total</th></tr></thead>
      <tbody>
        <tr><td>Northwind</td><td>Team plan</td><td>$1,240</td></tr>
        <tr><td>Contoso</td><td>Starter plan</td><td>$320</td></tr>
        <tr><td>Fabrikam</td><td>Team plan</td><td>$1,240</td></tr>
      </tbody>
    </table>
  </section>
</main>
</body>
</html>
`,Ja=`# {{title}}

## Context

What is happening now, and why this work exists.

## Goal

One sentence that defines success.

## Scope

- Included:
- Not included:

## Open questions

- What still needs an answer?
`,Vt=[{id:"blank-page",type:"page",titleKey:"template.blankPage",hintKey:"template.blankPageHint"},{id:"dashboard",type:"page",titleKey:"template.dashboard",hintKey:"template.dashboardHint"},{id:"blank-doc",type:"doc",titleKey:"template.blankDoc",hintKey:"template.blankDocHint"},{id:"brief",type:"doc",titleKey:"template.brief",hintKey:"template.briefHint"}];function Xr(e){return e.replace(/[&<>"']/g,t=>`&#${t.charCodeAt(0)};`)}function Qr(e){return e.replace(/[\\`*_\[\]#]/g,t=>`\\${t}`)}function Bt(e,t){return e==="doc"?Xa.replace("{{title}}",Qr(t)):Ya.replace("{{title}}",Xr(t))}function Jr(e,t){return e==="dashboard"?Qa.replace("{{title}}",Xr(t)):e==="brief"?Ja.replace("{{title}}",Qr(t)):Bt(e==="blank-doc"?"doc":"page",t)}var d=require("react/jsx-runtime"),Za={items:[],total:0,hasMore:!1,truncated:!1};function Wt(e,t){return e.scope==="library"?{manifest:e,address:{scope:"library",id:e.id},where:{scope:"library",workspaceId:t}}:t===null?null:{manifest:e,address:{scope:"workspace",workspaceId:t,id:e.id},where:{scope:"workspace",workspaceId:t}}}function en(e,t){e!==void 0&&(ve(t.manifest.id,t.manifest.title),e(E(t.address)))}var We=new Map,_t=new Map;function tn(e){let t=E(e.address),r=We.get(t);if(r!==void 0&&r.version>=e.manifest.version)return Promise.resolve(r);let n=`${t}:${e.manifest.version}`,a=_t.get(n);if(a!==void 0)return a;let s=M.get(e.where,e.manifest.id).then(o=>{let p={version:o.version,content:o.content,designCss:o.designCss},c=We.get(t);return(c===void 0||c.version<=p.version)&&(We.size>=60&&We.clear(),We.set(t,p)),p}).finally(()=>{_t.delete(n)});return _t.set(n,s),s}function rn(e){if(typeof DOMParser>"u")return e.replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi,"").replace(/<script\b[^>]*\/?>/gi,"").replace(/\son[a-z]+\s*=\s*"[^"]*"/gi,"");let t=new DOMParser().parseFromString(e,"text/html");for(let r of t.querySelectorAll("script, iframe, object, embed, base"))r.remove();for(let r of t.querySelectorAll("*"))for(let n of[...r.attributes]){let a=n.name.toLowerCase();(a.startsWith("on")||a==="srcdoc")&&r.removeAttribute(n.name)}return t.documentElement.outerHTML}function an(e){let t=e.replace(/```[\s\S]*?```/g," ").replace(/!\[[^\]]*\]\([^)]*\)/g," ").replace(/\[([^\]]+)\]\([^)]*\)/g,"$1").replace(/<[^>]+>/g," ").replace(/[#>*_`~]/g," ").replace(/\s+/g," ").trim();return t.length>220?`${t.slice(0,220).trimEnd()}...`:t}function nn({t:e,view:t}){let[r,n]=(0,C.useState)(null),[a,s]=(0,C.useState)(!1),[o,p]=(0,C.useState)(typeof IntersectionObserver>"u"),[c,y]=(0,C.useState)(null),b=(0,C.useRef)(null),u=E(t.address),N=t.manifest.title,f=t.manifest.type,v=t.manifest.version;(0,C.useEffect)(()=>{if(o)return;let S=b.current;if(S===null)return;let A=new IntersectionObserver(k=>{k.some(K=>K.isIntersecting)&&(p(!0),A.disconnect())},{rootMargin:"140px"});return A.observe(S),()=>A.disconnect()},[o]),(0,C.useEffect)(()=>{if(!o)return;let S=!1;return tn(t).then(A=>{!S&&A.version===v&&(n(A),s(!1))}).catch(()=>{S||s(!0)}),()=>{S=!0}},[o,u,v]),(0,C.useEffect)(()=>{if(f!=="page"||r===null){y(null);return}let S=URL.createObjectURL(new Blob([ot(rn(r.content),r.designCss,N)],{type:"text/html"}));return y(S),()=>URL.revokeObjectURL(S)},[r,f,N]);let F=f==="page"?(0,d.jsx)(se,{}):(0,d.jsx)(ge,{});if(a)return(0,d.jsx)("span",{className:"art-cover",ref:b,"aria-hidden":"true",children:(0,d.jsx)("span",{className:"art-cover-fallback",children:F})});if(f==="page")return(0,d.jsx)("span",{className:"art-cover",ref:b,"aria-hidden":"true",children:c===null?(0,d.jsx)("span",{className:"art-cover-fallback",children:F}):(0,d.jsx)("span",{className:"art-cover-frame-wrap",children:(0,d.jsx)("iframe",{className:"art-cover-frame",src:c,sandbox:"",title:e("gallery.coverTitle",{title:N}),tabIndex:-1,loading:"lazy",referrerPolicy:"no-referrer"})})});let Z=r===null?"":an(r.content);return(0,d.jsx)("span",{className:"art-cover",ref:b,"aria-hidden":"true",children:Z===""?(0,d.jsx)("span",{className:"art-cover-fallback",children:F}):(0,d.jsxs)("span",{className:"art-cover-doc",children:[(0,d.jsx)("span",{className:"art-cover-doc-title",children:N}),(0,d.jsx)("span",{className:"art-cover-doc-text",children:Z})]})})}function on({t:e,view:t,pinned:r,onOpen:n}){let a=E(t.address),s=e(r?"gallery.unpin":"gallery.pin",{title:t.manifest.title});return(0,d.jsxs)("li",{className:"art-tile",children:[(0,d.jsxs)("button",{type:"button",className:"art-tile-open",onClick:()=>n(t),children:[(0,d.jsx)(nn,{t:e,view:t}),(0,d.jsxs)("span",{className:"art-tile-body",children:[(0,d.jsx)("span",{className:"art-tile-title",title:t.manifest.title,children:t.manifest.title}),(0,d.jsxs)("span",{className:"art-tile-sub",children:[e(`type.${t.manifest.type}`)," \xB7 ",e("gallery.updated",{time:it(e,t.manifest.updatedAt)})," \xB7 ",e("gallery.version",{version:t.manifest.version})]}),(0,d.jsx)("span",{className:"art-badge art-tile-scope","data-scope":t.manifest.scope,children:e(`scope.${t.manifest.scope}`)})]})]}),(0,d.jsx)("button",{type:"button",className:"art-tile-pin","aria-label":s,title:s,"aria-pressed":r,onClick:()=>Yr(a),children:(0,d.jsx)(Mr,{})})]})}function Zr({t:e,heading:t,views:r,pinned:n,onOpen:a}){let s=(0,C.useId)();return r.length===0?null:(0,d.jsxs)("section",{className:"art-section","aria-labelledby":s,children:[(0,d.jsxs)("div",{className:"art-section-head",children:[(0,d.jsx)("h2",{className:"art-section-title",id:s,children:t}),(0,d.jsx)("span",{className:"art-section-hint",children:e("gallery.count",{count:r.length})})]}),(0,d.jsx)("ul",{className:"art-grid",children:r.map(o=>(0,d.jsx)(on,{t:e,view:o,pinned:n.has(E(o.address)),onOpen:a},E(o.address)))})]})}function ea(e,t,r,n){let[a,s]=(0,C.useState)({key:"",state:{status:"loading"}}),[o,p]=(0,C.useState)(1),c=`${e===null?"none":`${e.scope}:${e.workspaceId??""}`}:${t}:${r??""}`,y=e===null?{status:"ready",page:Za}:a.key===c?a.state:{status:"loading"};return(0,C.useEffect)(()=>p(1),[c,t]),(0,C.useEffect)(()=>{if(e===null)return;let b=new AbortController,u=setTimeout(async()=>{try{let N=[];for(let v=0;v<o&&(N.push(await M.list(e,{query:t,type:r,offset:v*50},b.signal)),!!N[N.length-1]?.hasMore);v+=1);let f=N[N.length-1];if(f===void 0||b.signal.aborted)return;s({key:c,state:{status:"ready",page:{...f,items:N.flatMap(v=>v.items)}}})}catch(N){b.signal.aborted||s({key:c,state:{status:"failed",code:H(N)}})}},t===""?0:180);return()=>{b.abort(),clearTimeout(u)}},[c,t,n,o]),{state:y,more:()=>p(b=>b+1)}}function Ut({t:e,workspaceId:t,open:r,toolbar:n}){let[a,s]=(0,C.useState)(""),[o,p]=(0,C.useState)("all"),[c,y]=(0,C.useState)(void 0),[b,u]=(0,C.useState)("list"),[N,f]=(0,C.useState)(!1),[v,F]=(0,C.useState)(0),Z=ur()+v,S=Gr(),A=ea(t===null?null:{scope:"workspace",workspaceId:t},a,c,Z),k=ea({scope:"library",workspaceId:t},a,c,Z),K=(0,C.useCallback)(m=>en(r,m),[r]),ee=(0,C.useCallback)(async(m,D,V)=>{if(D==="workspace"&&t===null)return;let B=V===void 0?void 0:Vt.find(he=>he.id===V),R=e(B===void 0?m==="page"?"create.untitledPage":"create.untitledDoc":B.titleKey),de=B===void 0?Bt(m,R):Jr(B.id,R);try{let{manifest:he}=await M.create({scope:D,workspaceId:t},m,R,de);oe();let Y=Wt(he,t);Y!==null&&K(Y)}catch(he){q(e(I(H(he))))}},[t,e,K]),ce=o==="library"||t===null?"library":"workspace",Ie=o!=="library"&&A.state.status==="ready"?A.state.page:null,Ne=o!=="workspace"&&k.state.status==="ready"?k.state.page:null,G=o!=="library"&&t!==null&&A.state.status==="loading"||o!=="workspace"&&k.state.status==="loading",z=o!=="library"&&t!==null&&A.state.status==="failed"?A.state.code:o!=="workspace"&&k.state.status==="failed"?k.state.code:void 0,P=[];for(let m of Ie?.items??[]){let D=Wt(m,t);D!==null&&P.push(D)}for(let m of Ne?.items??[]){let D=Wt(m,t);D!==null&&P.push(D)}P.sort((m,D)=>Date.parse(D.manifest.updatedAt)-Date.parse(m.manifest.updatedAt));let ae=P.filter(m=>S.has(E(m.address))),ne=P.filter(m=>!S.has(E(m.address))),Se=Ie?.hasMore===!0||Ne?.hasMore===!0,gt=Ie?.truncated===!0||Ne?.truncated===!0,Te=t===null&&o==="workspace",be=o==="library"||t===null?"library":"workspace",_e=()=>{o!=="library"&&A.more(),o!=="workspace"&&k.more()};return(0,d.jsxs)("section",{className:"art-root","data-dsh-artifacts":"",children:[(0,d.jsxs)("header",{className:"art-header art-relative",children:[(0,d.jsxs)("div",{className:"art-heading",children:[b==="design"?(0,d.jsx)("button",{type:"button",className:"art-icon-button","aria-label":e("panel"),title:e("panel"),onClick:()=>u("list"),children:(0,d.jsx)(st,{})}):null,(0,d.jsx)("span",{className:"art-title",children:e(b==="design"?"design.title":"panel")})]}),b==="list"?n:null,b==="list"?(0,d.jsxs)("div",{className:"art-actions",children:[(0,d.jsx)("button",{type:"button",className:"art-icon-button","aria-label":e("gallery.design"),title:e("gallery.design"),onClick:()=>u("design"),children:(0,d.jsx)(Er,{})}),(0,d.jsx)("button",{type:"button",className:"art-icon-button","aria-label":e("gallery.refresh"),title:e("gallery.refresh"),onClick:()=>F(m=>m+1),children:(0,d.jsx)(Cr,{})}),(0,d.jsxs)("button",{type:"button",className:"art-button art-create-button","aria-haspopup":"menu","aria-expanded":N,onClick:()=>f(m=>!m),children:[(0,d.jsx)(Tr,{}),e("gallery.create")]})]}):null,N?(0,d.jsx)(De,{label:e("gallery.new"),onClose:()=>f(!1),items:[{id:"page",label:`${e("gallery.newPage")} \xB7 ${e(`scope.${ce}`)}`,icon:(0,d.jsx)(se,{size:14}),run:()=>void ee("page",ce)},{id:"doc",label:`${e("gallery.newDoc")} \xB7 ${e(`scope.${ce}`)}`,icon:(0,d.jsx)(ge,{size:14}),run:()=>void ee("doc",ce)}]}):null]}),b==="design"?(0,d.jsx)("div",{className:"art-scroll",children:(0,d.jsx)(_r,{t:e,workspaceId:t})}):(0,d.jsx)("div",{className:"art-scroll",children:(0,d.jsxs)("div",{className:"art-gallery",children:[(0,d.jsxs)("div",{className:"art-toolbar",children:[(0,d.jsx)("input",{className:"art-search",type:"search","aria-label":e("gallery.searchLabel"),placeholder:e("gallery.search"),value:a,onChange:m=>s(m.target.value)}),(0,d.jsxs)("select",{className:"art-type-select","aria-label":e("filter.type"),value:c??"",onChange:m=>y(m.target.value==="page"?"page":m.target.value==="doc"?"doc":void 0),children:[(0,d.jsx)("option",{value:"",children:e("type.all")}),(0,d.jsx)("option",{value:"page",children:e("type.page")}),(0,d.jsx)("option",{value:"doc",children:e("type.doc")})]}),(0,d.jsx)("div",{className:"art-segment",role:"group","aria-label":e("filter.scope"),children:["all","workspace","library"].map(m=>(0,d.jsx)("button",{type:"button","aria-pressed":o===m,onClick:()=>p(m),children:e(m==="all"?"filter.all":`scope.${m}`)},m))})]}),G?(0,d.jsx)("p",{className:"art-note",children:e("empty.loading")}):null,!G&&z!==void 0&&P.length===0?(0,d.jsxs)("div",{className:"art-empty",role:"alert",children:[(0,d.jsx)("p",{className:"art-empty-title",children:e(I(z))}),(0,d.jsx)("button",{type:"button",className:"art-button",onClick:()=>F(m=>m+1),children:e("action.retry")})]}):null,!G&&z!==void 0&&P.length>0?(0,d.jsxs)("div",{className:"art-bar",role:"status",children:[(0,d.jsx)("span",{children:e(I(z))}),(0,d.jsx)("button",{type:"button",className:"art-button",onClick:()=>F(m=>m+1),children:e("action.retry")})]}):null,!G&&z===void 0&&P.length===0?a!==""?(0,d.jsx)("p",{className:"art-note",children:e("empty.noMatch")}):c!==void 0?(0,d.jsx)("p",{className:"art-note",children:e("empty.typeMatch",{type:e(`type.${c}`)})}):Te?(0,d.jsx)("p",{className:"art-note",children:e("empty.noWorkspace")}):(0,d.jsxs)("div",{className:"art-empty art-templates",children:[(0,d.jsx)("p",{className:"art-empty-title",children:e(be==="library"?"empty.libraryTitle":"empty.workspaceTitle")}),(0,d.jsx)("p",{className:"art-empty-hint",children:e(be==="library"?"empty.libraryHint":"empty.workspaceHint")}),(0,d.jsx)("h3",{className:"art-templates-title",children:e("gallery.templates")}),(0,d.jsx)("ul",{className:"art-templates-grid",children:Vt.map(m=>(0,d.jsx)("li",{children:(0,d.jsxs)("button",{type:"button",className:"art-template",onClick:()=>void ee(m.type,be,m.id),children:[(0,d.jsx)("span",{className:"art-template-icon","data-type":m.type,children:m.type==="page"?(0,d.jsx)(se,{}):(0,d.jsx)(ge,{})}),(0,d.jsxs)("span",{className:"art-template-text",children:[(0,d.jsx)("span",{className:"art-template-name",children:e(m.titleKey)}),(0,d.jsx)("span",{className:"art-template-hint",children:e(m.hintKey)})]})]})},m.id))}),(0,d.jsx)("p",{className:"art-note",children:e("gallery.templateHint")})]}):null,!G&&P.length>0?(0,d.jsxs)(d.Fragment,{children:[(0,d.jsx)(Zr,{t:e,heading:e("gallery.pinned"),views:ae,pinned:S,onOpen:K}),ne.length===0?(0,d.jsx)("p",{className:"art-note",children:e("gallery.allPinned")}):(0,d.jsx)(Zr,{t:e,heading:e("gallery.recent"),views:ne,pinned:S,onOpen:K}),Se?(0,d.jsx)("div",{className:"art-gallery-more",children:(0,d.jsx)("button",{type:"button",className:"art-button",onClick:_e,children:e("gallery.more")})}):null,gt?(0,d.jsx)("p",{className:"art-note",children:e("gallery.truncated")}):null]}):null]})})]})}function Kt(e){let{t,useTabInfo:r}=e,n=r(),a=Wr(e);return(0,d.jsx)(Ut,{t,workspaceId:a.workspaceId,open:n.tab.actions?.openResource})}var _=require("react");var J=require("react/jsx-runtime"),ta="dsh-artifacts.panel.workspace";function ra({t:e,workspaces:t}){let r=(0,_.useCallback)(u=>t.subscribe(u),[t]),n=(0,_.useCallback)(()=>t.getSnapshot(),[t]),s=(0,_.useSyncExternalStore)(r,n,n).items,[o,p]=(0,_.useState)(()=>{let u=window.localStorage.getItem(ta);return u===null||u===""?s[0]?.workspaceId??null:u}),[c,y]=(0,_.useState)(null);(0,_.useEffect)(()=>{if(s.length===0){o!==null&&p(null);return}(o===null||!s.some(u=>u.workspaceId===o))&&p(s[0]?.workspaceId??null)},[s,o]),(0,_.useEffect)(()=>{o!==null&&window.localStorage.setItem(ta,o)},[o]);let b=(0,_.useMemo)(()=>c===null?void 0:fe(c),[c]);return(0,J.jsxs)("div",{className:"art-panel-stack",children:[(0,J.jsx)("div",{className:"art-panel-region",hidden:b!==void 0,children:(0,J.jsx)(Ut,{t:e,workspaceId:o,open:u=>y(u),toolbar:s.length===0?null:(0,J.jsxs)("label",{className:"art-workspace",children:[(0,J.jsx)("span",{className:"art-workspace-label",children:e("panel.workspace")}),(0,J.jsx)("select",{className:"art-workspace-select","aria-label":e("panel.workspace"),value:o??"",onChange:u=>p(u.target.value===""?null:u.target.value),children:s.map(u=>(0,J.jsx)("option",{value:u.workspaceId,children:u.title},u.workspaceId))})]})})}),b===void 0?null:(0,J.jsx)("div",{className:"art-panel-region",children:(0,J.jsx)(Or,{t:e,address:b,workspaceName:s.find(u=>b.scope==="workspace"&&u.workspaceId===b.workspaceId)?.title,onBack:()=>y(null)})})]})}var aa="dsh-artifacts/styles",sn=`
.art-root {
  box-sizing: border-box;
  display: flex;
  flex-direction: column;
  height: 100%;
  min-height: 0;
  min-width: 0;
  color: var(--dsw-alias-label-primary);
  background: var(--dsw-alias-bg-base);
  font-size: 13px;
  line-height: 1.5;
}
.art-root *, .art-root *::before, .art-root *::after, .art-card * { box-sizing: border-box; }
.art-root ::selection { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 28%, transparent); }
.art-root :focus-visible, .art-card :focus-visible, .art-composer:focus-visible {
  outline: 2px solid var(--dsw-alias-brand-primary);
  outline-offset: 1px;
}
.art-header {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 12px;
  min-height: 44px;
  padding: 8px 12px;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.art-heading { flex: 1 1 auto; min-width: 0; overflow: hidden; display: flex; align-items: center; gap: 8px; }
.art-title {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 14px;
  font-weight: 600;
  line-height: 1.35;
  color: var(--dsw-alias-label-primary);
}
.art-title-input {
  min-width: 0;
  flex: 1;
  height: 26px;
  padding: 0 6px;
  border: 1px solid var(--dsw-alias-brand-primary);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-weight: 600;
}
.art-meta {
  display: flex;
  align-items: baseline;
  gap: 2px;
  min-width: 0;
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  line-height: 1.4;
  font-variant-numeric: tabular-nums;
}
.art-meta-text { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-save-status { flex: none; white-space: nowrap; }
.art-save-status[data-tone="warn"] { color: var(--dsw-alias-state-warn-primary); }
.art-save-status[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.art-badge {
  display: inline-flex;
  align-items: center;
  height: 18px;
  padding: 0 6px;
  border-radius: 4px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  font-weight: 500;
  white-space: nowrap;
}
.art-badge[data-scope="library"] {
  background: color-mix(in srgb, var(--dsw-alias-brand-primary) 14%, transparent);
  color: var(--dsw-alias-brand-primary);
}
.art-actions { flex: none; display: flex; align-items: center; gap: 4px; }
.art-icon-button {
  position: relative;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.art-icon-button svg { width: 16px; height: 16px; }
.art-icon-button:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.art-icon-button[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.art-icon-button:disabled { opacity: .45; cursor: default; }
.art-segment {
  display: inline-flex;
  padding: 2px;
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-2);
}
.art-segment button {
  height: 24px;
  padding: 0 10px;
  border: none;
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 12px;
  cursor: pointer;
}
.art-segment button[aria-pressed="true"] {
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent);
}
.art-toolbar {
  flex: none;
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
  padding: 10px 0;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.art-search {
  flex: 1;
  min-width: 0;
  height: 30px;
  padding: 0 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
}
.art-search::placeholder { color: var(--dsw-alias-label-secondary); }
.art-search:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.art-button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 30px;
  padding: 0 12px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  font-weight: 500;
  cursor: pointer;
  white-space: nowrap;
}
.art-button svg { width: 14px; height: 14px; }
.art-button:hover { background: var(--dsw-alias-bg-layer-2); }
.art-button:disabled { opacity: .5; cursor: default; }
.art-button-primary {
  border-color: transparent;
  background: var(--dsw-alias-brand-primary);
  color: var(--dsw-alias-bg-base);
}
.art-button-primary:hover { background: color-mix(in srgb, var(--dsw-alias-brand-primary) 88%, var(--dsw-alias-label-primary)); }
.art-button-danger { color: var(--dsw-alias-state-error-primary); }
.art-scroll { flex: 1; min-height: 0; overflow: auto; scrollbar-gutter: stable; }
.art-scroll::-webkit-scrollbar, .art-drawer-body::-webkit-scrollbar { width: 10px; height: 10px; }
.art-scroll::-webkit-scrollbar-thumb, .art-drawer-body::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 40%, transparent) padding-box;
}
.art-gallery {
  width: 100%;
  max-width: 860px;
  margin-inline: auto;
  padding: 0 12px 24px;
}
.art-section { padding: 4px 0 18px; }
.art-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 0 6px;
}
.art-section-title { margin: 0; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.art-section-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-grid { list-style: none; margin: 0; padding: 0; display: grid; grid-template-columns: repeat(auto-fill, minmax(210px, 1fr)); gap: 10px; }
.art-tile {
  position: relative;
  min-width: 0;
  overflow: hidden;
  border: .5px solid var(--dsw-alias-border-l1);
  border-radius: 10px;
  background: var(--dsw-alias-bg-layer-1);
}
.art-tile:hover { border-color: var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-2); }
.art-tile-open {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  border-radius: inherit;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.art-tile-open:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.art-tile-body { display: flex; flex-direction: column; gap: 3px; padding: 9px 10px 10px; }
.art-tile-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }
.art-tile-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-tile-scope { align-self: flex-start; margin-top: 2px; }
.art-tile-pin {
  position: absolute;
  z-index: 2;
  top: 6px;
  right: 6px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 26px;
  height: 26px;
  padding: 0;
  border: none;
  border-radius: 6px;
  background: color-mix(in srgb, var(--dsw-alias-bg-base) 82%, transparent);
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
  opacity: .72;
}
.art-tile-pin:hover, .art-tile-pin:focus-visible { opacity: 1; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); }
.art-tile-pin[aria-pressed="true"] { opacity: 1; color: var(--dsw-alias-brand-primary); }
.art-tile-pin svg { width: 15px; height: 15px; }
.art-cover { display: block; position: relative; aspect-ratio: 4 / 3; overflow: hidden; background: var(--dsw-alias-bg-layer-2); border-bottom: .5px solid var(--dsw-alias-border-l1); }
.art-cover-frame-wrap { display: block; width: 274px; height: 205px; margin: 0 auto; overflow: hidden; }
.art-cover-frame { display: block; width: 720px; height: 540px; border: 0; transform: scale(.38); transform-origin: top left; pointer-events: none; background: var(--dsw-static-neutral-00); }
.art-cover-fallback { display: flex; align-items: center; justify-content: center; width: 100%; height: 100%; color: var(--dsw-alias-label-secondary); }
.art-cover-fallback svg { width: 26px; height: 26px; opacity: .55; }
.art-cover-doc { display: flex; flex-direction: column; gap: 6px; height: 100%; padding: 14px 14px 10px; background: var(--dsw-alias-bg-base); }
.art-cover-doc-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; font-weight: 600; }
.art-cover-doc-text { display: -webkit-box; overflow: hidden; -webkit-line-clamp: 6; -webkit-box-orient: vertical; font-size: 11px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.art-gallery-more { display: flex; justify-content: center; padding: 4px 0 10px; }
.art-templates { align-items: stretch; }
.art-templates-title { margin: 18px 0 8px; font-size: 12px; font-weight: 600; }
.art-templates-grid { list-style: none; display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 8px; width: 100%; margin: 0; padding: 0; }
.art-template {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  padding: 10px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 9px;
  background: var(--dsw-alias-bg-base);
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.art-template:hover { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); }
.art-template-icon { display: flex; align-items: center; justify-content: center; flex: none; width: 28px; height: 28px; border-radius: 7px; background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-secondary); }
.art-template-icon[data-type="page"] { color: var(--dsw-alias-brand-primary); }
.art-template-text { display: flex; flex-direction: column; gap: 2px; min-width: 0; }
.art-template-name { font-size: 12px; font-weight: 600; }
.art-template-hint { font-size: 11px; line-height: 1.5; color: var(--dsw-alias-label-secondary); }
.art-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin: 2px 0 6px;
  padding: 14px;
  border: 1px dashed var(--dsw-alias-border-l1);
  border-radius: 10px;
  color: var(--dsw-alias-label-secondary);
}
.art-empty-title { margin: 0; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.art-empty-hint { margin: 0; font-size: 12px; line-height: 1.55; max-width: 44ch; }
.art-empty-actions { display: flex; gap: 6px; margin-top: 4px; }
.art-center {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 24px;
  text-align: center;
  color: var(--dsw-alias-label-secondary);
}
.art-center-title { margin: 0; font-size: 13px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.art-center-hint { margin: 0; max-width: 40ch; font-size: 12px; line-height: 1.55; }
.art-note { margin: 0; padding: 4px 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-body { flex: 1; min-height: 0; min-width: 0; display: flex; }
.art-stage { position: relative; flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-layer-1); }
.art-drawer-layer { flex: none; display: flex; min-width: 0; min-height: 0; }
.art-drawer-layer[data-overlay="true"] { position: absolute; inset: 0; z-index: 30; justify-content: flex-end; }
.art-drawer {
  flex: none;
  display: flex;
  flex-direction: column;
  width: 300px;
  min-width: 0;
  min-height: 0;
  border-left: .5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
}
.art-drawer-layer[data-overlay="true"] .art-drawer { position: relative; z-index: 1; width: min(320px, 100%); }
.art-drawer-scrim { position: absolute; inset: 0; background: var(--dsw-alias-bg-mask-2); }
.art-drawer-head { flex: none; display: flex; align-items: center; justify-content: space-between; gap: 8px; padding: 8px 8px 8px 12px; border-bottom: .5px solid var(--dsw-alias-border-l2); }
.art-drawer-head h2 { margin: 0; font-size: 13px; font-weight: 600; line-height: 1.4; }
.art-drawer-body { flex: 1; min-height: 0; overflow: auto; }
/* The iframe canvas is the artifact's, not plugin chrome: HTML paints white by default, so a page that sets no background must not inherit the host theme. */
.art-frame { flex: 1; width: 100%; min-height: 0; border: none; background: var(--dsw-static-neutral-00); }
.art-source {
  flex: 1;
  min-height: 0;
  width: 100%;
  padding: 12px 14px;
  border: none;
  resize: none;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, "SFMono-Regular", Menlo, Consolas, monospace;
  font-size: 12px;
  line-height: 1.6;
  tab-size: 2;
}
.art-source:focus { outline: none; }
.art-doc { flex: 1; min-height: 0; overflow: auto; background: var(--dsw-alias-bg-base); }
.art-doc-mount { max-width: 72ch; margin: 0 auto; padding: 28px 28px 80px; }
.art-prose { outline: none; font-size: 14px; line-height: 1.7; color: var(--dsw-alias-label-primary); }
.art-prose > :first-child { margin-top: 0; }
.art-prose h1, .art-prose h2, .art-prose h3 { line-height: 1.25; letter-spacing: -0.01em; margin: 1.6em 0 .5em; }
.art-prose h1 { font-size: 1.75em; }
.art-prose h2 { font-size: 1.35em; }
.art-prose h3 { font-size: 1.12em; }
.art-prose p { margin: .7em 0; }
.art-prose a { color: var(--dsw-alias-brand-primary); text-underline-offset: 2px; }
.art-prose code { padding: .1em .35em; border-radius: 4px; background: var(--dsw-alias-bg-layer-2); font-family: ui-monospace, Menlo, Consolas, monospace; font-size: .88em; }
.art-prose pre { padding: 12px 14px; border-radius: 8px; background: var(--dsw-alias-bg-layer-2); overflow: auto; }
.art-prose pre code { padding: 0; background: none; }
.art-prose blockquote { margin: 1em 0; padding: 0 0 0 14px; border-left: 2px solid var(--dsw-alias-border-l1); color: var(--dsw-alias-label-secondary); }
.art-prose ul, .art-prose ol { padding-left: 1.4em; }
.art-prose ul[data-type="taskList"] { list-style: none; padding-left: .2em; }
.art-prose ul[data-type="taskList"] li { display: flex; gap: 8px; }
.art-prose ul[data-type="taskList"] li > label { flex: none; margin-top: .2em; }
.art-prose ul[data-type="taskList"] li > div { flex: 1; }
.art-prose table { border-collapse: collapse; margin: 1em 0; }
.art-prose th, .art-prose td { padding: 6px 10px; border: 1px solid var(--dsw-alias-border-l1); text-align: left; vertical-align: top; }
.art-prose th { background: var(--dsw-alias-bg-layer-2); font-weight: 600; }
.art-prose hr { border: none; border-top: 1px solid var(--dsw-alias-border-l1); margin: 2em 0; }
.art-history-body { display: flex; flex-direction: column; min-height: 0; }
.art-version {
  display: flex;
  flex-direction: column;
  gap: 2px;
  width: 100%;
  padding: 8px 12px;
  border: none;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.art-version:hover { background: var(--dsw-alias-bg-layer-1); }
.art-version[aria-current="true"] { background: var(--dsw-alias-bg-layer-2); }
.art-version-top { display: flex; align-items: center; justify-content: space-between; gap: 6px; font-size: 12px; font-weight: 500; font-variant-numeric: tabular-nums; }
.art-version-sub { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-bar {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 12px;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-layer-2);
  font-size: 12px;
}
.art-bar[data-tone="warn"] { background: color-mix(in srgb, var(--dsw-alias-state-warn-primary) 14%, var(--dsw-alias-bg-base)); }
.art-bar[data-tone="error"] { background: color-mix(in srgb, var(--dsw-alias-state-error-primary) 12%, var(--dsw-alias-bg-base)); }
.art-bar-text { display: flex; flex-direction: column; gap: 1px; min-width: 0; }
.art-bar-text strong { font-weight: 600; }
.art-bar-actions { flex: none; display: flex; gap: 6px; }
.art-status {
  flex: none;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  height: 28px;
  padding: 0 12px;
  border-top: .5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
  white-space: nowrap;
}
.art-status span { min-width: 0; overflow: hidden; text-overflow: ellipsis; }
.art-menu {
  position: absolute;
  z-index: 20;
  top: calc(100% - 6px);
  right: 6px;
  min-width: 200px;
  padding: 4px;
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 8px 28px color-mix(in srgb, var(--dsw-alias-label-primary) 16%, transparent);
}
.art-menu button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  height: 30px;
  padding: 0 10px;
  border: none;
  border-radius: 6px;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 12px;
  text-align: left;
  cursor: pointer;
}
.art-menu[data-align="left"] { left: 56px; right: auto; }
.art-menu button:hover, .art-menu button:focus-visible { background: var(--dsw-alias-bg-layer-2); outline: none; }
.art-menu hr { margin: 4px 0; border: none; border-top: .5px solid var(--dsw-alias-border-l2); }
.art-relative { position: relative; }
.art-form { display: flex; flex-direction: column; gap: 10px; padding: 12px; border-bottom: .5px solid var(--dsw-alias-border-l2); background: var(--dsw-alias-bg-layer-1); }
.art-field { display: flex; flex-direction: column; gap: 4px; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.art-field input[type="text"], .art-field textarea {
  height: 30px;
  padding: 0 9px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 7px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-size: 13px;
}
.art-field textarea { height: 84px; padding: 8px 9px; resize: vertical; line-height: 1.5; }
.art-field input:focus, .art-field textarea:focus { outline: none; border-color: var(--dsw-alias-brand-primary); }
.art-field-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-form-actions { display: flex; justify-content: flex-end; gap: 6px; }
.art-radio { display: flex; gap: 6px; }
.art-design { display: flex; flex-direction: column; gap: 18px; padding: 14px 14px 40px; }
.art-design-group { display: flex; flex-direction: column; gap: 8px; }
.art-design-group h3 { margin: 0; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.art-swatches { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 8px; }
.art-swatch {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 6px 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 8px;
}
.art-swatch input[type="color"] { flex: none; width: 26px; height: 26px; padding: 0; border: none; border-radius: 6px; background: none; cursor: pointer; }
.art-swatch-text { display: flex; flex-direction: column; min-width: 0; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-swatch-text input {
  width: 100%;
  min-width: 0;
  padding: 0;
  border: none;
  background: transparent;
  color: var(--dsw-alias-label-primary);
  font-family: ui-monospace, Menlo, Consolas, monospace;
  font-size: 12px;
}
.art-swatch-text input:focus { outline: none; }
.art-radius-row { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
.art-radius-row label { display: flex; flex-direction: column; gap: 4px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-radius-row input {
  height: 28px;
  padding: 0 8px;
  border: 1px solid var(--dsw-alias-border-l1);
  border-radius: 6px;
  background: var(--dsw-alias-bg-base);
  color: var(--dsw-alias-label-primary);
  font: inherit;
  font-variant-numeric: tabular-nums;
}
.art-design-preview { overflow: hidden; border: 1px solid var(--dsw-alias-border-l1); border-radius: 10px; }
.art-design-source { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.art-design-actions { display: flex; flex-wrap: wrap; gap: 6px; }
.art-toast {
  position: fixed;
  z-index: 80;
  left: 50%;
  bottom: 24px;
  transform: translateX(-50%);
  max-width: min(560px, 86vw);
  padding: 8px 12px;
  border-radius: 8px;
  background: var(--dsw-alias-label-primary);
  color: var(--dsw-alias-bg-base);
  font-size: 12px;
  box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 22%, transparent);
  overflow-wrap: anywhere;
}
.art-card {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  max-width: 520px;
  padding: 10px 10px 10px 12px;
  border: .5px solid var(--dsw-alias-border-l1);
  border-radius: 12px;
  background: var(--dsw-alias-bg-layer-1);
  color: var(--dsw-alias-label-primary);
  font-size: 13px;
}
.art-card-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 34px;
  height: 34px;
  border-radius: 8px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-brand-primary);
}
.art-card-icon svg { width: 18px; height: 18px; }
.art-card-text { min-width: 0; display: flex; flex-direction: column; gap: 1px; }
.art-card-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 600; }
.art-card-sub { display: flex; align-items: center; gap: 6px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-card-status { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.art-card-status[data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.art-composer {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: none;
  border-radius: 7px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  cursor: pointer;
}
.art-composer svg { width: 16px; height: 16px; }
.art-composer:hover { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.art-chip { display: inline-flex; align-items: center; gap: 6px; min-width: 0; }
.art-chip svg { flex: none; width: 14px; height: 14px; color: var(--dsw-alias-label-secondary); }
.art-chip span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-workspace { display: flex; align-items: center; gap: 6px; margin-left: auto; min-width: 0; }
.art-workspace-label { font-size: 11px; color: var(--dsw-alias-label-secondary); white-space: nowrap; }
.art-workspace-select {
  max-width: 180px; min-width: 90px; height: 26px; padding: 0 6px;
  border: .5px solid var(--dsw-alias-border-l2); border-radius: 6px;
  background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary);
  font: inherit; font-size: 12px;
}
.art-panel-stack, .art-panel-region { height: 100%; min-height: 0; min-width: 0; }
.art-panel-region[hidden] { display: none; }
.art-root { container-type: inline-size; }
.art-editor-header { position: relative; flex-wrap: wrap; padding: 8px 12px; gap: 10px; }
.art-identity { display: flex; flex-direction: column; min-width: 0; flex: 1; gap: 1px; }
.art-identity .art-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-editor-actions { margin-left: auto; flex: none; flex-wrap: wrap; justify-content: flex-end; }
.art-icon-button { min-width: 32px; width: 32px; height: 32px; }
.art-segment button { min-height: 28px; }
.art-inline-form { display: flex; gap: 6px; padding: 8px 12px; }
.art-inline-form input { min-width: 0; flex: 1; padding: 4px 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; font: inherit; }
.art-selection-bar {
  position: absolute;
  z-index: 12;
  left: 50%;
  bottom: 14px;
  transform: translateX(-50%);
  display: flex;
  align-items: center;
  gap: 8px;
  width: max-content;
  max-width: min(620px, calc(100% - 24px));
  padding: 7px 8px 7px 11px;
  border: .5px solid var(--dsw-alias-border-l2);
  border-radius: 10px;
  background: var(--dsw-alias-bg-overlay);
  box-shadow: 0 8px 24px color-mix(in srgb, var(--dsw-alias-label-primary) 18%, transparent);
}
.art-selection-quote { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 12px; color: var(--dsw-alias-label-secondary); }
.art-selection-bar .art-button { flex: none; }
.art-version-button {
  display: inline-flex;
  align-items: center;
  gap: 1px;
  height: 20px;
  padding: 0 4px;
  border: .5px solid var(--dsw-alias-border-l1);
  border-radius: 5px;
  background: transparent;
  color: var(--dsw-alias-label-secondary);
  font: inherit;
  font-size: 11px;
  font-variant-numeric: tabular-nums;
  cursor: pointer;
}
.art-version-button:hover, .art-version-button[aria-expanded="true"] { background: var(--dsw-alias-bg-layer-2); color: var(--dsw-alias-label-primary); }
.art-version-button svg { width: 12px; height: 12px; }
.art-request-body { display: flex; flex-direction: column; gap: 10px; padding: 12px; }
.art-request-body .art-field textarea { height: 132px; }
.art-request-context { display: flex; flex-wrap: wrap; align-items: center; gap: 6px; font-size: 12px; }
.art-request-title { min-width: 0; max-width: 100%; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.art-request-version { color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.art-request-dot { color: var(--dsw-alias-label-secondary); }
.art-quote { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border-left: 2px solid var(--dsw-alias-brand-primary); border-radius: 0 7px 7px 0; background: var(--dsw-alias-bg-layer-1); }
.art-quote-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-quote-remove { padding: 0; border: none; background: transparent; color: var(--dsw-alias-brand-primary); font: inherit; font-size: 11px; cursor: pointer; }
.art-quote blockquote { margin: 0; max-height: 110px; overflow: auto; white-space: pre-wrap; font-size: 12px; line-height: 1.5; }
.art-request-preview { font-size: 12px; color: var(--dsw-alias-label-secondary); }
.art-request-preview summary { cursor: pointer; }
.art-request-preview pre { max-height: 200px; overflow: auto; margin: 8px 0 0; padding: 10px; border-radius: 8px; background: var(--dsw-alias-bg-layer-1); color: var(--dsw-alias-label-primary); white-space: pre-wrap; font-size: 11px; line-height: 1.5; }
.art-dialog-shade { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; padding: 16px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 25%, transparent); }
.art-root { position: relative; }
.art-dialog { width: 100%; max-width: 440px; padding: 20px; border-radius: 12px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: 0 12px 36px color-mix(in srgb, var(--dsw-alias-label-primary) 20%, transparent); }
.art-dialog h2 { margin: 0 0 8px; font-size: 16px; }
.art-dialog p { margin: 0 0 20px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.art-dialog .art-form-actions { flex-wrap: wrap; }
.art-doc-toolbar .art-button[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-brand-primary); }
.art-doc-toolbar { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.art-bar { flex-wrap: wrap; }
.art-bar-actions { flex-wrap: wrap; }
.art-search { flex-basis: 140px; }
.art-type-select { height: 30px; max-width: 140px; padding: 0 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; }
.art-source:focus-visible, .art-prose:focus-visible, .art-swatch-text input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.art-status { height: 28px; padding: 0 12px; }
@container (max-width: 600px) {
  .art-editor-header .art-heading { flex-basis: 100%; }
  .art-editor-actions { width: 100%; justify-content: flex-end; }
  .art-editor-actions .art-segment { margin-right: auto; }
  .art-drawer-layer { position: absolute; inset: 0; z-index: 30; justify-content: flex-end; }
  .art-drawer { width: min(320px, 100%); }
  .art-workspace-label { display: none; }
  .art-doc-mount { padding: 20px 16px 48px; }
}
@container (max-width: 520px) {
  .art-toolbar { flex-direction: column; align-items: stretch; }
  .art-search { width: 100%; flex: none; }
  .art-type-select { width: 100%; max-width: none; }
  .art-toolbar .art-segment { align-self: flex-start; flex-wrap: wrap; }
  .art-gallery { padding: 0 10px 18px; }
  .art-grid { grid-template-columns: 1fr; }
  .art-cover { aspect-ratio: 16 / 10; }
  .art-selection-bar { left: 8px; right: 8px; width: auto; max-width: none; transform: none; }
  .art-selection-quote { flex: 1; }
  .art-request-body { padding: 10px; }
}
@media (pointer: coarse) { .art-icon-button, .art-button, .art-segment button { min-height: 44px; min-width: 44px; } }
@media (prefers-reduced-motion: no-preference) {
  .art-tile, .art-tile-pin, .art-version, .art-icon-button, .art-button { transition: background-color .12s ease-out, color .12s ease-out, border-color .12s ease-out, opacity .12s ease-out; }
  .art-toast { animation: art-rise .18s cubic-bezier(.16, 1, .3, 1); }
}
@keyframes art-rise { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
`;function na(){if(typeof document>"u"||document.querySelector(`style[data-plugin-css="${aa}"]`)!==null)return;let e=document.createElement("style");e.dataset.plugin="dsh-artifacts",e.dataset.pluginCss=aa,e.textContent=sn,document.head.appendChild(e)}var U=require("react/jsx-runtime");var re="artifacts",ft="dsh-artifacts",mt="dsh-artifacts/artifact",oa="artifact",Gt="dsh-artifacts-panel",ia=["artifact_create","artifact_update"],ln=["connection","slots","locale","sidebarRightTabs","sidebarRight","workspaces"];function ut(e){return function(r){return(0,U.jsx)(dt,{title:r.t("error.surface"),hint:r.t("error.surfaceHint"),reloadLabel:r.t("action.reloadWindow"),children:(0,U.jsx)(e,{...r})})}}function cn(){let e=fr();return e===null?null:(0,U.jsx)("div",{className:"art-toast",role:"status",children:e})}function dn({t:e}){return(0,U.jsxs)("span",{className:"art-chip",children:[(0,U.jsx)(Re,{}),(0,U.jsx)("span",{children:e("panel")})]})}function pn({useTabInfo:e}){let{tab:t}=e(),r=fe(t.contentId??t.navigation?.address),n=dr(r?.id);return(0,U.jsxs)("span",{className:"art-chip",children:[(0,U.jsx)(ge,{}),(0,U.jsx)("span",{children:n??r?.id??""})]})}function un(e){na(),e.effect(gr,"dsh-artifacts: unsaved draft guard"),sr(e.connection),Le.sidebarRight=e.sidebarRight,e.locale.register(re,"en",kr),e.locale.register(re,"zh",Nr);let t=e.locale.bind(re),r=(o,p)=>t(o,p);e.effect(()=>e.sidebarRightTabs.register({id:ft,kind:$t,priority:"extension",keepMounted:!0,title:()=>r("panel"),guide:[{id:"artifacts",order:40,title:()=>r("guide.title"),description:()=>r("guide.description"),icon:()=>(0,U.jsx)(Re,{size:22})}]}),"dsh-artifacts: gallery tab type"),e.effect(()=>e.sidebarRightTabs.register({id:mt,kind:oa,priority:"extension",patterns:["dsh-resource://artifact/**"],canOpen:o=>fe(o)!==void 0,title:o=>{let p=fe(o);return p===void 0?"":cr(p.id)??p.id}}),"dsh-artifacts: artifact tab type");let n=()=>({t:r});e.effect(()=>mr,"dsh-artifacts: notification cleanup"),e.slots.inject("shell.overlay",()=>e.slots.register({name:"shell.overlay",id:"dsh-artifacts.notice"},cn)),e.slots.inject("sidebar.right.pane.tab",()=>e.slots.register({name:"sidebar.right.pane.tab",key:ft,locale:re,inject:n},ut(Kt))),e.slots.inject("sidebar.right.pane.tab",()=>e.slots.register({name:"sidebar.right.pane.tab",key:mt,locale:re,inject:n},ut(zt))),e.slots.inject("sidebar.right.pane.tab.title",()=>e.slots.register({name:"sidebar.right.pane.tab.title",key:ft,locale:re,inject:n},dn)),e.slots.inject("sidebar.right.pane.tab.title",()=>e.slots.register({name:"sidebar.right.pane.tab.title",key:mt,locale:re,inject:n},pn));for(let o of ia)e.slots.inject("tool.call.toolview",()=>e.slots.register({name:"tool.call.toolview",key:o,locale:re,inject:n},ut(Ot)));e.slots.inject("conversation.input.left",()=>e.slots.register({name:"conversation.input.left",id:"dsh-artifacts",order:40,locale:re,inject:n},Vr));function a({size:o}){return(0,U.jsx)(Re,{size:o})}let s=()=>({t:r,workspaces:e.workspaces.list});e.slots.inject("main",()=>e.slots.register({name:"main",key:Gt,locale:re,inject:s},ut(ra))),e.slots.inject("sidebar.panellist",()=>e.slots.register({name:"sidebar.panellist",id:Gt,order:10,label:()=>r("panel")},a))}

    return module.exports;
  },
});
