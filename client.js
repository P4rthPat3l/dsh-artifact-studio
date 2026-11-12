window.__ModuleLoader__.load({
  id: "dsh-artifacts",
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
    globalThis.__dshArtifactsRequireAsync = require.async;
"use strict";var wr=Object.create;var Le=Object.defineProperty;var kr=Object.getOwnPropertyDescriptor;var Nr=Object.getOwnPropertyNames;var Sr=Object.getPrototypeOf,Tr=Object.prototype.hasOwnProperty;var Cr=(e,t)=>{for(var r in t)Le(e,r,{get:t[r],enumerable:!0})},wt=(e,t,r,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of Nr(t))!Tr.call(e,a)&&a!==r&&Le(e,a,{get:()=>t[a],enumerable:!(n=kr(t,a))||n.enumerable});return e};var Ar=(e,t,r)=>(r=e!=null?wr(Sr(e)):{},wt(t||!e||!e.__esModule?Le(r,"default",{value:e,enumerable:!0}):r,e)),Rr=e=>wt(Le({},"__esModule",{value:!0}),e);var ia={};Cr(ia,{ARTIFACT_ID:()=>Ye,ARTIFACT_KIND:()=>fr,ArtifactCard:()=>lt,ArtifactTab:()=>st,CARD_TOOLS:()=>gr,DocView:()=>Oe,GALLERY_ID:()=>Ke,Gallery:()=>ut,PANEL_ID:()=>ft,apply:()=>oa,inject:()=>ta});module.exports=Rr(ia);var Pr=["page","doc"];function Er(e){return Pr.some(t=>t===e)}var kt={page:["html"],doc:["md","docx","html"]};var ze=/^art_(ws|lib)_[a-z0-9]{10,32}$/;function tt(e){if(e===null||typeof e!="object")return!1;let t="origin"in e?e.origin:void 0,r="action"in e?e.action:void 0;return(t==="agent"||t==="user")&&(r==="create"||r==="update"||r==="restore")}function je(e){if(e===null||typeof e!="object")return!1;let t={...e};return t.schemaVersion===1&&typeof t.id=="string"&&ze.test(t.id)&&(t.scope==="workspace"||t.scope==="library")&&typeof t.type=="string"&&Er(t.type)&&typeof t.title=="string"&&typeof t.createdAt=="string"&&typeof t.updatedAt=="string"&&typeof t.version=="number"&&Number.isInteger(t.version)&&t.version>=1&&typeof t.contentFile=="string"&&typeof t.contentBytes=="number"&&typeof t.contentHash=="string"&&tt(t.source)}var He="dsh-resource://artifact/";function H(e){return e.scope==="workspace"?`${He}workspace/${encodeURIComponent(e.workspaceId)}/${e.id}`:`${He}library/${e.id}`}function re(e){if(typeof e!="string"||!e.startsWith(He))return;let t=e.slice(He.length).split("/");if(t[0]==="library"&&t.length===2){let r=t[1]??"";return ze.test(r)&&r.startsWith("art_lib_")?{scope:"library",id:r}:void 0}if(t[0]==="workspace"&&t.length===3){let r=t[2]??"",n;try{n=decodeURIComponent(t[1]??"")}catch{return}return n===""||!ze.test(r)||!r.startsWith("art_ws_")?void 0:{scope:"workspace",workspaceId:n,id:r}}}function Nt(e){if(ze.test(e))return e.startsWith("art_ws_")?"workspace":"library"}function St(e){let t=[];for(let[r,n]of Object.entries(e.colors))t.push(`--artifact-color-${r}: ${n};`);t.push(`--artifact-font-family: ${e.typography.fontFamily};`),t.push(`--artifact-font-mono: ${e.typography.monoFamily};`),e.typography.scale.forEach((r,n)=>t.push(`--artifact-font-size-${n}: ${r}px;`)),t.push(`--artifact-space-unit: ${e.spacing.unit}px;`),e.spacing.scale.forEach((r,n)=>t.push(`--artifact-space-${n}: ${r}px;`));for(let[r,n]of Object.entries(e.radius))t.push(`--artifact-radius-${r}: ${n}px;`);return`:root {
  ${t.join(`
  `)}
}`}var Mr="/artifacts-rpc",ge=class extends Error{code;details;constructor(t,r,n){super(r),this.name="ArtifactCallError",this.code=t,this.details=n}},at=null;function Tt(e){at=e}async function I(e,t,r,n){if(at===null)throw new ge("artifact/not-ready","The artifact channel is not ready.",{});let a=await at.rpc.call(Mr,e,t,n);if(!a.ok)throw new ge(a.error.code,a.error.message,a.error.details);if(!r(a.value))throw new ge("artifact/bad-response",`The ${e} response has an unexpected shape.`,{});return a.value}function P(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function Dr(e){return P(e)&&Array.isArray(e.items)&&e.items.every(je)&&typeof e.total=="number"&&typeof e.hasMore=="boolean"}function Ir(e){return P(e)&&je(e.manifest)&&typeof e.content=="string"&&typeof e.version=="number"&&typeof e.designCss=="string"}function Fe(e){return P(e)&&je(e.manifest)}function Lr(e){return P(e)&&typeof e.version=="number"&&typeof e.createdAt=="string"&&typeof e.contentHash=="string"&&typeof e.contentBytes=="number"&&tt(e.source)}function zr(e){return P(e)&&Array.isArray(e.versions)&&e.versions.every(Lr)}function Hr(e){return P(e)&&e.trashed===!0&&typeof e.trashPath=="string"}function jr(e){return P(e)&&typeof e.path=="string"&&typeof e.bytes=="number"&&typeof e.fileName=="string"&&typeof e.mediaType=="string"&&typeof e.data=="string"}function Fr(e){return P(e)&&typeof e.html=="string"}function $r(e){return P(e)&&e.schemaVersion===1&&typeof e.name=="string"&&P(e.colors)&&P(e.typography)&&P(e.spacing)&&P(e.radius)}function rt(e){return P(e)&&$r(e.tokens)&&(e.source==="workspace"||e.source==="library"||e.source==="default")&&typeof e.css=="string"}function B(e){return{scope:e.scope,...e.workspaceId===null?{}:{workspaceId:e.workspaceId}}}var T={list:(e,t,r)=>I("list",{...B(e),...t},Dr,r),get:(e,t,r,n)=>I("get",{...B(e),id:t,...r===void 0?{}:{version:r}},Ir,n),create:(e,t,r,n)=>I("create",{...B(e),type:t,title:r,content:n},Fe),update:(e,t,r,n,a)=>I("update",{...B(e),id:t,baseVersion:r,content:n,...a===void 0?{}:{title:a}},Fe),rename:(e,t,r,n)=>I("update",{...B(e),id:t,baseVersion:r,title:n},Fe),remove:(e,t)=>I("delete",{...B(e),id:t},Hr),history:(e,t,r)=>I("history",{...B(e),id:t},zr,r),restore:(e,t,r,n)=>I("restore",{...B(e),id:t,version:r,baseVersion:n},Fe),exportFile:(e,t,r,n)=>I("export",{...B(e),id:t,format:r,version:n},jr),printable:(e,t,r)=>I("printable",{...B(e),id:t,version:r},Fr),designSystem:(e,t)=>I("designSystem",e===null?{}:{workspaceId:e},rt,t),saveDesignSystem:(e,t)=>I("saveDesignSystem",{...B(e),tokens:t},rt),clearDesignSystem:e=>I("clearDesignSystem",{workspaceId:e,scope:"workspace"},rt)};function E(e){return e instanceof ge?e.code:void 0}function R(e){switch(e){case"artifact/not-found":return"error.notFound";case"artifact/stale-version":return"error.stale";case"artifact/too-large":return"error.tooLarge";case"artifact/no-workspace":return"error.noWorkspace";case"artifact/forbidden-path":return"error.forbidden";case"artifact/corrupt":return"error.corrupt";case"artifact/invalid-tokens":return"error.tokens";case"artifact/library-unavailable":return"error.library";default:return"error.generic"}}function Ct(e){let t=atob(e.data),r=new Uint8Array(t.length);for(let o=0;o<t.length;o+=1)r[o]=t.charCodeAt(o);let n=URL.createObjectURL(new Blob([r],{type:e.mediaType})),a=document.createElement("a");a.href=n,a.download=e.fileName,a.rel="noopener",document.body.appendChild(a),a.click(),a.remove(),setTimeout(()=>URL.revokeObjectURL(n),3e4)}var be=require("react");var Te=require("react");function Be(e){let t=e,r=new Set;return{get:()=>t,set(n){t=n;for(let a of r)a()},subscribe(n){return r.add(n),()=>r.delete(n)}}}var me=Be(new Map);function se(e,t){if(me.get().get(e)===t)return;let r=new Map(me.get());r.set(e,t),me.set(r)}function At(e){return me.get().get(e)}function Rt(e){return(0,Te.useSyncExternalStore)(me.subscribe,()=>e===void 0?void 0:me.get().get(e))}var ke=Be(new Map);function le(e,t){if((ke.get().get(e)??0)>=t)return;let r=new Map(ke.get());r.set(e,t),ke.set(r)}function Pt(e){return(0,Te.useSyncExternalStore)(ke.subscribe,()=>e===void 0?0:ke.get().get(e)??0)}var $e=Be(0);function Y(){$e.set($e.get()+1)}function Et(){return(0,Te.useSyncExternalStore)($e.subscribe,$e.get)}var Ne,Se=Be(null);function M(e){Se.set(e),Ne!==void 0&&clearTimeout(Ne),Ne=setTimeout(()=>Se.set(null),3600)}function Mt(){return(0,Te.useSyncExternalStore)(Se.subscribe,Se.get)}function Dt(){Ne!==void 0&&clearTimeout(Ne),Se.set(null)}var X=new Map,nt;function It(){nt?.();let e=t=>{[...X.values()].some(r=>r.getSnapshot().draft!==null||r.getSnapshot().saving)&&(t.preventDefault(),t.returnValue="")};return window.addEventListener("beforeunload",e),nt=()=>window.removeEventListener("beforeunload",e),nt}var ot=class{state={payload:null,draft:null,loading:!0,saving:!1,conflict:!1,revision:0};listeners=new Set;pending=null;readSequence=0;mounts=0;renameTo;where;key;address;constructor(t){this.address=t,this.key=H(t),this.where={scope:t.scope,workspaceId:t.scope==="workspace"?t.workspaceId:null}}getSnapshot=()=>this.state;subscribe=t=>(this.listeners.add(t),()=>this.listeners.delete(t));publish(t){this.state={...this.state,...t},this.state.draft!==null||this.state.saving?X.set(this.key,this):this.mounts===0&&X.get(this.key)===this&&X.delete(this.key);for(let r of this.listeners)r()}attach(){return this.mounts+=1,X.set(this.key,this),this.mounts===1&&(this.state.payload===null||this.state.draft===null)&&this.load(),()=>{this.mounts-=1,this.mounts===0&&this.state.draft===null&&!this.state.saving&&X.get(this.key)===this&&X.delete(this.key)}}async load(){let t=++this.readSequence;this.publish({loading:!0,failure:void 0});try{let r=await T.get(this.where,this.address.id);if(t!==this.readSequence)return;if(this.state.draft!==null&&this.state.payload!==null){this.publish({loading:!1,conflict:r.version!==this.state.payload.version});return}this.publish({payload:r,loading:!1,conflict:!1,failure:void 0,revision:this.state.revision+1}),se(this.address.id,r.manifest.title),le(this.address.id,r.version)}catch(r){t===this.readSequence&&this.publish({loading:!1,failure:E(r)??"artifact/storage-failure"})}}edit(t){this.publish({draft:t,failure:void 0})}async discardAndReload(){this.pending!==null&&await this.pending,this.publish({draft:null,conflict:!1,failure:void 0}),await this.load()}externalVersion(t){this.state.payload===null||t<=this.state.payload.version||this.state.saving||(this.state.draft!==null?this.publish({conflict:!0}):this.load())}save(t){return t!==void 0&&(this.renameTo=t),this.pending!==null?this.pending:this.state.conflict||this.state.payload===null?Promise.resolve(!1):(this.pending=Promise.resolve().then(()=>this.drain()),this.pending)}async drain(){this.publish({saving:!0,failure:void 0});try{for(;this.state.draft!==null||this.renameTo!==void 0;){let t=this.state.payload;if(t===null||this.state.conflict)return!1;let r=this.state.draft,n=r??t.content,a=this.renameTo,{manifest:o}=await T.update(this.where,this.address.id,t.version,n,a);this.renameTo===a&&(this.renameTo=void 0),this.accept(o,n,this.state.draft===r?null:this.state.draft)}return!0}catch(t){let r=E(t)??"artifact/storage-failure";return this.renameTo=void 0,this.publish({failure:r,conflict:r==="artifact/stale-version"}),!1}finally{this.pending=null,this.publish({saving:!1})}}accept(t,r,n){let a=this.state.payload;a!==null&&(++this.readSequence,this.publish({payload:{...a,manifest:t,content:r,version:t.version},draft:n,conflict:!1,loading:!1}),se(t.id,t.title),le(t.id,t.version),Y())}};function Lt(e){let t=H(e),r=(0,be.useMemo)(()=>{let a=X.get(t);if(a!==void 0)return a;let o=new ot(e);return X.set(t,o),o},[t]),n=(0,be.useSyncExternalStore)(r.subscribe,r.getSnapshot,r.getSnapshot);return(0,be.useEffect)(()=>r.attach(),[r]),{model:r,state:n}}var k=require("react");var j=require("react"),ae=require("react/jsx-runtime"),Ce=null;function Br(){if(Ce===null){let e=globalThis.__dshArtifactsRequireAsync;if(typeof e!="function")return Promise.reject(new Error("The document editor loader is unavailable."));Ce=e("./client.doc.js"),Ce.catch(()=>{Ce=null})}return Ce}function Oe({markdown:e,revision:t,editable:r,label:n,loadingLabel:a,failedLabel:o,onChange:i,onSave:p,t:c}){let y=(0,j.useRef)(null),h=(0,j.useRef)(null),f=(0,j.useRef)(i);f.current=i;let w=(0,j.useRef)({markdown:e,editable:r,label:n});w.current={markdown:e,editable:r,label:n};let[u,g]=(0,j.useState)([]),[F,J]=(0,j.useState)("loading");return(0,j.useEffect)(()=>{let N=!1;return Br().then(q=>{N||y.current===null||(h.current=q.mountDocEditor({element:y.current,...w.current,onChange:ee=>f.current(ee),onSelectionChange:g}),J("ready"))}).catch(()=>{N||J("failed")}),()=>{N=!0,h.current?.destroy(),h.current=null}},[]),(0,j.useEffect)(()=>{let N=h.current;N!==null&&N.getMarkdown()!==e&&N.setMarkdown(e)},[t,e]),(0,j.useEffect)(()=>{h.current?.setEditable(r)},[r]),(0,ae.jsxs)("div",{className:"art-doc","data-doc-revision":t,onKeyDown:N=>{(N.ctrlKey||N.metaKey)&&N.key.toLowerCase()==="s"&&(N.preventDefault(),p())},children:[!r||c===void 0?null:(0,ae.jsx)("div",{className:"art-doc-toolbar",role:"toolbar","aria-label":c("format.toolbar"),children:["heading","bold","italic","bulletList","orderedList","codeBlock"].map(N=>(0,ae.jsx)("button",{type:"button",className:"art-button","aria-pressed":u.includes(N),disabled:F!=="ready",onMouseDown:q=>q.preventDefault(),onClick:()=>h.current?.format(N),children:c(`format.${N}`)},N))}),F==="loading"?(0,ae.jsx)("p",{className:"art-note",children:a}):null,F==="failed"?(0,ae.jsx)("p",{className:"art-note",children:o}):null,(0,ae.jsx)("div",{className:"art-doc-mount",ref:y})]})}var Ht="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";var it="<script>addEventListener('message',function(e){if(e.source!==parent||e.data!=='dsh-artifact-print')return;addEventListener('afterprint',function(){parent.postMessage('dsh-artifact-printed','*')},{once:true});print()})<\/script>";function zt(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Or(e){return e.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi,"").replace(/<meta\b[^>]*content\s*=\s*["'][^"']*url\s*=[^>]*>/gi,"")}function jt(e,t,r,n,a=""){return`<!doctype html><html><head>${'<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+(r===null?"":`<meta http-equiv="Content-Security-Policy" content="${zt(r)}">`)+`<title>${zt(n)}</title><style data-artifact-tokens>${t}</style>`+a}</head><body>${Or(e)}</body></html>`}var Ft="allow-scripts",Vr="allow-scripts allow-modals",Wr=3e4;function $t(e,t,r){return jt(e,t,Ht,r)}function Bt(e){let t=/<\/head>/i.test(e)?e.replace(/<\/head>/i,`${it}</head>`):`${it}${e}`,r=URL.createObjectURL(new Blob([t],{type:"text/html"})),n=document.createElement("iframe");n.setAttribute("sandbox",Vr),n.setAttribute("aria-hidden","true"),n.tabIndex=-1,n.style.cssText="position:fixed;left:-10000px;top:0;width:800px;height:1000px;border:0;";let a=!1,o=()=>{a||(a=!0,clearTimeout(p),window.removeEventListener("message",i),n.remove(),URL.revokeObjectURL(r))},i=c=>{c.source===n.contentWindow&&c.data==="dsh-artifact-printed"&&o()};window.addEventListener("message",i);let p=setTimeout(o,Wr);n.addEventListener("load",()=>{n.contentWindow?.postMessage("dsh-artifact-print","*")},{once:!0}),n.src=r,document.body.appendChild(n)}var Ot={"filter.scope":"Filter by storage","filter.type":"Filter by type","tab.mode":"Page view","tab.manualSave":"Page source saves with Save or Ctrl/Cmd+S.","tab.autosave":"Documents save automatically after typing.","tab.outputVersion":"Output uses saved v{version}","tab.leaveTitle":"Keep your changes?","tab.leaveHint":"Save your changes before continuing, or discard them. Cancel keeps you here.","tab.discardContinue":"Discard and continue","tab.saveContinue":"Save and continue","tab.copyDraft":"Copy my draft","tab.discardReload":"Discard mine and reload","history.close":"Close history","action.copied":"Copied","action.copyFailed":"Copy was blocked. Select the text and copy it manually.","agent.edit":"Ask agent to edit","agent.review":"Review edit request","agent.copy":"Copy edit request","agent.copyHint":"Copy this request into the conversation you choose. Nothing is sent automatically.","agent.request":`Please edit artifact "{title}".
Artifact address: {address}
Artifact id: {id}
Scope: {scope}
Project: {workspace}
Reference version: {version}

Requested changes:

Read the current artifact before updating it. If it has changed since the reference version, check the changes before applying this request. Update this artifact instead of creating a duplicate.`,"format.toolbar":"Document formatting","format.heading":"Heading","format.bold":"Bold","format.italic":"Italic","format.bulletList":"Bullet list","format.orderedList":"Numbered list","format.codeBlock":"Code block",panel:"Artifacts","panel.workspace":"Project","action.back":"Back","guide.title":"Artifacts","guide.description":"Pages and documents the agent made, with versions and export.","scope.workspace":"This project","scope.library":"Library","scope.workspaceHint":"Stored in this project under .dsh/artifacts.","scope.libraryHint":"Stored in your profile and shared by every project.","type.page":"Page","type.doc":"Document","type.all":"All types","filter.all":"All","gallery.search":"Search artifacts","gallery.searchLabel":"Search by title","gallery.new":"New","gallery.newPage":"New page","gallery.newDoc":"New document","gallery.design":"Design system","gallery.refresh":"Refresh","gallery.more":"Show more","gallery.truncated":"Only the first 500 artifacts are scanned.","gallery.version":"v{version}","gallery.updated":"Updated {time}","gallery.count":"{count} artifacts","empty.workspaceTitle":"No artifacts in this project yet","empty.workspaceHint":"Ask the agent for a dashboard, report, or one-pager, or start one here.","empty.libraryTitle":"Your library is empty","empty.libraryHint":"Library artifacts follow you to every project. Ask the agent to save one to the library.","empty.noMatch":"Nothing matches that search.","empty.noWorkspace":"Open a session in a workspace to see its artifacts.","empty.loading":"Loading...","create.title":"New {type}","create.name":"Title","create.scope":"Save to","create.submit":"Create","create.cancel":"Cancel","create.untitledPage":"Untitled page","create.untitledDoc":"Untitled document","tab.preview":"Preview","tab.source":"Source","tab.history":"History","tab.export":"Export","tab.maximize":"Fill the window","tab.restoreSize":"Back to the side panel","tab.reload":"Reload","tab.rename":"Rename","tab.delete":"Move to trash","tab.deleteConfirm":'Move "{title}" to the trash? Its files stay in .trash for 7 days.',"tab.save":"Save","tab.saving":"Saving...","tab.saved":"Saved","tab.unsaved":"Unsaved changes","tab.frameTitle":"Artifact preview: {title}","tab.versionOf":"Version {version}","tab.viewingOld":"Viewing version {version}. The current version is {current}.","tab.backToCurrent":"Back to current","tab.restoreThis":"Restore this version","tab.discardConfirm":`Discard your unsaved changes?

Save first if you want to keep them.`,"tab.printOldVersion":"Go back to the current version to print it.","tab.conflictTitle":"This artifact changed","tab.conflictHint":"A newer version was saved while you were editing. Your draft is kept here. Copy it before discarding, then reload the latest version.","tab.deleted":"This artifact is no longer here","tab.deletedHint":"It was moved to the trash or deleted.","tab.close":"Close tab","tab.scripts":"Scripts run in a sandbox with no network access.","history.title":"Versions","history.current":"Current","history.byAgent":"Agent","history.byUser":"You","history.restored":"Restored from v{version}","history.created":"Created","history.updated":"Edited","history.empty":"No earlier versions.","export.html":"HTML file","export.md":"Markdown file","export.docx":"Word document","export.print":"Print or save as PDF","export.done":"Saved {name} to {path}","design.title":"Design system","design.hint":"Pages and documents use these values through CSS variables.","design.source.workspace":"This project overrides the library.","design.source.library":"Inherited from your library.","design.source.default":"Built-in defaults. Save to start your own.","design.name":"Name","design.colors":"Colors","design.color.primary":"Primary","design.color.accent":"Accent","design.color.surface":"Surface","design.color.text":"Text","design.color.muted":"Muted","design.type":"Typography","design.font":"Body font stack","design.mono":"Code font stack","design.radius":"Corner radius","design.radius.sm":"Small","design.radius.md":"Medium","design.radius.lg":"Large","design.notes":"Notes for the agent","design.notesHint":"Tone, layout rules, or brand guidance the agent reads before it designs.","design.saveWorkspace":"Save for this project","design.saveLibrary":"Save to library","design.clear":"Remove project override","design.saved":"Design system saved","design.preview":"Preview","design.previewHeading":"Quarterly review","design.previewBody":"Revenue grew in every region this quarter.","design.previewButton":"Primary action","card.created":"Created","card.updated":"Updated","card.open":"Open","card.working":"Writing the artifact...","card.failed":"The artifact was not saved","card.missing":"This result has no artifact details.","composer.label":"Artifacts","error.generic":"Something went wrong. Try again.","error.notFound":"This artifact no longer exists.","error.stale":"The artifact changed. Reload to continue.","error.tooLarge":"The content is over the 2 MiB limit.","error.noWorkspace":"This session has no workspace.","error.forbidden":"That path is not allowed.","error.corrupt":"The artifact files are damaged.","error.tokens":"A design value is not valid CSS.","error.library":"The library folder cannot be created.","error.surface":"The artifact panel failed to draw.","error.surfaceHint":"Reload the window. Your artifacts are safe on disk.","action.retry":"Retry","action.reloadWindow":"Reload window","time.justNow":"just now","time.minutes":"{count} min ago","time.hours":"{count} h ago","time.days":"{count} d ago"},Vt={"filter.scope":"\u6309\u5B58\u50A8\u4F4D\u7F6E\u7B5B\u9009","filter.type":"\u6309\u7C7B\u578B\u7B5B\u9009","tab.mode":"\u9875\u9762\u89C6\u56FE","tab.manualSave":"\u9875\u9762\u6E90\u7801\u9700\u70B9\u51FB\u4FDD\u5B58\u6216\u6309 Ctrl/Cmd+S\u3002","tab.autosave":"\u6587\u6863\u5728\u8F93\u5165\u540E\u81EA\u52A8\u4FDD\u5B58\u3002","tab.outputVersion":"\u8F93\u51FA\u4F7F\u7528\u5DF2\u4FDD\u5B58\u7684 v{version}","tab.leaveTitle":"\u4FDD\u7559\u66F4\u6539\uFF1F","tab.leaveHint":"\u7EE7\u7EED\u524D\u4FDD\u5B58\u66F4\u6539\uFF0C\u6216\u653E\u5F03\u66F4\u6539\u3002\u53D6\u6D88\u5C06\u4FDD\u7559\u5F53\u524D\u7F16\u8F91\u3002","tab.discardContinue":"\u653E\u5F03\u5E76\u7EE7\u7EED","tab.saveContinue":"\u4FDD\u5B58\u5E76\u7EE7\u7EED","tab.copyDraft":"\u590D\u5236\u6211\u7684\u8349\u7A3F","tab.discardReload":"\u653E\u5F03\u6211\u7684\u66F4\u6539\u5E76\u91CD\u65B0\u52A0\u8F7D","history.close":"\u5173\u95ED\u5386\u53F2","action.copied":"\u5DF2\u590D\u5236","action.copyFailed":"\u590D\u5236\u88AB\u963B\u6B62\u3002\u8BF7\u9009\u4E2D\u6587\u672C\u540E\u624B\u52A8\u590D\u5236\u3002","agent.edit":"\u8BF7\u667A\u80FD\u4F53\u7F16\u8F91","agent.review":"\u68C0\u67E5\u7F16\u8F91\u8BF7\u6C42","agent.copy":"\u590D\u5236\u7F16\u8F91\u8BF7\u6C42","agent.copyHint":"\u5C06\u8BF7\u6C42\u590D\u5236\u5230\u4F60\u9009\u62E9\u7684\u4F1A\u8BDD\u4E2D\u3002\u4E0D\u4F1A\u81EA\u52A8\u53D1\u9001\u3002","agent.request":`\u8BF7\u7F16\u8F91\u4EA7\u7269\u201C{title}\u201D\u3002
\u4EA7\u7269\u5730\u5740\uFF1A{address}
\u4EA7\u7269\u6807\u8BC6\uFF1A{id}
\u5B58\u50A8\u4F4D\u7F6E\uFF1A{scope}
\u9879\u76EE\uFF1A{workspace}
\u53C2\u8003\u7248\u672C\uFF1A{version}

\u9700\u8981\u7684\u66F4\u6539\uFF1A

\u66F4\u65B0\u524D\u8BF7\u8BFB\u53D6\u5F53\u524D\u4EA7\u7269\u3002\u5982\u679C\u4EA7\u7269\u81EA\u53C2\u8003\u7248\u672C\u540E\u5DF2\u66F4\u6539\uFF0C\u8BF7\u5148\u68C0\u67E5\u66F4\u6539\u3002\u8BF7\u66F4\u65B0\u6B64\u4EA7\u7269\uFF0C\u4E0D\u8981\u521B\u5EFA\u526F\u672C\u3002`,"format.toolbar":"\u6587\u6863\u683C\u5F0F","format.heading":"\u6807\u9898","format.bold":"\u7C97\u4F53","format.italic":"\u659C\u4F53","format.bulletList":"\u9879\u76EE\u7B26\u53F7\u5217\u8868","format.orderedList":"\u7F16\u53F7\u5217\u8868","format.codeBlock":"\u4EE3\u7801\u5757",panel:"\u4EA7\u7269","panel.workspace":"\u9879\u76EE","action.back":"\u8FD4\u56DE","guide.title":"\u4EA7\u7269","guide.description":"\u667A\u80FD\u4F53\u751F\u6210\u7684\u9875\u9762\u548C\u6587\u6863\uFF0C\u53EF\u67E5\u770B\u7248\u672C\u5E76\u5BFC\u51FA\u3002","scope.workspace":"\u5F53\u524D\u9879\u76EE","scope.library":"\u8D44\u6599\u5E93","scope.workspaceHint":"\u4FDD\u5B58\u5728\u672C\u9879\u76EE\u7684 .dsh/artifacts \u4E0B\u3002","scope.libraryHint":"\u4FDD\u5B58\u5728\u4E2A\u4EBA\u914D\u7F6E\u4E2D\uFF0C\u6240\u6709\u9879\u76EE\u5171\u4EAB\u3002","type.page":"\u9875\u9762","type.doc":"\u6587\u6863","type.all":"\u5168\u90E8\u7C7B\u578B","filter.all":"\u5168\u90E8","gallery.search":"\u641C\u7D22\u4EA7\u7269","gallery.searchLabel":"\u6309\u6807\u9898\u641C\u7D22","gallery.new":"\u65B0\u5EFA","gallery.newPage":"\u65B0\u5EFA\u9875\u9762","gallery.newDoc":"\u65B0\u5EFA\u6587\u6863","gallery.design":"\u8BBE\u8BA1\u7CFB\u7EDF","gallery.refresh":"\u5237\u65B0","gallery.more":"\u663E\u793A\u66F4\u591A","gallery.truncated":"\u4EC5\u626B\u63CF\u524D 500 \u4E2A\u4EA7\u7269\u3002","gallery.version":"v{version}","gallery.updated":"\u66F4\u65B0\u4E8E {time}","gallery.count":"{count} \u4E2A\u4EA7\u7269","empty.workspaceTitle":"\u672C\u9879\u76EE\u8FD8\u6CA1\u6709\u4EA7\u7269","empty.workspaceHint":"\u8BA9\u667A\u80FD\u4F53\u751F\u6210\u4EEA\u8868\u76D8\u3001\u62A5\u544A\u6216\u5355\u9875\uFF0C\u6216\u5728\u8FD9\u91CC\u65B0\u5EFA\u3002","empty.libraryTitle":"\u8D44\u6599\u5E93\u4E3A\u7A7A","empty.libraryHint":"\u8D44\u6599\u5E93\u4E2D\u7684\u4EA7\u7269\u5728\u6240\u6709\u9879\u76EE\u53EF\u7528\u3002\u8BA9\u667A\u80FD\u4F53\u628A\u4EA7\u7269\u4FDD\u5B58\u5230\u8D44\u6599\u5E93\u3002","empty.noMatch":"\u6CA1\u6709\u5339\u914D\u7684\u4EA7\u7269\u3002","empty.noWorkspace":"\u5728\u5DE5\u4F5C\u533A\u4E2D\u6253\u5F00\u4F1A\u8BDD\u4EE5\u67E5\u770B\u5176\u4EA7\u7269\u3002","empty.loading":"\u52A0\u8F7D\u4E2D...","create.title":"\u65B0\u5EFA{type}","create.name":"\u6807\u9898","create.scope":"\u4FDD\u5B58\u5230","create.submit":"\u521B\u5EFA","create.cancel":"\u53D6\u6D88","create.untitledPage":"\u672A\u547D\u540D\u9875\u9762","create.untitledDoc":"\u672A\u547D\u540D\u6587\u6863","tab.preview":"\u9884\u89C8","tab.source":"\u6E90\u7801","tab.history":"\u5386\u53F2","tab.export":"\u5BFC\u51FA","tab.maximize":"\u94FA\u6EE1\u7A97\u53E3","tab.restoreSize":"\u56DE\u5230\u4FA7\u8FB9\u680F","tab.reload":"\u91CD\u65B0\u52A0\u8F7D","tab.rename":"\u91CD\u547D\u540D","tab.delete":"\u79FB\u5230\u56DE\u6536\u7AD9","tab.deleteConfirm":"\u5C06\u201C{title}\u201D\u79FB\u5230\u56DE\u6536\u7AD9\uFF1F\u6587\u4EF6\u4F1A\u5728 .trash \u4E2D\u4FDD\u7559 7 \u5929\u3002","tab.save":"\u4FDD\u5B58","tab.saving":"\u6B63\u5728\u4FDD\u5B58...","tab.saved":"\u5DF2\u4FDD\u5B58","tab.unsaved":"\u6709\u672A\u4FDD\u5B58\u7684\u66F4\u6539","tab.frameTitle":"\u4EA7\u7269\u9884\u89C8\uFF1A{title}","tab.versionOf":"\u7248\u672C {version}","tab.viewingOld":"\u6B63\u5728\u67E5\u770B\u7248\u672C {version}\uFF0C\u5F53\u524D\u7248\u672C\u4E3A {current}\u3002","tab.backToCurrent":"\u56DE\u5230\u5F53\u524D\u7248\u672C","tab.restoreThis":"\u6062\u590D\u6B64\u7248\u672C","tab.discardConfirm":`\u653E\u5F03\u672A\u4FDD\u5B58\u7684\u66F4\u6539\uFF1F

\u5982\u9700\u4FDD\u7559\u8BF7\u5148\u4FDD\u5B58\u3002`,"tab.printOldVersion":"\u8BF7\u56DE\u5230\u5F53\u524D\u7248\u672C\u540E\u518D\u6253\u5370\u3002","tab.conflictTitle":"\u6B64\u4EA7\u7269\u5DF2\u66F4\u6539","tab.conflictHint":"\u7F16\u8F91\u671F\u95F4\u4FDD\u5B58\u4E86\u66F4\u65B0\u7248\u672C\u3002\u8349\u7A3F\u4ECD\u4FDD\u7559\u5728\u8FD9\u91CC\u3002\u653E\u5F03\u524D\u53EF\u5148\u590D\u5236\u8349\u7A3F\uFF0C\u518D\u91CD\u65B0\u52A0\u8F7D\u6700\u65B0\u7248\u672C\u3002","tab.deleted":"\u6B64\u4EA7\u7269\u5DF2\u4E0D\u5B58\u5728","tab.deletedHint":"\u5B83\u5DF2\u88AB\u79FB\u5230\u56DE\u6536\u7AD9\u6216\u5220\u9664\u3002","tab.close":"\u5173\u95ED\u6807\u7B7E\u9875","tab.scripts":"\u811A\u672C\u5728\u65E0\u7F51\u7EDC\u7684\u6C99\u7BB1\u4E2D\u8FD0\u884C\u3002","history.title":"\u7248\u672C","history.current":"\u5F53\u524D","history.byAgent":"\u667A\u80FD\u4F53","history.byUser":"\u4F60","history.restored":"\u4ECE v{version} \u6062\u590D","history.created":"\u521B\u5EFA","history.updated":"\u7F16\u8F91","history.empty":"\u6CA1\u6709\u66F4\u65E9\u7684\u7248\u672C\u3002","export.html":"HTML \u6587\u4EF6","export.md":"Markdown \u6587\u4EF6","export.docx":"Word \u6587\u6863","export.print":"\u6253\u5370\u6216\u53E6\u5B58\u4E3A PDF","export.done":"\u5DF2\u5C06 {name} \u4FDD\u5B58\u5230 {path}","design.title":"\u8BBE\u8BA1\u7CFB\u7EDF","design.hint":"\u9875\u9762\u548C\u6587\u6863\u901A\u8FC7 CSS \u53D8\u91CF\u4F7F\u7528\u8FD9\u4E9B\u503C\u3002","design.source.workspace":"\u672C\u9879\u76EE\u8986\u76D6\u4E86\u8D44\u6599\u5E93\u8BBE\u7F6E\u3002","design.source.library":"\u7EE7\u627F\u81EA\u8D44\u6599\u5E93\u3002","design.source.default":"\u5185\u7F6E\u9ED8\u8BA4\u503C\u3002\u4FDD\u5B58\u540E\u5373\u53EF\u81EA\u5B9A\u4E49\u3002","design.name":"\u540D\u79F0","design.colors":"\u989C\u8272","design.color.primary":"\u4E3B\u8272","design.color.accent":"\u5F3A\u8C03\u8272","design.color.surface":"\u5E95\u8272","design.color.text":"\u6587\u5B57","design.color.muted":"\u6B21\u8981","design.type":"\u5B57\u4F53","design.font":"\u6B63\u6587\u5B57\u4F53","design.mono":"\u4EE3\u7801\u5B57\u4F53","design.radius":"\u5706\u89D2","design.radius.sm":"\u5C0F","design.radius.md":"\u4E2D","design.radius.lg":"\u5927","design.notes":"\u7ED9\u667A\u80FD\u4F53\u7684\u8BF4\u660E","design.notesHint":"\u667A\u80FD\u4F53\u8BBE\u8BA1\u524D\u4F1A\u8BFB\u53D6\u7684\u8BED\u6C14\u3001\u6392\u7248\u89C4\u5219\u6216\u54C1\u724C\u89C4\u8303\u3002","design.saveWorkspace":"\u4FDD\u5B58\u5230\u672C\u9879\u76EE","design.saveLibrary":"\u4FDD\u5B58\u5230\u8D44\u6599\u5E93","design.clear":"\u79FB\u9664\u9879\u76EE\u8986\u76D6","design.saved":"\u8BBE\u8BA1\u7CFB\u7EDF\u5DF2\u4FDD\u5B58","design.preview":"\u9884\u89C8","design.previewHeading":"\u5B63\u5EA6\u56DE\u987E","design.previewBody":"\u672C\u5B63\u5EA6\u5404\u533A\u57DF\u6536\u5165\u5747\u6709\u589E\u957F\u3002","design.previewButton":"\u4E3B\u8981\u64CD\u4F5C","card.created":"\u5DF2\u521B\u5EFA","card.updated":"\u5DF2\u66F4\u65B0","card.open":"\u6253\u5F00","card.working":"\u6B63\u5728\u5199\u5165\u4EA7\u7269...","card.failed":"\u4EA7\u7269\u672A\u4FDD\u5B58","card.missing":"\u6B64\u7ED3\u679C\u6CA1\u6709\u4EA7\u7269\u4FE1\u606F\u3002","composer.label":"\u4EA7\u7269","error.generic":"\u51FA\u9519\u4E86\uFF0C\u8BF7\u91CD\u8BD5\u3002","error.notFound":"\u6B64\u4EA7\u7269\u5DF2\u4E0D\u5B58\u5728\u3002","error.stale":"\u4EA7\u7269\u5DF2\u66F4\u6539\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D\u3002","error.tooLarge":"\u5185\u5BB9\u8D85\u8FC7 2 MiB \u4E0A\u9650\u3002","error.noWorkspace":"\u6B64\u4F1A\u8BDD\u6CA1\u6709\u5DE5\u4F5C\u533A\u3002","error.forbidden":"\u4E0D\u5141\u8BB8\u8BBF\u95EE\u8BE5\u8DEF\u5F84\u3002","error.corrupt":"\u4EA7\u7269\u6587\u4EF6\u5DF2\u635F\u574F\u3002","error.tokens":"\u67D0\u4E2A\u8BBE\u8BA1\u503C\u4E0D\u662F\u6709\u6548\u7684 CSS\u3002","error.library":"\u65E0\u6CD5\u521B\u5EFA\u8D44\u6599\u5E93\u6587\u4EF6\u5939\u3002","error.surface":"\u4EA7\u7269\u9762\u677F\u7ED8\u5236\u5931\u8D25\u3002","error.surfaceHint":"\u8BF7\u91CD\u65B0\u52A0\u8F7D\u7A97\u53E3\u3002\u4F60\u7684\u4EA7\u7269\u4ECD\u5B89\u5168\u4FDD\u5B58\u5728\u78C1\u76D8\u4E0A\u3002","action.retry":"\u91CD\u8BD5","action.reloadWindow":"\u91CD\u65B0\u52A0\u8F7D\u7A97\u53E3","time.justNow":"\u521A\u521A","time.minutes":"{count} \u5206\u949F\u524D","time.hours":"{count} \u5C0F\u65F6\u524D","time.days":"{count} \u5929\u524D"};function Ve(e,t,r=Date.now()){let n=Math.max(0,r-Date.parse(t)),a=Math.floor(n/6e4);if(a<1)return e("time.justNow");if(a<60)return e("time.minutes",{count:a});let o=Math.floor(a/60);if(o<24)return e("time.hours",{count:o});let i=Math.floor(o/24);return i<7?e("time.days",{count:i}):new Date(t).toLocaleDateString()}var D=require("react/jsx-runtime");function _r(e,t){let r=t.source.origin==="agent"?e("history.byAgent"):e("history.byUser"),n=t.source.action==="restore"&&t.source.restoredFrom!==void 0?e("history.restored",{version:t.source.restoredFrom}):t.source.action==="create"?e("history.created"):e("history.updated");return`${r} \xB7 ${n} \xB7 ${Ve(e,t.createdAt)}`}function Wt({t:e,versions:t,failed:r,current:n,selected:a,onSelect:o,onClose:i}){return(0,D.jsxs)("aside",{className:"art-history","aria-label":e("history.title"),children:[(0,D.jsxs)("div",{className:"art-history-head",children:[(0,D.jsx)("span",{children:e("history.title")}),(0,D.jsx)("button",{type:"button",className:"art-text-button",onClick:i,children:e("history.close")})]}),t===null?(0,D.jsx)("p",{className:"art-note",children:e("empty.loading")}):null,r?(0,D.jsx)("p",{className:"art-note",children:e("error.generic")}):null,!r&&t!==null&&t.length<=1?(0,D.jsx)("p",{className:"art-note",children:e("history.empty")}):null,t?.map(p=>(0,D.jsxs)("button",{type:"button",className:"art-version","aria-current":p.version===a?"true":void 0,onClick:()=>o(p.version),children:[(0,D.jsxs)("span",{className:"art-version-top",children:[(0,D.jsx)("span",{children:e("tab.versionOf",{version:p.version})}),p.version===n?(0,D.jsx)("span",{className:"art-badge",children:e("history.current")}):null]}),(0,D.jsx)("span",{className:"art-version-sub",children:_r(e,p)})]},p.version))]})}var Na=require("react"),m=require("react/jsx-runtime");function O({children:e,size:t=16}){return(0,m.jsx)("svg",{viewBox:"0 0 24 24",width:t,height:t,fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:e})}var ye=({size:e})=>(0,m.jsxs)(O,{size:e,children:[(0,m.jsx)("rect",{x:"3.5",y:"3.5",width:"7",height:"7",rx:"1.5"}),(0,m.jsx)("rect",{x:"13.5",y:"3.5",width:"7",height:"7",rx:"1.5"}),(0,m.jsx)("rect",{x:"3.5",y:"13.5",width:"7",height:"7",rx:"1.5"}),(0,m.jsx)("path",{d:"M17 13.5v7M13.5 17h7"})]}),Z=({size:e})=>(0,m.jsxs)(O,{size:e,children:[(0,m.jsx)("rect",{x:"3.5",y:"4.5",width:"17",height:"15",rx:"2"}),(0,m.jsx)("path",{d:"M3.5 8.5h17M9 13l-2 1.8L9 16.5M15 13l2 1.8-2 1.7"})]}),ne=({size:e})=>(0,m.jsxs)(O,{size:e,children:[(0,m.jsx)("path",{d:"M6.5 3.5h7l4 4v13h-11z"}),(0,m.jsx)("path",{d:"M13.5 3.5v4h4M9 12h6M9 15.5h6"})]}),_t=()=>(0,m.jsx)(O,{children:(0,m.jsx)("path",{d:"M12 5v14M5 12h14"})}),Ut=()=>(0,m.jsx)(O,{children:(0,m.jsx)("path",{d:"M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"})}),qt=()=>(0,m.jsxs)(O,{children:[(0,m.jsx)("path",{d:"M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"}),(0,m.jsx)("path",{d:"M4.5 4.5V9H9M12 8v4.5l3 2"})]}),Gt=()=>(0,m.jsx)(O,{children:(0,m.jsx)("path",{d:"M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"})});var Kt=()=>(0,m.jsxs)(O,{children:[(0,m.jsx)("circle",{cx:"6",cy:"12",r:".8"}),(0,m.jsx)("circle",{cx:"12",cy:"12",r:".8"}),(0,m.jsx)("circle",{cx:"18",cy:"12",r:".8"})]}),Yt=()=>(0,m.jsxs)(O,{children:[(0,m.jsx)("path",{d:"M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.4 1.6-2.4h1.8a3.7 3.7 0 0 0 3.7-3.7c0-5-3.8-9-8.5-9Z"}),(0,m.jsx)("circle",{cx:"7.8",cy:"11",r:"1"}),(0,m.jsx)("circle",{cx:"10.5",cy:"7.3",r:"1"}),(0,m.jsx)("circle",{cx:"15",cy:"7.5",r:"1"})]}),We=()=>(0,m.jsx)(O,{children:(0,m.jsx)("path",{d:"M14.5 6 8.5 12l6 6"})}),Xt=()=>(0,m.jsxs)(O,{children:[(0,m.jsx)("path",{d:"M5 4.5h11l3 3v12H5z"}),(0,m.jsx)("path",{d:"M8 4.5V9h7V4.5M8 19.5v-5h8v5"})]});var Ae=require("react"),he=require("react/jsx-runtime");function Re({label:e,items:t,onClose:r}){let n=(0,Ae.useRef)(null),a=(0,Ae.useRef)(null);return(0,Ae.useEffect)(()=>{a.current=document.activeElement,n.current?.querySelector("button")?.focus();let o=i=>{i.target instanceof Node&&n.current?.contains(i.target)!==!0&&r()};return document.addEventListener("pointerdown",o,!0),()=>{document.removeEventListener("pointerdown",o,!0),a.current instanceof HTMLElement&&a.current.focus()}},[r]),(0,he.jsx)("div",{ref:n,className:"art-menu",role:"menu","aria-label":e,onKeyDown:o=>{let i=[...n.current?.querySelectorAll("button")??[]],p=i.findIndex(c=>c===document.activeElement);o.key==="Escape"?(o.preventDefault(),o.stopPropagation(),r()):o.key==="ArrowDown"?(o.preventDefault(),i[(p+1)%i.length]?.focus()):o.key==="ArrowUp"&&(o.preventDefault(),i[(p-1+i.length)%i.length]?.focus())},children:t.map(o=>(0,he.jsxs)("div",{role:"none",children:[o.separatorBefore===!0?(0,he.jsx)("hr",{}):null,(0,he.jsxs)("button",{type:"button",role:"menuitem",onClick:()=>{r(),o.run()},children:[o.icon,o.label]})]},o.id))})}var ce=require("react");var _e=require("react/jsx-runtime");function Ue({content:e,designCss:t,title:r,frameTitle:n}){let[a,o]=(0,ce.useState)(null),[i,p]=(0,ce.useState)(!1),c=(0,ce.useRef)(0);return(0,ce.useEffect)(()=>{c.current=0,p(!1);let y=URL.createObjectURL(new Blob([$t(e,t,r)],{type:"text/html"}));return o(y),()=>URL.revokeObjectURL(y)},[e,t,r]),i?(0,_e.jsx)("div",{className:"art-center",role:"alert",children:r}):a===null?null:(0,_e.jsx)("iframe",{className:"art-frame",title:n,sandbox:Ft,referrerPolicy:"no-referrer",src:a,onLoad:()=>{c.current+=1,c.current>1&&p(!0)}},a)}function Zt({value:e,readOnly:t,label:r,onChange:n,onSave:a}){return(0,_e.jsx)("textarea",{className:"art-source","aria-label":r,spellCheck:!1,readOnly:t,value:e,onChange:o=>n(o.target.value),onKeyDown:o=>{if((o.ctrlKey||o.metaKey)&&o.key.toLowerCase()==="s"){o.preventDefault(),a();return}if(o.key==="Tab"&&!o.shiftKey&&!t){o.preventDefault();let i=o.currentTarget,p=i.selectionStart,c=i.selectionEnd,y=`${e.slice(0,p)}  ${e.slice(c)}`;n(y),requestAnimationFrame(()=>i.setSelectionRange(p+2,p+2))}}})}var s=require("react/jsx-runtime");function st(e){let t=e.useTabInfo(),r=re(t.tab.contentId??t.tab.navigation?.address),n=e.useWorkspaces(a=>a.items.find(o=>r?.scope==="workspace"&&o.workspaceId===r.workspaceId)?.title);return r===void 0?(0,s.jsx)("section",{className:"art-root",children:(0,s.jsx)("p",{children:e.t("error.notFound")})}):(0,s.jsx)(Jt,{t:e.t,address:r,useTabInfo:e.useTabInfo,onBack:t.tab.actions?.close,workspaceName:n},H(r))}function Qt({t:e,address:t,onBack:r,workspaceName:n}){return(0,s.jsx)(Jt,{t:e,address:t,onBack:r,workspaceName:n,back:!0},H(t))}function Jt({t:e,address:t,useTabInfo:r,onBack:n,workspaceName:a,back:o}){let{model:i,state:p}=Lt(t),{payload:c,draft:y,saving:h,conflict:f,failure:w}=p,u=i.where,g=t.id,[F,J]=(0,k.useState)("preview"),[N,q]=(0,k.useState)(!1),[ee,oe]=(0,k.useState)(null),[pe,x]=(0,k.useState)(!1),[$,W]=(0,k.useState)(!1),[A,ue]=(0,k.useState)(null),[fe,Pe]=(0,k.useState)(null),[mr,Ee]=(0,k.useState)(!1),[Xe,gt]=(0,k.useState)(""),[xe,we]=(0,k.useState)(null),[_,te]=(0,k.useState)(!1),[Ze,Me]=(0,k.useState)(null),G=(0,k.useRef)(0),Qe=(0,k.useRef)(null),mt=Pt(g),bt=r?.();(0,k.useEffect)(()=>{i.externalVersion(mt)},[mt,i,h,c?.version]);let ie=(0,k.useCallback)(d=>{i.getSnapshot().draft!==null||i.getSnapshot().saving?we({run:d}):d()},[i]),Je=(0,k.useCallback)(()=>{++G.current,W(!1),ue(null)},[]),De=(0,k.useCallback)(async()=>{Je(),await i.discardAndReload()},[i,Je]);(0,k.useEffect)(()=>bt?.tab.actions?.bindCommands({refresh:()=>ie(De)}),[bt?.tab.actions,ie,De]),(0,k.useEffect)(()=>{if(c?.manifest.type!=="doc"||y===null||f||h)return;let d=setTimeout(()=>void i.save(),1200);return()=>clearTimeout(d)},[y,f,h,i,c?.manifest.type]),(0,k.useEffect)(()=>{if(xe===null)return;let d=document.activeElement;return Qe.current?.querySelector("button")?.focus(),()=>{d instanceof HTMLElement&&d.isConnected&&d.focus()}},[xe]),(0,k.useEffect)(()=>{if(!N||c===null)return;let d=new AbortController;return oe(null),x(!1),T.history(u,g,d.signal).then(S=>{d.signal.aborted||oe(S.versions)}).catch(()=>{d.signal.aborted||x(!0)}),()=>d.abort()},[N,c?.version,i]),(0,k.useEffect)(()=>()=>{++G.current},[]);let br=async d=>{let S=++G.current;if(d===c?.version){W(!1),ue(null);return}W(!0);try{let K=await T.get(u,g,d);S===G.current&&ue(K)}catch(K){S===G.current&&M(e(R(E(K))))}finally{S===G.current&&W(!1)}},yt=async()=>$?null:A!==null?A.version:await i.save()?i.getSnapshot().payload?.version??null:null,ht=async d=>{if(!_){te(!0);try{let S=await yt();if(S===null)return;if(d==="print")Bt((await T.printable(u,g,S)).html);else{let K=await T.exportFile(u,g,d,S);Ct(K),M(e("export.done",{name:K.fileName,path:K.path}))}}catch(S){M(e(R(E(S))))}finally{te(!1)}}},yr=async()=>{Xe.trim()===""||h||await i.save(Xe.trim())&&Ee(!1)},hr=async()=>{if(A===null||_)return;let d=A.version;ie(async()=>{te(!0);try{let S=await T.restore(u,g,d,i.getSnapshot().payload?.version??0);le(g,S.manifest.version),Y(),Je(),await i.load()}catch(S){M(e(R(E(S))))}finally{te(!1)}})},vt=async d=>{try{await navigator.clipboard.writeText(d),M(e("action.copied"))}catch{Me(d),M(e("action.copyFailed"))}},xt=async()=>{if(!_){te(!0);try{let d=await yt();d!==null&&Me(e("agent.request",{title:c?.manifest.title??g,address:H(t),id:g,scope:t.scope,workspace:t.scope==="workspace"?t.workspaceId:e("scope.library"),version:d}))}finally{te(!1)}}};if(c===null)return(0,s.jsx)("section",{className:"art-root","data-dsh-artifacts":"",children:(0,s.jsxs)("div",{className:"art-center",role:w===void 0?"status":"alert",children:[(0,s.jsx)("p",{children:e(w===void 0?"empty.loading":R(w))}),w===void 0?null:(0,s.jsx)("button",{className:"art-button",onClick:()=>void i.load(),children:e("action.retry")}),n===void 0?null:(0,s.jsx)("button",{className:"art-button",onClick:n,children:e("tab.close")})]})});let et=A?.content??y??c.content,Ie=A!==null,vr=e(h?"tab.saving":f?"error.stale":w!==void 0?R(w):y!==null?"tab.unsaved":"tab.saved");return(0,s.jsxs)("section",{className:"art-root","data-dsh-artifacts":"","data-artifact-id":g,"aria-busy":_,children:[(0,s.jsxs)("header",{className:"art-header art-editor-header",children:[(0,s.jsxs)("div",{className:"art-heading",children:[!o||n===void 0?null:(0,s.jsx)("button",{className:"art-icon-button","aria-label":e("action.back"),title:e("action.back"),onClick:()=>ie(n),children:(0,s.jsx)(We,{})}),(0,s.jsxs)("div",{className:"art-identity",children:[(0,s.jsx)("span",{className:"art-title",title:c.manifest.title,children:c.manifest.title}),(0,s.jsxs)("span",{className:"art-meta",children:[t.scope==="workspace"?a??t.workspaceId:e("scope.library")," \xB7 ",e(`scope.${t.scope}`)," \xB7 ",e("gallery.version",{version:c.version})]})]})]}),(0,s.jsxs)("div",{className:"art-actions art-editor-actions",children:[c.manifest.type!=="page"?null:(0,s.jsxs)("div",{className:"art-segment",role:"group","aria-label":e("tab.mode"),children:[(0,s.jsx)("button",{type:"button","aria-pressed":F==="preview",onClick:()=>J("preview"),children:e("tab.preview")}),(0,s.jsx)("button",{type:"button","aria-pressed":F==="source",onClick:()=>J("source"),children:e("tab.source")})]}),y===null||Ie?null:(0,s.jsx)("button",{className:"art-icon-button","aria-label":e("tab.save"),title:e("tab.save"),disabled:f,onClick:()=>void i.save(),children:(0,s.jsx)(Xt,{})}),(0,s.jsx)("button",{className:"art-icon-button","aria-label":e("tab.history"),title:e("tab.history"),"aria-pressed":N,onClick:()=>{q(d=>!d),++G.current,W(!1),ue(null)},children:(0,s.jsx)(qt,{})}),(0,s.jsxs)("button",{className:"art-button","aria-label":e("tab.export"),"aria-haspopup":"menu","aria-expanded":fe==="export",disabled:_||$,onClick:()=>Pe(fe==="export"?null:"export"),children:[(0,s.jsx)(Gt,{}),e("tab.export")]}),(0,s.jsx)("button",{className:"art-icon-button","aria-label":e("gallery.more"),title:e("gallery.more"),"aria-haspopup":"menu","aria-expanded":fe==="more",onClick:()=>Pe(fe==="more"?null:"more"),children:(0,s.jsx)(Kt,{})})]}),fe==="export"?(0,s.jsx)(Re,{label:e("tab.export"),onClose:()=>Pe(null),items:[...kt[c.manifest.type].map(d=>({id:d,label:e(`export.${d}`),run:()=>void ht(d)})),{id:"print",label:e("export.print"),separatorBefore:!0,run:()=>void ht("print")}]}):null,fe==="more"?(0,s.jsx)(Re,{label:e("gallery.more"),onClose:()=>Pe(null),items:[{id:"rename",label:e("tab.rename"),run:()=>{gt(c.manifest.title),Ee(!0)}},{id:"reload",label:e("tab.reload"),run:()=>ie(De)},{id:"agent",label:e("agent.edit"),run:()=>void xt()},{id:"delete",label:e("tab.delete"),separatorBefore:!0,run:()=>{window.confirm(e("tab.deleteConfirm",{title:c.manifest.title}))&&ie(async()=>{try{await T.remove(u,g),Y(),n?.()}catch(d){M(e(R(E(d))))}})}}]}):null]}),mr?(0,s.jsxs)("form",{className:"art-inline-form",onSubmit:d=>{d.preventDefault(),yr()},children:[(0,s.jsx)("input",{"aria-label":e("tab.rename"),value:Xe,maxLength:120,autoFocus:!0,onChange:d=>gt(d.target.value),onKeyDown:d=>{d.key==="Escape"&&Ee(!1)}}),(0,s.jsx)("button",{className:"art-button",disabled:h||f,children:e("tab.save")}),(0,s.jsx)("button",{className:"art-button",type:"button",onClick:()=>Ee(!1),children:e("create.cancel")})]}):null,(0,s.jsxs)("div",{className:"art-edit-strip",children:[(0,s.jsx)("span",{"aria-live":"polite",children:$?e("empty.loading"):Ie?e("tab.versionOf",{version:A.version}):vr}),(0,s.jsx)("button",{className:"art-text-button",disabled:_||f||$,onClick:()=>void xt(),children:e("agent.edit")})]}),Ze===null?null:(0,s.jsxs)("div",{className:"art-request",children:[(0,s.jsxs)("label",{className:"art-field",children:[e("agent.review"),(0,s.jsx)("textarea",{value:Ze,onChange:d=>Me(d.target.value)})]}),(0,s.jsx)("p",{className:"art-note",children:e("agent.copyHint")}),(0,s.jsxs)("div",{className:"art-form-actions",children:[(0,s.jsx)("button",{className:"art-button",onClick:()=>Me(null),children:e("create.cancel")}),(0,s.jsx)("button",{className:"art-button art-button-primary",onClick:()=>void vt(Ze),children:e("agent.copy")})]})]}),f?(0,s.jsxs)("div",{className:"art-bar","data-tone":"warn",role:"alert",children:[(0,s.jsxs)("span",{className:"art-bar-text",children:[(0,s.jsx)("strong",{children:e("tab.conflictTitle")}),(0,s.jsx)("span",{children:e("tab.conflictHint")})]}),(0,s.jsxs)("span",{className:"art-bar-actions",children:[(0,s.jsx)("button",{className:"art-button",onClick:()=>void vt(y??""),children:e("tab.copyDraft")}),(0,s.jsx)("button",{className:"art-button",onClick:()=>ie(De),children:e("tab.discardReload")})]})]}):null,!f&&w!==void 0?(0,s.jsxs)("div",{className:"art-bar",role:"alert",children:[(0,s.jsx)("span",{children:e(R(w))}),(0,s.jsx)("button",{className:"art-button",onClick:()=>void i.save(),children:e("action.retry")})]}):null,A===null?null:(0,s.jsxs)("div",{className:"art-bar",role:"status",children:[(0,s.jsx)("span",{children:e("tab.viewingOld",{version:A.version,current:c.version})}),(0,s.jsxs)("span",{className:"art-bar-actions",children:[(0,s.jsx)("button",{className:"art-button",onClick:()=>{++G.current,W(!1),ue(null)},children:e("tab.backToCurrent")}),(0,s.jsx)("button",{className:"art-button",disabled:_,onClick:()=>void hr(),children:e("tab.restoreThis")})]})]}),(0,s.jsxs)("div",{className:"art-body",children:[(0,s.jsx)("div",{className:"art-stage",children:c.manifest.type==="page"?F==="preview"?(0,s.jsx)(Ue,{content:et,designCss:c.designCss,title:c.manifest.title,frameTitle:e("tab.frameTitle",{title:c.manifest.title})}):(0,s.jsx)(Zt,{value:et,readOnly:Ie,label:e("tab.source"),onChange:d=>i.edit(d),onSave:()=>void i.save()}):(0,s.jsx)(Oe,{markdown:et,revision:`${A?.version??0}:${p.revision}`,editable:!Ie&&!f,label:c.manifest.title,loadingLabel:e("empty.loading"),failedLabel:e("error.generic"),t:e,onChange:d=>i.edit(d),onSave:()=>void i.save()})}),N?(0,s.jsx)(Wt,{t:e,versions:ee,failed:pe,current:c.version,selected:A?.version??c.version,onSelect:d=>void br(d),onClose:()=>{++G.current,W(!1),ue(null),q(!1)}}):null]}),(0,s.jsxs)("footer",{className:"art-status",children:[(0,s.jsx)("span",{children:e(c.manifest.type==="page"?"tab.manualSave":"tab.autosave")}),(0,s.jsx)("span",{children:e("tab.outputVersion",{version:A?.version??c.version})})]}),xe===null?null:(0,s.jsx)("div",{className:"art-dialog-shade",children:(0,s.jsxs)("div",{className:"art-dialog",role:"alertdialog","aria-modal":"true","aria-label":e("tab.leaveTitle"),"aria-describedby":`leave-hint-${g}`,ref:Qe,onKeyDown:d=>{if(d.key==="Escape"&&(d.stopPropagation(),we(null)),d.key==="Tab"){let S=[...Qe.current?.querySelectorAll("button:not(:disabled)")??[]],K=S.findIndex(xr=>xr===document.activeElement);d.preventDefault(),S[(K+(d.shiftKey?-1:1)+S.length)%S.length]?.focus()}},children:[(0,s.jsx)("h2",{children:e("tab.leaveTitle")}),(0,s.jsx)("p",{id:`leave-hint-${g}`,children:e(f?"tab.conflictHint":"tab.leaveHint")}),w===void 0?null:(0,s.jsx)("p",{role:"alert",children:e(R(w))}),(0,s.jsxs)("div",{className:"art-form-actions",children:[(0,s.jsx)("button",{className:"art-button",disabled:_,onClick:()=>we(null),children:e("create.cancel")}),(0,s.jsx)("button",{className:"art-button",disabled:h||_,onClick:()=>{let d=xe.run;we(null),i.discardAndReload().then(d)},children:e("tab.discardContinue")}),(0,s.jsx)("button",{className:"art-button art-button-primary",disabled:f||_,onClick:async()=>{te(!0);let d=await i.save();if(te(!1),d){let S=xe.run;we(null),await S()}},children:e("tab.saveContinue")})]})]})})]})}var er=Ar(require("react"),1),de=require("react/jsx-runtime"),qe=class extends er.default.Component{constructor(t){super(t),this.state={failed:!1}}static getDerivedStateFromError(){return{failed:!0}}render(){return this.state.failed?(0,de.jsx)("section",{className:"art-root","data-dsh-artifacts":"",children:(0,de.jsxs)("div",{className:"art-center",role:"alert",children:[(0,de.jsx)("p",{className:"art-center-title",children:this.props.title}),(0,de.jsx)("p",{className:"art-center-hint",children:this.props.hint}),(0,de.jsx)("button",{type:"button",className:"art-button",onClick:()=>window.location.reload(),children:this.props.reloadLabel})]})}):this.props.children}};var tr=require("react");var ve={sidebarRight:null};var v=require("react/jsx-runtime");function Ur(e){if(e===null||typeof e!="object")return null;let t={...e},{id:r,type:n,title:a,version:o,workspaceId:i}=t;if(t.kind!=="artifact"||typeof r!="string"||typeof a!="string"||typeof o!="number"||n!=="page"&&n!=="doc")return null;let p=Nt(r);return p===void 0?null:p==="workspace"?typeof i!="string"||i===""?null:{id:r,type:n,title:a,version:o,address:{scope:p,workspaceId:i,id:r}}:{id:r,type:n,title:a,version:o,address:{scope:p,id:r}}}function qr(e){return Array.isArray(e)?e.map(t=>{if(t===null||typeof t!="object")return"";let r={...t};return r.type==="text"&&typeof r.text=="string"?r.text:""}).filter(t=>t!=="").join(`
`).trim():""}function lt({t:e,phase:t,toolName:r,block:n}){let a=t==="result"&&n?.isError!==!0?Ur(n?.meta):null;if((0,tr.useEffect)(()=>{a!==null&&(se(a.id,a.title),le(a.id,a.version),Y())},[a?.id,a?.version,a?.title]),t!=="result")return(0,v.jsxs)("div",{className:"art-card","data-artifact-card":"working",children:[(0,v.jsx)("span",{className:"art-card-icon",children:(0,v.jsx)(Z,{})}),(0,v.jsx)("span",{className:"art-card-status",role:"status",children:e("card.working")}),(0,v.jsx)("span",{})]});if(n?.isError===!0)return(0,v.jsxs)("div",{className:"art-card","data-artifact-card":"error",children:[(0,v.jsx)("span",{className:"art-card-icon",children:(0,v.jsx)(Z,{})}),(0,v.jsxs)("span",{className:"art-card-text",children:[(0,v.jsx)("span",{className:"art-card-title",children:e("card.failed")}),(0,v.jsx)("span",{className:"art-card-status","data-tone":"error",children:qr(n.content)})]}),(0,v.jsx)("span",{})]});if(a===null)return(0,v.jsxs)("div",{className:"art-card","data-artifact-card":"missing",children:[(0,v.jsx)("span",{className:"art-card-icon",children:(0,v.jsx)(Z,{})}),(0,v.jsx)("span",{className:"art-card-status",children:e("card.missing")}),(0,v.jsx)("span",{})]});let o=H(a.address);return(0,v.jsxs)("div",{className:"art-card","data-artifact-card":"ready","data-artifact-id":a.id,children:[(0,v.jsx)("span",{className:"art-card-icon",children:a.type==="page"?(0,v.jsx)(Z,{}):(0,v.jsx)(ne,{})}),(0,v.jsxs)("span",{className:"art-card-text",children:[(0,v.jsx)("span",{className:"art-card-title",title:a.title,children:a.title}),(0,v.jsxs)("span",{className:"art-card-sub",children:[(0,v.jsx)("span",{children:e(r==="artifact_update"?"card.updated":"card.created")}),(0,v.jsx)("span",{children:"\xB7"}),(0,v.jsx)("span",{children:e(`type.${a.type}`)}),(0,v.jsx)("span",{className:"art-badge","data-scope":a.address.scope,children:e(`scope.${a.address.scope}`)}),(0,v.jsx)("span",{children:e("gallery.version",{version:a.version})})]})]}),(0,v.jsx)("button",{type:"button",className:"art-button",onClick:()=>ve.sidebarRight?.openResource(o),children:e("card.open")})]})}var ct=require("react/jsx-runtime"),dt="artifacts";function rr({t:e}){return(0,ct.jsx)("button",{type:"button",className:"art-composer","aria-label":e("composer.label"),title:e("composer.label"),onClick:()=>ve.sidebarRight?.openTab(dt),children:(0,ct.jsx)(ye,{})})}var C=require("react");var ar=require("react");function nr({sessionId:e,useSessions:t,useWorkspaces:r}){let n=r(o=>o.items),a=t(o=>o.byId[e]);return(0,ar.useMemo)(()=>{let o=typeof a?.cwd=="string"?a.cwd:null,i=n.find(p=>p.sessionIds?.includes(e))??n.find(p=>o!==null&&(o===p.path||o.startsWith(`${p.path}/`)))??null;return{root:o??i?.path??null,workspaceId:i?.workspaceId??null}},[n,a,e])}var Q=require("react");var b=require("react/jsx-runtime"),Gr=["primary","accent","surface","text","muted"],Kr=["sm","md","lg"],Yr=e=>`<!doctype html><html><head><style>
body { margin: 0; padding: 20px; font-family: var(--artifact-font-family); background: var(--artifact-color-surface); color: var(--artifact-color-text); }
h2 { margin: 0 0 6px; font-size: var(--artifact-font-size-4); letter-spacing: -0.02em; }
p { margin: 0 0 14px; color: var(--artifact-color-muted); }
.row { display: flex; gap: 8px; align-items: center; }
button { padding: 8px 14px; border: 0; border-radius: var(--artifact-radius-md); background: var(--artifact-color-primary); color: #fff; font: inherit; }
.tag { padding: 3px 8px; border-radius: var(--artifact-radius-sm); background: var(--artifact-color-accent); color: #fff; font-size: 12px; }
code { font-family: var(--artifact-font-mono); font-size: 12px; }
</style></head><body><h2>${e("design.previewHeading")}</h2><p>${e("design.previewBody")}</p>
<div class="row"><button>${e("design.previewButton")}</button><span class="tag">+12%</span><code>var(--artifact-color-primary)</code></div></body></html>`;function Xr(e){return/^#[0-9a-f]{6}$/i.test(e)}function or({t:e,workspaceId:t}){let[r,n]=(0,Q.useState)(null),[a,o]=(0,Q.useState)(null),[i,p]=(0,Q.useState)(!1),[c,y]=(0,Q.useState)(!1);(0,Q.useEffect)(()=>{let u=new AbortController;return T.designSystem(t,u.signal).then(g=>{n(g),o(g.tokens)}).catch(()=>{u.signal.aborted||p(!0)}),()=>u.abort()},[t]);let h=(0,Q.useMemo)(()=>a===null?"":St(a),[a]);if(i)return(0,b.jsx)("p",{className:"art-note",children:e("error.generic")});if(r===null||a===null)return(0,b.jsx)("p",{className:"art-note",children:e("empty.loading")});let f=async u=>{y(!0);try{let g=await T.saveDesignSystem({scope:u,workspaceId:t},a);n(g),o(g.tokens),M(e("design.saved"))}catch(g){M(e(R(E(g))))}finally{y(!1)}},w=async()=>{if(t!==null){y(!0);try{let u=await T.clearDesignSystem(t);n(u),o(u.tokens)}catch(u){M(e(R(E(u))))}finally{y(!1)}}};return(0,b.jsxs)("div",{className:"art-design",children:[(0,b.jsxs)("p",{className:"art-design-source",children:[e("design.hint")," ",e(`design.source.${r.source}`)]}),(0,b.jsxs)("div",{className:"art-design-group",children:[(0,b.jsx)("h3",{children:e("design.preview")}),(0,b.jsx)("div",{className:"art-design-preview",style:{height:150,display:"flex"},children:(0,b.jsx)(Ue,{content:Yr(e),designCss:h,title:a.name,frameTitle:e("design.preview")})})]}),(0,b.jsxs)("label",{className:"art-field",children:[e("design.name"),(0,b.jsx)("input",{type:"text",value:a.name,maxLength:80,onChange:u=>o({...a,name:u.target.value})})]}),(0,b.jsxs)("div",{className:"art-design-group",children:[(0,b.jsx)("h3",{children:e("design.colors")}),(0,b.jsx)("div",{className:"art-swatches",children:Gr.map(u=>(0,b.jsxs)("div",{className:"art-swatch",children:[(0,b.jsx)("input",{type:"color","aria-label":e(`design.color.${u}`),value:Xr(a.colors[u])?a.colors[u]:"#000000",onChange:g=>o({...a,colors:{...a.colors,[u]:g.target.value}})}),(0,b.jsxs)("span",{className:"art-swatch-text",children:[e(`design.color.${u}`),(0,b.jsx)("input",{type:"text","aria-label":`${e(`design.color.${u}`)} CSS`,value:a.colors[u],onChange:g=>o({...a,colors:{...a.colors,[u]:g.target.value}})})]})]},u))})]}),(0,b.jsxs)("div",{className:"art-design-group",children:[(0,b.jsx)("h3",{children:e("design.type")}),(0,b.jsxs)("label",{className:"art-field",children:[e("design.font"),(0,b.jsx)("input",{type:"text",value:a.typography.fontFamily,onChange:u=>o({...a,typography:{...a.typography,fontFamily:u.target.value}})})]}),(0,b.jsxs)("label",{className:"art-field",children:[e("design.mono"),(0,b.jsx)("input",{type:"text",value:a.typography.monoFamily,onChange:u=>o({...a,typography:{...a.typography,monoFamily:u.target.value}})})]})]}),(0,b.jsxs)("div",{className:"art-design-group",children:[(0,b.jsx)("h3",{children:e("design.radius")}),(0,b.jsx)("div",{className:"art-radius-row",children:Kr.map(u=>(0,b.jsxs)("label",{children:[e(`design.radius.${u}`),(0,b.jsx)("input",{type:"number",min:0,max:64,value:a.radius[u],onChange:g=>o({...a,radius:{...a.radius,[u]:Number(g.target.value)||0}})})]},u))})]}),(0,b.jsxs)("label",{className:"art-field",children:[e("design.notes"),(0,b.jsx)("textarea",{value:a.notes,maxLength:4e3,onChange:u=>o({...a,notes:u.target.value})}),(0,b.jsx)("span",{className:"art-field-hint",children:e("design.notesHint")})]}),(0,b.jsxs)("div",{className:"art-design-actions",children:[t===null?null:(0,b.jsx)("button",{type:"button",className:"art-button art-button-primary",disabled:c,onClick:()=>void f("workspace"),children:e("design.saveWorkspace")}),(0,b.jsx)("button",{type:"button",className:t===null?"art-button art-button-primary":"art-button",disabled:c,onClick:()=>void f("library"),children:e("design.saveLibrary")}),r.source==="workspace"&&t!==null?(0,b.jsx)("button",{type:"button",className:"art-button",disabled:c,onClick:()=>void w(),children:e("design.clear")}):null]})]})}var Zr=`<!doctype html>
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
`,Qr=`# {{title}}

Start writing, or ask the agent to draft this document.
`;function ir(e,t){if(e==="doc")return Qr.replace("{{title}}",t.replace(/[\\`*_[\]#]/g,n=>`\\${n}`));let r=t.replace(/[&<>"']/g,n=>`&#${n.charCodeAt(0)};`);return Zr.replace("{{title}}",r)}var l=require("react/jsx-runtime");function Jr(e,t,r){if(e!==void 0)if(se(t.id,t.title),t.scope==="workspace"){if(r===null)return;e(H({scope:"workspace",workspaceId:r,id:t.id}))}else e(H({scope:"library",id:t.id}))}function sr({t:e,scope:t,state:r,query:n,onOpen:a,onMore:o,onCreate:i,onRetry:p}){let c=(0,C.useId)();return(0,l.jsxs)("section",{className:"art-section","aria-labelledby":c,children:[(0,l.jsxs)("div",{className:"art-section-head",children:[(0,l.jsx)("h2",{className:"art-section-title",id:c,children:e(`scope.${t}`)}),(0,l.jsx)("span",{className:"art-section-hint",children:r.status==="ready"&&r.page.total>0?e("gallery.count",{count:r.page.total}):e(`scope.${t}Hint`)})]}),r.status==="loading"?(0,l.jsx)("p",{className:"art-note",children:e("empty.loading")}):null,r.status==="failed"?(0,l.jsxs)("div",{className:"art-empty",role:"alert",children:[(0,l.jsx)("p",{className:"art-empty-title",children:e(R(r.code))}),(0,l.jsx)("button",{type:"button",className:"art-button",onClick:p,children:e("action.retry")})]}):null,r.status==="ready"&&r.page.items.length===0?n!==""?(0,l.jsx)("p",{className:"art-note",children:e("empty.noMatch")}):(0,l.jsxs)("div",{className:"art-empty",children:[(0,l.jsx)("p",{className:"art-empty-title",children:e(t==="workspace"?"empty.workspaceTitle":"empty.libraryTitle")}),(0,l.jsx)("p",{className:"art-empty-hint",children:e(t==="workspace"?"empty.workspaceHint":"empty.libraryHint")}),(0,l.jsxs)("div",{className:"art-empty-actions",children:[(0,l.jsxs)("button",{type:"button",className:"art-button",onClick:()=>i("page",t),children:[(0,l.jsx)(Z,{size:14}),e("gallery.newPage")]}),(0,l.jsxs)("button",{type:"button",className:"art-button",onClick:()=>i("doc",t),children:[(0,l.jsx)(ne,{size:14}),e("gallery.newDoc")]})]})]}):null,r.status==="ready"&&r.page.items.length>0?(0,l.jsx)("ul",{className:"art-list",children:r.page.items.map(y=>(0,l.jsx)("li",{children:(0,l.jsxs)("button",{type:"button",className:"art-row",onClick:()=>a(y),children:[(0,l.jsx)("span",{className:"art-row-icon","data-type":y.type,children:y.type==="page"?(0,l.jsx)(Z,{}):(0,l.jsx)(ne,{})}),(0,l.jsxs)("span",{className:"art-row-text",children:[(0,l.jsx)("span",{className:"art-row-title",children:y.title}),(0,l.jsxs)("span",{className:"art-row-sub",children:[e(`type.${y.type}`)," \xB7 ",e("gallery.updated",{time:Ve(e,y.updatedAt)})]})]}),(0,l.jsx)("span",{className:"art-row-version",children:e("gallery.version",{version:y.version})})]})},y.id))}):null,r.status==="ready"&&r.page.hasMore?(0,l.jsx)("button",{type:"button",className:"art-button",style:{margin:"6px 8px"},onClick:o,children:e("gallery.more")}):null,r.status==="ready"&&r.page.truncated?(0,l.jsx)("p",{className:"art-note",children:e("gallery.truncated")}):null]})}function lr(e,t,r,n){let[a,o]=(0,C.useState)({key:"",state:{status:"loading"}}),[i,p]=(0,C.useState)(1),c=`${e===null?"none":`${e.scope}:${e.workspaceId??""}`}:${t}:${r??""}`,y=a.key===c?a.state:{status:"loading"};return(0,C.useEffect)(()=>p(1),[c,t]),(0,C.useEffect)(()=>{if(e===null)return;let h=new AbortController,f=setTimeout(async()=>{try{let w=[];for(let g=0;g<i&&(w.push(await T.list(e,{query:t,type:r,offset:g*50},h.signal)),!!w[w.length-1]?.hasMore);g+=1);let u=w[w.length-1];if(u===void 0||h.signal.aborted)return;o({key:c,state:{status:"ready",page:{...u,items:w.flatMap(g=>g.items)}}})}catch(w){h.signal.aborted||o({key:c,state:{status:"failed",code:E(w)}})}},t===""?0:180);return()=>{h.abort(),clearTimeout(f)}},[c,t,n,i]),{state:y,more:()=>p(h=>h+1)}}function pt({t:e,workspaceId:t,open:r,toolbar:n}){let[a,o]=(0,C.useState)(""),[i,p]=(0,C.useState)("all"),[c,y]=(0,C.useState)(void 0),[h,f]=(0,C.useState)("list"),[w,u]=(0,C.useState)(!1),[g,F]=(0,C.useState)(0),J=Et()+g,N=lr(t===null?null:{scope:"workspace",workspaceId:t},a,c,J),q=lr({scope:"library",workspaceId:t},a,c,J),ee=(0,C.useCallback)(x=>Jr(r,x,t),[r,t]),oe=(0,C.useCallback)(async(x,$)=>{if($==="workspace"&&t===null)return;let W=e(x==="page"?"create.untitledPage":"create.untitledDoc");try{let{manifest:A}=await T.create({scope:$,workspaceId:t},x,W,ir(x,W));Y(),ee(A)}catch(A){M(e(R(E(A))))}},[t,e,ee]),pe=i==="library"||t===null?"library":"workspace";return(0,l.jsxs)("section",{className:"art-root","data-dsh-artifacts":"",children:[(0,l.jsxs)("header",{className:"art-header art-relative",children:[(0,l.jsxs)("div",{className:"art-heading",children:[h==="design"?(0,l.jsx)("button",{type:"button",className:"art-icon-button","aria-label":e("panel"),title:e("panel"),onClick:()=>f("list"),children:(0,l.jsx)(We,{})}):null,(0,l.jsx)("span",{className:"art-title",children:e(h==="design"?"design.title":"panel")})]}),h==="list"?n:null,h==="list"?(0,l.jsxs)("div",{className:"art-actions",children:[(0,l.jsx)("button",{type:"button",className:"art-icon-button","aria-label":e("gallery.design"),title:e("gallery.design"),onClick:()=>f("design"),children:(0,l.jsx)(Yt,{})}),(0,l.jsx)("button",{type:"button",className:"art-icon-button","aria-label":e("gallery.refresh"),title:e("gallery.refresh"),onClick:()=>F(x=>x+1),children:(0,l.jsx)(Ut,{})}),(0,l.jsx)("button",{type:"button",className:"art-icon-button","aria-label":e("gallery.new"),title:e("gallery.new"),"aria-haspopup":"menu","aria-expanded":w,onClick:()=>u(x=>!x),children:(0,l.jsx)(_t,{})})]}):null,w?(0,l.jsx)(Re,{label:e("gallery.new"),onClose:()=>u(!1),items:[{id:"page",label:`${e("gallery.newPage")} \xB7 ${e(`scope.${pe}`)}`,icon:(0,l.jsx)(Z,{size:14}),run:()=>void oe("page",pe)},{id:"doc",label:`${e("gallery.newDoc")} \xB7 ${e(`scope.${pe}`)}`,icon:(0,l.jsx)(ne,{size:14}),run:()=>void oe("doc",pe)}]}):null]}),h==="design"?(0,l.jsx)("div",{className:"art-scroll",children:(0,l.jsx)(or,{t:e,workspaceId:t})}):(0,l.jsxs)(l.Fragment,{children:[(0,l.jsxs)("div",{className:"art-toolbar",children:[(0,l.jsx)("input",{className:"art-search",type:"search","aria-label":e("gallery.searchLabel"),placeholder:e("gallery.search"),value:a,onChange:x=>o(x.target.value)}),(0,l.jsxs)("select",{className:"art-type-select","aria-label":e("filter.type"),value:c??"",onChange:x=>y(x.target.value==="page"?"page":x.target.value==="doc"?"doc":void 0),children:[(0,l.jsx)("option",{value:"",children:e("type.all")}),(0,l.jsx)("option",{value:"page",children:e("type.page")}),(0,l.jsx)("option",{value:"doc",children:e("type.doc")})]}),(0,l.jsx)("div",{className:"art-segment",role:"group","aria-label":e("filter.scope"),children:["all","workspace","library"].map(x=>(0,l.jsx)("button",{type:"button","aria-pressed":i===x,onClick:()=>p(x),children:e(x==="all"?"filter.all":`scope.${x}`)},x))})]}),(0,l.jsxs)("div",{className:"art-scroll",children:[i!=="library"?t===null?(0,l.jsx)("p",{className:"art-note",style:{padding:"12px 14px"},children:e("empty.noWorkspace")}):(0,l.jsx)(sr,{t:e,scope:"workspace",state:N.state,query:a,onOpen:ee,onMore:N.more,onRetry:()=>F(x=>x+1),onCreate:(x,$)=>void oe(x,$)}):null,i!=="workspace"?(0,l.jsx)(sr,{t:e,scope:"library",state:q.state,query:a,onOpen:ee,onMore:q.more,onRetry:()=>F(x=>x+1),onCreate:(x,$)=>void oe(x,$)}):null]})]})]})}function ut(e){let{t,useTabInfo:r}=e,n=r(),a=nr(e);return(0,l.jsx)(pt,{t,workspaceId:a.workspaceId,open:n.tab.actions?.openResource})}var L=require("react");var V=require("react/jsx-runtime"),cr="dsh-artifacts.panel.workspace";function dr({t:e,workspaces:t}){let r=(0,L.useCallback)(f=>t.subscribe(f),[t]),n=(0,L.useCallback)(()=>t.getSnapshot(),[t]),o=(0,L.useSyncExternalStore)(r,n,n).items,[i,p]=(0,L.useState)(()=>{let f=window.localStorage.getItem(cr);return f===null||f===""?o[0]?.workspaceId??null:f}),[c,y]=(0,L.useState)(null);(0,L.useEffect)(()=>{if(o.length===0){i!==null&&p(null);return}(i===null||!o.some(f=>f.workspaceId===i))&&p(o[0]?.workspaceId??null)},[o,i]),(0,L.useEffect)(()=>{i!==null&&window.localStorage.setItem(cr,i)},[i]);let h=(0,L.useMemo)(()=>c===null?void 0:re(c),[c]);return(0,V.jsxs)("div",{className:"art-panel-stack",children:[(0,V.jsx)("div",{className:"art-panel-region",hidden:h!==void 0,children:(0,V.jsx)(pt,{t:e,workspaceId:i,open:f=>y(f),toolbar:o.length===0?null:(0,V.jsxs)("label",{className:"art-workspace",children:[(0,V.jsx)("span",{className:"art-workspace-label",children:e("panel.workspace")}),(0,V.jsx)("select",{className:"art-workspace-select","aria-label":e("panel.workspace"),value:i??"",onChange:f=>p(f.target.value===""?null:f.target.value),children:o.map(f=>(0,V.jsx)("option",{value:f.workspaceId,children:f.title},f.workspaceId))})]})})}),h===void 0?null:(0,V.jsx)("div",{className:"art-panel-region",children:(0,V.jsx)(Qt,{t:e,address:h,workspaceName:o.find(f=>h.scope==="workspace"&&f.workspaceId===h.workspaceId)?.title,onBack:()=>y(null)})})]})}var pr="dsh-artifacts/styles",ea=`
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
  gap: 8px;
  min-height: 40px;
  padding: 4px 6px 4px 12px;
  border-bottom: .5px solid var(--dsw-alias-border-l2);
}
.art-heading { flex: 1; min-width: 0; display: flex; align-items: center; gap: 8px; }
.art-title {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
  font-weight: 600;
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
.art-meta { flex: none; display: flex; align-items: center; gap: 6px; color: var(--dsw-alias-label-secondary); font-size: 11px; font-variant-numeric: tabular-nums; }
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
.art-actions { flex: none; display: flex; align-items: center; gap: 2px; }
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
  gap: 8px;
  padding: 8px 10px;
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
.art-scroll::-webkit-scrollbar, .art-history::-webkit-scrollbar { width: 10px; height: 10px; }
.art-scroll::-webkit-scrollbar-thumb, .art-history::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: 10px;
  background: color-mix(in srgb, var(--dsw-alias-label-secondary) 40%, transparent) padding-box;
}
.art-section { padding: 6px 6px 14px; }
.art-section-head {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
  padding: 10px 8px 6px;
}
.art-section-title { margin: 0; font-size: 12px; font-weight: 600; color: var(--dsw-alias-label-primary); }
.art-section-hint { font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: 1px; }
.art-row {
  display: grid;
  grid-template-columns: 30px 1fr auto;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 7px 8px;
  border: none;
  border-radius: 8px;
  background: transparent;
  color: inherit;
  font: inherit;
  text-align: left;
  cursor: pointer;
}
.art-row:hover { background: var(--dsw-alias-bg-layer-1); }
.art-row-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  border-radius: 7px;
  background: var(--dsw-alias-bg-layer-2);
  color: var(--dsw-alias-label-secondary);
}
.art-row-icon svg { width: 16px; height: 16px; }
.art-row-icon[data-type="page"] { color: var(--dsw-alias-brand-primary); }
.art-row-text { min-width: 0; display: flex; flex-direction: column; }
.art-row-title { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-weight: 500; }
.art-row-sub { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font-size: 11px; color: var(--dsw-alias-label-secondary); }
.art-row-version { font-size: 11px; color: var(--dsw-alias-label-secondary); font-variant-numeric: tabular-nums; }
.art-empty {
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 6px;
  margin: 2px 8px 6px;
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
.art-body { flex: 1; min-height: 0; display: flex; position: relative; }
.art-stage { flex: 1; min-width: 0; min-height: 0; display: flex; flex-direction: column; background: var(--dsw-alias-bg-layer-1); }
.art-frame { flex: 1; width: 100%; min-height: 0; border: none; background: #fff; }
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
.art-history {
  flex: none;
  width: 240px;
  min-height: 0;
  overflow: auto;
  border-left: .5px solid var(--dsw-alias-border-l2);
  background: var(--dsw-alias-bg-base);
}
.art-history-head { padding: 12px 12px 6px; font-size: 12px; font-weight: 600; }
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
  height: 26px;
  padding: 0 12px;
  border-top: .5px solid var(--dsw-alias-border-l2);
  color: var(--dsw-alias-label-secondary);
  font-size: 11px;
}
.art-status [data-tone="warn"] { color: var(--dsw-alias-state-warn-primary); }
.art-status [data-tone="error"] { color: var(--dsw-alias-state-error-primary); }
.art-menu {
  position: absolute;
  z-index: 20;
  top: 36px;
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
.art-editor-header { position: relative; flex-wrap: wrap; padding: 10px 12px; gap: 10px; }
.art-identity { display: flex; flex-direction: column; min-width: 0; gap: 2px; }
.art-identity .art-meta { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.art-editor-actions { margin-left: auto; flex-wrap: wrap; }
.art-icon-button { min-width: 32px; width: 32px; height: 32px; }
.art-segment button { min-height: 28px; }
.art-edit-strip { display: flex; flex: none; justify-content: space-between; align-items: center; gap: 12px; padding: 6px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); color: var(--dsw-alias-label-secondary); font-size: 12px; }
.art-text-button { background: none; border: 0; padding: 5px 2px; font: inherit; color: var(--dsw-alias-brand-primary); cursor: pointer; }
.art-text-button:disabled { opacity: .5; cursor: default; }
.art-inline-form { display: flex; gap: 6px; padding: 8px 12px; }
.art-inline-form input { min-width: 0; flex: 1; padding: 4px 8px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; font: inherit; }
.art-request { flex: none; max-height: 45%; overflow: auto; padding: 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.art-request .art-field textarea { height: 170px; }
.art-dialog-shade { position: absolute; inset: 0; z-index: 40; display: flex; align-items: center; justify-content: center; padding: 16px; background: color-mix(in srgb, var(--dsw-alias-label-primary) 25%, transparent); }
.art-root { position: relative; }
.art-dialog { width: 100%; max-width: 440px; padding: 20px; border-radius: 12px; background: var(--dsw-alias-bg-overlay); color: var(--dsw-alias-label-primary); box-shadow: 0 12px 36px color-mix(in srgb, var(--dsw-alias-label-primary) 20%, transparent); }
.art-dialog h2 { margin: 0 0 8px; font-size: 16px; }
.art-dialog p { margin: 0 0 20px; line-height: 1.6; color: var(--dsw-alias-label-secondary); }
.art-dialog .art-form-actions { flex-wrap: wrap; }
.art-doc-toolbar .art-button[aria-pressed="true"] { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-brand-primary); }
.art-doc-toolbar { display: flex; flex-wrap: wrap; gap: 4px; padding: 8px 12px; border-bottom: 1px solid var(--dsw-alias-border-l2); }
.art-history-head { display: flex; align-items: center; justify-content: space-between; gap: 8px; }
.art-bar { flex-wrap: wrap; }
.art-bar-actions { flex-wrap: wrap; }
.art-toolbar { flex-wrap: wrap; }
.art-search { flex-basis: 140px; }
.art-type-select { height: 30px; max-width: 140px; padding: 0 6px; border: 1px solid var(--dsw-alias-border-l1); border-radius: 6px; background: var(--dsw-alias-bg-base); color: var(--dsw-alias-label-primary); font: inherit; }
.art-source:focus-visible, .art-prose:focus-visible, .art-swatch-text input:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.art-status { height: auto; min-height: 30px; flex-wrap: wrap; padding: 6px 12px; }
@container (max-width: 600px) {
  .art-editor-header .art-heading { flex-basis: 100%; }
  .art-editor-actions { width: 100%; justify-content: flex-end; }
  .art-editor-actions .art-segment { margin-right: auto; }
  .art-history { position: absolute; z-index: 10; inset: 0 0 0 auto; width: min(300px, 100%); box-shadow: -8px 0 24px color-mix(in srgb, var(--dsw-alias-label-primary) 12%, transparent); }
  .art-workspace-label { display: none; }
  .art-doc-mount { padding: 20px 16px 48px; }
}
@media (pointer: coarse) { .art-icon-button, .art-button, .art-segment button, .art-text-button { min-height: 44px; min-width: 44px; } }
@media (prefers-reduced-motion: no-preference) {
  .art-row, .art-version, .art-icon-button, .art-button { transition: background-color .12s ease-out, color .12s ease-out; }
  .art-toast { animation: art-rise .18s cubic-bezier(.16, 1, .3, 1); }
}
@keyframes art-rise { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
`;function ur(){if(typeof document>"u"||document.querySelector(`style[data-plugin-css="${pr}"]`)!==null)return;let e=document.createElement("style");e.dataset.plugin="dsh-artifacts",e.dataset.pluginCss=pr,e.textContent=ea,document.head.appendChild(e)}var z=require("react/jsx-runtime");var U="artifacts",Ke="dsh-artifacts",Ye="dsh-artifacts/artifact",fr="artifact",ft="dsh-artifacts-panel",gr=["artifact_create","artifact_update"],ta=["connection","slots","locale","sidebarRightTabs","sidebarRight","workspaces"];function Ge(e){return function(r){return(0,z.jsx)(qe,{title:r.t("error.surface"),hint:r.t("error.surfaceHint"),reloadLabel:r.t("action.reloadWindow"),children:(0,z.jsx)(e,{...r})})}}function ra(){let e=Mt();return e===null?null:(0,z.jsx)("div",{className:"art-toast",role:"status",children:e})}function aa({t:e}){return(0,z.jsxs)("span",{className:"art-chip",children:[(0,z.jsx)(ye,{}),(0,z.jsx)("span",{children:e("panel")})]})}function na({useTabInfo:e}){let{tab:t}=e(),r=re(t.contentId??t.navigation?.address),n=Rt(r?.id);return(0,z.jsxs)("span",{className:"art-chip",children:[(0,z.jsx)(ne,{}),(0,z.jsx)("span",{children:n??r?.id??""})]})}function oa(e){ur(),e.effect(It,"dsh-artifacts: unsaved draft guard"),Tt(e.connection),ve.sidebarRight=e.sidebarRight,e.locale.register(U,"en",Ot),e.locale.register(U,"zh",Vt);let t=e.locale.bind(U),r=(i,p)=>t(i,p);e.effect(()=>e.sidebarRightTabs.register({id:Ke,kind:dt,priority:"extension",keepMounted:!0,title:()=>r("panel"),guide:[{id:"artifacts",order:40,title:()=>r("guide.title"),description:()=>r("guide.description"),icon:()=>(0,z.jsx)(ye,{size:22})}]}),"dsh-artifacts: gallery tab type"),e.effect(()=>e.sidebarRightTabs.register({id:Ye,kind:fr,priority:"extension",patterns:["dsh-resource://artifact/**"],canOpen:i=>re(i)!==void 0,title:i=>{let p=re(i);return p===void 0?"":At(p.id)??p.id}}),"dsh-artifacts: artifact tab type");let n=()=>({t:r});e.effect(()=>Dt,"dsh-artifacts: notification cleanup"),e.slots.inject("shell.overlay",()=>e.slots.register({name:"shell.overlay",id:"dsh-artifacts.notice"},ra)),e.slots.inject("sidebar.right.pane.tab",()=>e.slots.register({name:"sidebar.right.pane.tab",key:Ke,locale:U,inject:n},Ge(ut))),e.slots.inject("sidebar.right.pane.tab",()=>e.slots.register({name:"sidebar.right.pane.tab",key:Ye,locale:U,inject:n},Ge(st))),e.slots.inject("sidebar.right.pane.tab.title",()=>e.slots.register({name:"sidebar.right.pane.tab.title",key:Ke,locale:U,inject:n},aa)),e.slots.inject("sidebar.right.pane.tab.title",()=>e.slots.register({name:"sidebar.right.pane.tab.title",key:Ye,locale:U,inject:n},na));for(let i of gr)e.slots.inject("tool.call.toolview",()=>e.slots.register({name:"tool.call.toolview",key:i,locale:U,inject:n},Ge(lt)));e.slots.inject("conversation.input.left",()=>e.slots.register({name:"conversation.input.left",id:"dsh-artifacts",order:40,locale:U,inject:n},rr));function a({size:i}){return(0,z.jsx)(ye,{size:i})}let o=()=>({t:r,workspaces:e.workspaces.list});e.slots.inject("main",()=>e.slots.register({name:"main",key:ft,locale:U,inject:o},Ge(dr))),e.slots.inject("sidebar.panellist",()=>e.slots.register({name:"sidebar.panellist",id:ft,order:10,label:()=>r("panel")},a))}

    return module.exports;
  },
});
