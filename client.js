window.__ModuleLoader__.load({
  id: "dsh-artifacts",
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
    globalThis.__dshArtifactsRequireAsync = require.async;
"use strict";var nr=Object.create;var Ce=Object.defineProperty;var or=Object.getOwnPropertyDescriptor;var sr=Object.getOwnPropertyNames;var ir=Object.getPrototypeOf,lr=Object.prototype.hasOwnProperty;var cr=(e,t)=>{for(var r in t)Ce(e,r,{get:t[r],enumerable:!0})},ut=(e,t,r,n)=>{if(t&&typeof t=="object"||typeof t=="function")for(let a of sr(t))!lr.call(e,a)&&a!==r&&Ce(e,a,{get:()=>t[a],enumerable:!(n=or(t,a))||n.enumerable});return e};var dr=(e,t,r)=>(r=e!=null?nr(ir(e)):{},ut(t||!e||!e.__esModule?Ce(r,"default",{value:e,enumerable:!0}):r,e)),pr=e=>ut(Ce({},"__esModule",{value:!0}),e);var Gr={};cr(Gr,{ARTIFACT_ID:()=>Ve,ARTIFACT_KIND:()=>Yt,ArtifactCard:()=>tt,ArtifactTab:()=>et,CARD_TOOLS:()=>qt,DocView:()=>Ee,GALLERY_ID:()=>je,Gallery:()=>nt,apply:()=>Ur,inject:()=>Wr});module.exports=pr(Gr);var ur=["page","doc"];function fr(e){return ur.some(t=>t===e)}var ft={page:["html"],doc:["md","docx","html"]};var Ae=/^art_(ws|lib)_[a-z0-9]{10,32}$/;function Ke(e){if(e===null||typeof e!="object")return!1;let t="origin"in e?e.origin:void 0,r="action"in e?e.action:void 0;return(t==="agent"||t==="user")&&(r==="create"||r==="update"||r==="restore")}function Me(e){if(e===null||typeof e!="object")return!1;let t={...e};return t.schemaVersion===1&&typeof t.id=="string"&&Ae.test(t.id)&&(t.scope==="workspace"||t.scope==="library")&&typeof t.type=="string"&&fr(t.type)&&typeof t.title=="string"&&typeof t.createdAt=="string"&&typeof t.updatedAt=="string"&&typeof t.version=="number"&&Number.isInteger(t.version)&&t.version>=1&&typeof t.contentFile=="string"&&typeof t.contentBytes=="number"&&typeof t.contentHash=="string"&&Ke(t.source)}var Re="dsh-resource://artifact/";function be(e){return e.scope==="workspace"?`${Re}workspace/${encodeURIComponent(e.workspaceId)}/${e.id}`:`${Re}library/${e.id}`}function le(e){if(typeof e!="string"||!e.startsWith(Re))return;let t=e.slice(Re.length).split("/");if(t[0]==="library"&&t.length===2){let r=t[1]??"";return Ae.test(r)&&r.startsWith("art_lib_")?{scope:"library",id:r}:void 0}if(t[0]==="workspace"&&t.length===3){let r=t[2]??"",n;try{n=decodeURIComponent(t[1]??"")}catch{return}return n===""||!Ae.test(r)||!r.startsWith("art_ws_")?void 0:{scope:"workspace",workspaceId:n,id:r}}}function gt(e){if(Ae.test(e))return e.startsWith("art_ws_")?"workspace":"library"}function mt(e){let t=[];for(let[r,n]of Object.entries(e.colors))t.push(`--artifact-color-${r}: ${n};`);t.push(`--artifact-font-family: ${e.typography.fontFamily};`),t.push(`--artifact-font-mono: ${e.typography.monoFamily};`),e.typography.scale.forEach((r,n)=>t.push(`--artifact-font-size-${n}: ${r}px;`)),t.push(`--artifact-space-unit: ${e.spacing.unit}px;`),e.spacing.scale.forEach((r,n)=>t.push(`--artifact-space-${n}: ${r}px;`));for(let[r,n]of Object.entries(e.radius))t.push(`--artifact-radius-${r}: ${n}px;`);return`:root {
  ${t.join(`
  `)}
}`}var gr="/artifacts-rpc",ce=class extends Error{code;details;constructor(t,r,n){super(r),this.name="ArtifactCallError",this.code=t,this.details=n}},qe=null;function bt(e){qe=e}async function L(e,t,r,n){if(qe===null)throw new ce("artifact/not-ready","The artifact channel is not ready.",{});let a=await qe.rpc.call(gr,e,t,n);if(!a.ok)throw new ce(a.error.code,a.error.message,a.error.details);if(!r(a.value))throw new ce("artifact/bad-response",`The ${e} response has an unexpected shape.`,{});return a.value}function D(e){return e!==null&&typeof e=="object"&&!Array.isArray(e)}function mr(e){return D(e)&&Array.isArray(e.items)&&e.items.every(Me)&&typeof e.total=="number"&&typeof e.hasMore=="boolean"}function br(e){return D(e)&&Me(e.manifest)&&typeof e.content=="string"&&typeof e.version=="number"&&typeof e.designCss=="string"}function Pe(e){return D(e)&&Me(e.manifest)}function yr(e){return D(e)&&typeof e.version=="number"&&typeof e.createdAt=="string"&&typeof e.contentHash=="string"&&typeof e.contentBytes=="number"&&Ke(e.source)}function hr(e){return D(e)&&Array.isArray(e.versions)&&e.versions.every(yr)}function xr(e){return D(e)&&e.trashed===!0&&typeof e.trashPath=="string"}function vr(e){return D(e)&&typeof e.path=="string"&&typeof e.bytes=="number"&&typeof e.fileName=="string"&&typeof e.mediaType=="string"&&typeof e.data=="string"}function wr(e){return D(e)&&typeof e.html=="string"}function kr(e){return D(e)&&e.schemaVersion===1&&typeof e.name=="string"&&D(e.colors)&&D(e.typography)&&D(e.spacing)&&D(e.radius)}function Ye(e){return D(e)&&kr(e.tokens)&&(e.source==="workspace"||e.source==="library"||e.source==="default")&&typeof e.css=="string"}function H(e){return{scope:e.scope,...e.workspaceId===null?{}:{workspaceId:e.workspaceId}}}var C={list:(e,t,r)=>L("list",{...H(e),...t},mr,r),get:(e,t,r,n)=>L("get",{...H(e),id:t,...r===void 0?{}:{version:r}},br,n),create:(e,t,r,n)=>L("create",{...H(e),type:t,title:r,content:n},Pe),update:(e,t,r,n)=>L("update",{...H(e),id:t,baseVersion:r,content:n},Pe),rename:(e,t,r,n)=>L("update",{...H(e),id:t,baseVersion:r,title:n},Pe),remove:(e,t)=>L("delete",{...H(e),id:t},xr),history:(e,t,r)=>L("history",{...H(e),id:t},hr,r),restore:(e,t,r,n)=>L("restore",{...H(e),id:t,version:r,baseVersion:n},Pe),exportFile:(e,t,r)=>L("export",{...H(e),id:t,format:r},vr),printable:(e,t)=>L("printable",{...H(e),id:t},wr),designSystem:(e,t)=>L("designSystem",e===null?{}:{workspaceId:e},Ye,t),saveDesignSystem:(e,t)=>L("saveDesignSystem",{...H(e),tokens:t},Ye),clearDesignSystem:e=>L("clearDesignSystem",{workspaceId:e,scope:"workspace"},Ye)};function M(e){return e instanceof ce?e.code:void 0}function P(e){switch(e){case"artifact/not-found":return"error.notFound";case"artifact/stale-version":return"error.stale";case"artifact/too-large":return"error.tooLarge";case"artifact/no-workspace":return"error.noWorkspace";case"artifact/forbidden-path":return"error.forbidden";case"artifact/corrupt":return"error.corrupt";case"artifact/invalid-tokens":return"error.tokens";case"artifact/library-unavailable":return"error.library";default:return"error.generic"}}function yt(e){let t=atob(e.data),r=new Uint8Array(t.length);for(let o=0;o<t.length;o+=1)r[o]=t.charCodeAt(o);let n=URL.createObjectURL(new Blob([r],{type:e.mediaType})),a=document.createElement("a");a.href=n,a.download=e.fileName,a.rel="noopener",document.body.appendChild(a),a.click(),a.remove(),setTimeout(()=>URL.revokeObjectURL(n),3e4)}var u=require("react");var V=require("react"),de=require("react/jsx-runtime"),ye=null;function Tr(){if(ye===null){let e=globalThis.__dshArtifactsRequireAsync;if(typeof e!="function")return Promise.reject(new Error("The document editor loader is unavailable."));ye=e("./client.doc.js"),ye.catch(()=>{ye=null})}return ye}function Ee({markdown:e,revision:t,editable:r,label:n,loadingLabel:a,failedLabel:o,onChange:d,onSave:m}){let p=(0,V.useRef)(null),h=(0,V.useRef)(null),k=(0,V.useRef)(d);k.current=d;let[N,S]=(0,V.useState)("loading");return(0,V.useEffect)(()=>{let i=!1;return Tr().then(v=>{i||p.current===null||(h.current=v.mountDocEditor({element:p.current,markdown:e,editable:r,label:n,onChange:oe=>k.current(oe)}),S("ready"))}).catch(()=>{i||S("failed")}),()=>{i=!0,h.current?.destroy(),h.current=null}},[]),(0,V.useEffect)(()=>{let i=h.current;i!==null&&i.getMarkdown()!==e&&i.setMarkdown(e)},[t]),(0,V.useEffect)(()=>{h.current?.setEditable(r)},[r]),(0,de.jsxs)("div",{className:"art-doc","data-doc-revision":t,onKeyDown:i=>{(i.ctrlKey||i.metaKey)&&i.key.toLowerCase()==="s"&&(i.preventDefault(),m())},children:[N==="loading"?(0,de.jsx)("p",{className:"art-note",children:a}):null,N==="failed"?(0,de.jsx)("p",{className:"art-note",children:o}):null,(0,de.jsx)("div",{className:"art-doc-mount",ref:p})]})}var xt="default-src 'none'; img-src data: blob:; media-src data: blob:; style-src 'unsafe-inline'; script-src 'unsafe-inline' 'unsafe-eval'; font-src data:; connect-src 'none'; frame-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'";var Xe="<script>addEventListener('message',function(e){if(e.source!==parent||e.data!=='dsh-artifact-print')return;addEventListener('afterprint',function(){parent.postMessage('dsh-artifact-printed','*')},{once:true});print()})<\/script>";function ht(e){return e.replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;").replace(/"/g,"&quot;").replace(/'/g,"&#39;")}function Sr(e){return e.replace(/<meta\b[^>]*http-equiv\s*=\s*["']?refresh["']?[^>]*>/gi,"").replace(/<meta\b[^>]*content\s*=\s*["'][^"']*url\s*=[^>]*>/gi,"")}function vt(e,t,r,n,a=""){return`<!doctype html><html><head>${'<meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">'+(r===null?"":`<meta http-equiv="Content-Security-Policy" content="${ht(r)}">`)+`<title>${ht(n)}</title><style data-artifact-tokens>${t}</style>`+a}</head><body>${Sr(e)}</body></html>`}var wt="allow-scripts",Nr="allow-scripts allow-modals",Cr=3e4;function De(e,t,r){return vt(e,t,xt,r)}function Ze(e){let t=/<\/head>/i.test(e)?e.replace(/<\/head>/i,`${Xe}</head>`):`${Xe}${e}`,r=URL.createObjectURL(new Blob([t],{type:"text/html"})),n=document.createElement("iframe");n.setAttribute("sandbox",Nr),n.setAttribute("aria-hidden","true"),n.tabIndex=-1,n.style.cssText="position:fixed;left:-10000px;top:0;width:800px;height:1000px;border:0;";let a=!1,o=()=>{a||(a=!0,clearTimeout(m),window.removeEventListener("message",d),n.remove(),URL.revokeObjectURL(r))},d=p=>{p.source===n.contentWindow&&p.data==="dsh-artifact-printed"&&o()};window.addEventListener("message",d);let m=setTimeout(o,Cr);n.addEventListener("load",()=>{n.contentWindow?.postMessage("dsh-artifact-print","*")},{once:!0}),n.src=r,document.body.appendChild(n)}var kt={panel:"Artifacts","guide.title":"Artifacts","guide.description":"Pages and documents the agent made, with versions and export.","scope.workspace":"This project","scope.library":"Library","scope.workspaceHint":"Stored in this project under .dsh/artifacts.","scope.libraryHint":"Stored in your profile and shared by every project.","type.page":"Page","type.doc":"Document","type.all":"All types","filter.all":"All","gallery.search":"Search artifacts","gallery.searchLabel":"Search by title","gallery.new":"New","gallery.newPage":"New page","gallery.newDoc":"New document","gallery.design":"Design system","gallery.refresh":"Refresh","gallery.more":"Show more","gallery.truncated":"Only the first 500 artifacts are scanned.","gallery.version":"v{version}","gallery.updated":"Updated {time}","gallery.count":"{count} artifacts","empty.workspaceTitle":"No artifacts in this project yet","empty.workspaceHint":"Ask the agent for a dashboard, report, or one-pager, or start one here.","empty.libraryTitle":"Your library is empty","empty.libraryHint":"Library artifacts follow you to every project. Ask the agent to save one to the library.","empty.noMatch":"Nothing matches that search.","empty.noWorkspace":"Open a session in a workspace to see its artifacts.","empty.loading":"Loading...","create.title":"New {type}","create.name":"Title","create.scope":"Save to","create.submit":"Create","create.cancel":"Cancel","create.untitledPage":"Untitled page","create.untitledDoc":"Untitled document","tab.preview":"Preview","tab.source":"Source","tab.history":"History","tab.export":"Export","tab.maximize":"Fill the window","tab.restoreSize":"Back to the side panel","tab.reload":"Reload","tab.rename":"Rename","tab.delete":"Move to trash","tab.deleteConfirm":'Move "{title}" to the trash? Its files stay in .trash for 7 days.',"tab.save":"Save","tab.saving":"Saving...","tab.saved":"Saved","tab.unsaved":"Unsaved changes","tab.frameTitle":"Artifact preview: {title}","tab.versionOf":"Version {version}","tab.viewingOld":"Viewing version {version}. The current version is {current}.","tab.backToCurrent":"Back to current","tab.restoreThis":"Restore this version","tab.discardConfirm":`Discard your unsaved changes?

Save first if you want to keep them.`,"tab.printOldVersion":"Go back to the current version to print it.","tab.conflictTitle":"This artifact changed","tab.conflictHint":"Version {current} was saved while you were editing. Reload to see it; your unsaved edits will be lost.","tab.deleted":"This artifact is no longer here","tab.deletedHint":"It was moved to the trash or deleted.","tab.close":"Close tab","tab.scripts":"Scripts run in a sandbox with no network access.","history.title":"Versions","history.current":"Current","history.byAgent":"Agent","history.byUser":"You","history.restored":"Restored from v{version}","history.created":"Created","history.updated":"Edited","history.empty":"No earlier versions.","export.html":"HTML file","export.md":"Markdown file","export.docx":"Word document","export.print":"Print or save as PDF","export.done":"Saved {name} to {path}","design.title":"Design system","design.hint":"Pages and documents use these values through CSS variables.","design.source.workspace":"This project overrides the library.","design.source.library":"Inherited from your library.","design.source.default":"Built-in defaults. Save to start your own.","design.name":"Name","design.colors":"Colors","design.color.primary":"Primary","design.color.accent":"Accent","design.color.surface":"Surface","design.color.text":"Text","design.color.muted":"Muted","design.type":"Typography","design.font":"Body font stack","design.mono":"Code font stack","design.radius":"Corner radius","design.radius.sm":"Small","design.radius.md":"Medium","design.radius.lg":"Large","design.notes":"Notes for the agent","design.notesHint":"Tone, layout rules, or brand guidance the agent reads before it designs.","design.saveWorkspace":"Save for this project","design.saveLibrary":"Save to library","design.clear":"Remove project override","design.saved":"Design system saved","design.preview":"Preview","design.previewHeading":"Quarterly review","design.previewBody":"Revenue grew in every region this quarter.","design.previewButton":"Primary action","card.created":"Created","card.updated":"Updated","card.open":"Open","card.working":"Writing the artifact...","card.failed":"The artifact was not saved","card.missing":"This result has no artifact details.","composer.label":"Artifacts","error.generic":"Something went wrong. Try again.","error.notFound":"This artifact no longer exists.","error.stale":"The artifact changed. Reload to continue.","error.tooLarge":"The content is over the 2 MiB limit.","error.noWorkspace":"This session has no workspace.","error.forbidden":"That path is not allowed.","error.corrupt":"The artifact files are damaged.","error.tokens":"A design value is not valid CSS.","error.library":"The library folder cannot be created.","error.surface":"The artifact panel failed to draw.","error.surfaceHint":"Reload the window. Your artifacts are safe on disk.","action.retry":"Retry","action.reloadWindow":"Reload window","time.justNow":"just now","time.minutes":"{count} min ago","time.hours":"{count} h ago","time.days":"{count} d ago"},Tt={panel:"\u4EA7\u7269","guide.title":"\u4EA7\u7269","guide.description":"\u667A\u80FD\u4F53\u751F\u6210\u7684\u9875\u9762\u548C\u6587\u6863\uFF0C\u53EF\u67E5\u770B\u7248\u672C\u5E76\u5BFC\u51FA\u3002","scope.workspace":"\u5F53\u524D\u9879\u76EE","scope.library":"\u8D44\u6599\u5E93","scope.workspaceHint":"\u4FDD\u5B58\u5728\u672C\u9879\u76EE\u7684 .dsh/artifacts \u4E0B\u3002","scope.libraryHint":"\u4FDD\u5B58\u5728\u4E2A\u4EBA\u914D\u7F6E\u4E2D\uFF0C\u6240\u6709\u9879\u76EE\u5171\u4EAB\u3002","type.page":"\u9875\u9762","type.doc":"\u6587\u6863","type.all":"\u5168\u90E8\u7C7B\u578B","filter.all":"\u5168\u90E8","gallery.search":"\u641C\u7D22\u4EA7\u7269","gallery.searchLabel":"\u6309\u6807\u9898\u641C\u7D22","gallery.new":"\u65B0\u5EFA","gallery.newPage":"\u65B0\u5EFA\u9875\u9762","gallery.newDoc":"\u65B0\u5EFA\u6587\u6863","gallery.design":"\u8BBE\u8BA1\u7CFB\u7EDF","gallery.refresh":"\u5237\u65B0","gallery.more":"\u663E\u793A\u66F4\u591A","gallery.truncated":"\u4EC5\u626B\u63CF\u524D 500 \u4E2A\u4EA7\u7269\u3002","gallery.version":"v{version}","gallery.updated":"\u66F4\u65B0\u4E8E {time}","gallery.count":"{count} \u4E2A\u4EA7\u7269","empty.workspaceTitle":"\u672C\u9879\u76EE\u8FD8\u6CA1\u6709\u4EA7\u7269","empty.workspaceHint":"\u8BA9\u667A\u80FD\u4F53\u751F\u6210\u4EEA\u8868\u76D8\u3001\u62A5\u544A\u6216\u5355\u9875\uFF0C\u6216\u5728\u8FD9\u91CC\u65B0\u5EFA\u3002","empty.libraryTitle":"\u8D44\u6599\u5E93\u4E3A\u7A7A","empty.libraryHint":"\u8D44\u6599\u5E93\u4E2D\u7684\u4EA7\u7269\u5728\u6240\u6709\u9879\u76EE\u53EF\u7528\u3002\u8BA9\u667A\u80FD\u4F53\u628A\u4EA7\u7269\u4FDD\u5B58\u5230\u8D44\u6599\u5E93\u3002","empty.noMatch":"\u6CA1\u6709\u5339\u914D\u7684\u4EA7\u7269\u3002","empty.noWorkspace":"\u5728\u5DE5\u4F5C\u533A\u4E2D\u6253\u5F00\u4F1A\u8BDD\u4EE5\u67E5\u770B\u5176\u4EA7\u7269\u3002","empty.loading":"\u52A0\u8F7D\u4E2D...","create.title":"\u65B0\u5EFA{type}","create.name":"\u6807\u9898","create.scope":"\u4FDD\u5B58\u5230","create.submit":"\u521B\u5EFA","create.cancel":"\u53D6\u6D88","create.untitledPage":"\u672A\u547D\u540D\u9875\u9762","create.untitledDoc":"\u672A\u547D\u540D\u6587\u6863","tab.preview":"\u9884\u89C8","tab.source":"\u6E90\u7801","tab.history":"\u5386\u53F2","tab.export":"\u5BFC\u51FA","tab.maximize":"\u94FA\u6EE1\u7A97\u53E3","tab.restoreSize":"\u56DE\u5230\u4FA7\u8FB9\u680F","tab.reload":"\u91CD\u65B0\u52A0\u8F7D","tab.rename":"\u91CD\u547D\u540D","tab.delete":"\u79FB\u5230\u56DE\u6536\u7AD9","tab.deleteConfirm":"\u5C06\u201C{title}\u201D\u79FB\u5230\u56DE\u6536\u7AD9\uFF1F\u6587\u4EF6\u4F1A\u5728 .trash \u4E2D\u4FDD\u7559 7 \u5929\u3002","tab.save":"\u4FDD\u5B58","tab.saving":"\u6B63\u5728\u4FDD\u5B58...","tab.saved":"\u5DF2\u4FDD\u5B58","tab.unsaved":"\u6709\u672A\u4FDD\u5B58\u7684\u66F4\u6539","tab.frameTitle":"\u4EA7\u7269\u9884\u89C8\uFF1A{title}","tab.versionOf":"\u7248\u672C {version}","tab.viewingOld":"\u6B63\u5728\u67E5\u770B\u7248\u672C {version}\uFF0C\u5F53\u524D\u7248\u672C\u4E3A {current}\u3002","tab.backToCurrent":"\u56DE\u5230\u5F53\u524D\u7248\u672C","tab.restoreThis":"\u6062\u590D\u6B64\u7248\u672C","tab.discardConfirm":`\u653E\u5F03\u672A\u4FDD\u5B58\u7684\u66F4\u6539\uFF1F

\u5982\u9700\u4FDD\u7559\u8BF7\u5148\u4FDD\u5B58\u3002`,"tab.printOldVersion":"\u8BF7\u56DE\u5230\u5F53\u524D\u7248\u672C\u540E\u518D\u6253\u5370\u3002","tab.conflictTitle":"\u6B64\u4EA7\u7269\u5DF2\u66F4\u6539","tab.conflictHint":"\u7F16\u8F91\u671F\u95F4\u5DF2\u4FDD\u5B58\u7248\u672C {current}\u3002\u91CD\u65B0\u52A0\u8F7D\u5373\u53EF\u67E5\u770B\uFF0C\u672A\u4FDD\u5B58\u7684\u7F16\u8F91\u5C06\u4E22\u5931\u3002","tab.deleted":"\u6B64\u4EA7\u7269\u5DF2\u4E0D\u5B58\u5728","tab.deletedHint":"\u5B83\u5DF2\u88AB\u79FB\u5230\u56DE\u6536\u7AD9\u6216\u5220\u9664\u3002","tab.close":"\u5173\u95ED\u6807\u7B7E\u9875","tab.scripts":"\u811A\u672C\u5728\u65E0\u7F51\u7EDC\u7684\u6C99\u7BB1\u4E2D\u8FD0\u884C\u3002","history.title":"\u7248\u672C","history.current":"\u5F53\u524D","history.byAgent":"\u667A\u80FD\u4F53","history.byUser":"\u4F60","history.restored":"\u4ECE v{version} \u6062\u590D","history.created":"\u521B\u5EFA","history.updated":"\u7F16\u8F91","history.empty":"\u6CA1\u6709\u66F4\u65E9\u7684\u7248\u672C\u3002","export.html":"HTML \u6587\u4EF6","export.md":"Markdown \u6587\u4EF6","export.docx":"Word \u6587\u6863","export.print":"\u6253\u5370\u6216\u53E6\u5B58\u4E3A PDF","export.done":"\u5DF2\u5C06 {name} \u4FDD\u5B58\u5230 {path}","design.title":"\u8BBE\u8BA1\u7CFB\u7EDF","design.hint":"\u9875\u9762\u548C\u6587\u6863\u901A\u8FC7 CSS \u53D8\u91CF\u4F7F\u7528\u8FD9\u4E9B\u503C\u3002","design.source.workspace":"\u672C\u9879\u76EE\u8986\u76D6\u4E86\u8D44\u6599\u5E93\u8BBE\u7F6E\u3002","design.source.library":"\u7EE7\u627F\u81EA\u8D44\u6599\u5E93\u3002","design.source.default":"\u5185\u7F6E\u9ED8\u8BA4\u503C\u3002\u4FDD\u5B58\u540E\u5373\u53EF\u81EA\u5B9A\u4E49\u3002","design.name":"\u540D\u79F0","design.colors":"\u989C\u8272","design.color.primary":"\u4E3B\u8272","design.color.accent":"\u5F3A\u8C03\u8272","design.color.surface":"\u5E95\u8272","design.color.text":"\u6587\u5B57","design.color.muted":"\u6B21\u8981","design.type":"\u5B57\u4F53","design.font":"\u6B63\u6587\u5B57\u4F53","design.mono":"\u4EE3\u7801\u5B57\u4F53","design.radius":"\u5706\u89D2","design.radius.sm":"\u5C0F","design.radius.md":"\u4E2D","design.radius.lg":"\u5927","design.notes":"\u7ED9\u667A\u80FD\u4F53\u7684\u8BF4\u660E","design.notesHint":"\u667A\u80FD\u4F53\u8BBE\u8BA1\u524D\u4F1A\u8BFB\u53D6\u7684\u8BED\u6C14\u3001\u6392\u7248\u89C4\u5219\u6216\u54C1\u724C\u89C4\u8303\u3002","design.saveWorkspace":"\u4FDD\u5B58\u5230\u672C\u9879\u76EE","design.saveLibrary":"\u4FDD\u5B58\u5230\u8D44\u6599\u5E93","design.clear":"\u79FB\u9664\u9879\u76EE\u8986\u76D6","design.saved":"\u8BBE\u8BA1\u7CFB\u7EDF\u5DF2\u4FDD\u5B58","design.preview":"\u9884\u89C8","design.previewHeading":"\u5B63\u5EA6\u56DE\u987E","design.previewBody":"\u672C\u5B63\u5EA6\u5404\u533A\u57DF\u6536\u5165\u5747\u6709\u589E\u957F\u3002","design.previewButton":"\u4E3B\u8981\u64CD\u4F5C","card.created":"\u5DF2\u521B\u5EFA","card.updated":"\u5DF2\u66F4\u65B0","card.open":"\u6253\u5F00","card.working":"\u6B63\u5728\u5199\u5165\u4EA7\u7269...","card.failed":"\u4EA7\u7269\u672A\u4FDD\u5B58","card.missing":"\u6B64\u7ED3\u679C\u6CA1\u6709\u4EA7\u7269\u4FE1\u606F\u3002","composer.label":"\u4EA7\u7269","error.generic":"\u51FA\u9519\u4E86\uFF0C\u8BF7\u91CD\u8BD5\u3002","error.notFound":"\u6B64\u4EA7\u7269\u5DF2\u4E0D\u5B58\u5728\u3002","error.stale":"\u4EA7\u7269\u5DF2\u66F4\u6539\uFF0C\u8BF7\u91CD\u65B0\u52A0\u8F7D\u3002","error.tooLarge":"\u5185\u5BB9\u8D85\u8FC7 2 MiB \u4E0A\u9650\u3002","error.noWorkspace":"\u6B64\u4F1A\u8BDD\u6CA1\u6709\u5DE5\u4F5C\u533A\u3002","error.forbidden":"\u4E0D\u5141\u8BB8\u8BBF\u95EE\u8BE5\u8DEF\u5F84\u3002","error.corrupt":"\u4EA7\u7269\u6587\u4EF6\u5DF2\u635F\u574F\u3002","error.tokens":"\u67D0\u4E2A\u8BBE\u8BA1\u503C\u4E0D\u662F\u6709\u6548\u7684 CSS\u3002","error.library":"\u65E0\u6CD5\u521B\u5EFA\u8D44\u6599\u5E93\u6587\u4EF6\u5939\u3002","error.surface":"\u4EA7\u7269\u9762\u677F\u7ED8\u5236\u5931\u8D25\u3002","error.surfaceHint":"\u8BF7\u91CD\u65B0\u52A0\u8F7D\u7A97\u53E3\u3002\u4F60\u7684\u4EA7\u7269\u4ECD\u5B89\u5168\u4FDD\u5B58\u5728\u78C1\u76D8\u4E0A\u3002","action.retry":"\u91CD\u8BD5","action.reloadWindow":"\u91CD\u65B0\u52A0\u8F7D\u7A97\u53E3","time.justNow":"\u521A\u521A","time.minutes":"{count} \u5206\u949F\u524D","time.hours":"{count} \u5C0F\u65F6\u524D","time.days":"{count} \u5929\u524D"};function Ie(e,t,r=Date.now()){let n=Math.max(0,r-Date.parse(t)),a=Math.floor(n/6e4);if(a<1)return e("time.justNow");if(a<60)return e("time.minutes",{count:a});let o=Math.floor(a/60);if(o<24)return e("time.hours",{count:o});let d=Math.floor(o/24);return d<7?e("time.days",{count:d}):new Date(t).toLocaleDateString()}var $=require("react/jsx-runtime");function Ar(e,t){let r=t.source.origin==="agent"?e("history.byAgent"):e("history.byUser"),n=t.source.action==="restore"&&t.source.restoredFrom!==void 0?e("history.restored",{version:t.source.restoredFrom}):t.source.action==="create"?e("history.created"):e("history.updated");return`${r} \xB7 ${n} \xB7 ${Ie(e,t.createdAt)}`}function St({t:e,versions:t,failed:r,current:n,selected:a,onSelect:o}){return(0,$.jsxs)("aside",{className:"art-history","aria-label":e("history.title"),children:[(0,$.jsx)("div",{className:"art-history-head",children:e("history.title")}),t===null?(0,$.jsx)("p",{className:"art-note",children:e("empty.loading")}):null,r?(0,$.jsx)("p",{className:"art-note",children:e("error.generic")}):null,!r&&t!==null&&t.length<=1?(0,$.jsx)("p",{className:"art-note",children:e("history.empty")}):null,t?.map(d=>(0,$.jsxs)("button",{type:"button",className:"art-version","aria-current":d.version===a?"true":void 0,onClick:()=>o(d.version),children:[(0,$.jsxs)("span",{className:"art-version-top",children:[(0,$.jsx)("span",{children:e("tab.versionOf",{version:d.version})}),d.version===n?(0,$.jsx)("span",{className:"art-badge",children:e("history.current")}):null]}),(0,$.jsx)("span",{className:"art-version-sub",children:Ar(e,d)})]},d.version))]})}var na=require("react"),f=require("react/jsx-runtime");function O({children:e,size:t=16}){return(0,f.jsx)("svg",{viewBox:"0 0 24 24",width:t,height:t,fill:"none",stroke:"currentColor",strokeWidth:1.7,strokeLinecap:"round",strokeLinejoin:"round","aria-hidden":"true",children:e})}var he=({size:e})=>(0,f.jsxs)(O,{size:e,children:[(0,f.jsx)("rect",{x:"3.5",y:"3.5",width:"7",height:"7",rx:"1.5"}),(0,f.jsx)("rect",{x:"13.5",y:"3.5",width:"7",height:"7",rx:"1.5"}),(0,f.jsx)("rect",{x:"3.5",y:"13.5",width:"7",height:"7",rx:"1.5"}),(0,f.jsx)("path",{d:"M17 13.5v7M13.5 17h7"})]}),U=({size:e})=>(0,f.jsxs)(O,{size:e,children:[(0,f.jsx)("rect",{x:"3.5",y:"4.5",width:"17",height:"15",rx:"2"}),(0,f.jsx)("path",{d:"M3.5 8.5h17M9 13l-2 1.8L9 16.5M15 13l2 1.8-2 1.7"})]}),Q=({size:e})=>(0,f.jsxs)(O,{size:e,children:[(0,f.jsx)("path",{d:"M6.5 3.5h7l4 4v13h-11z"}),(0,f.jsx)("path",{d:"M13.5 3.5v4h4M9 12h6M9 15.5h6"})]}),Nt=()=>(0,f.jsx)(O,{children:(0,f.jsx)("path",{d:"M12 5v14M5 12h14"})}),Le=()=>(0,f.jsx)(O,{children:(0,f.jsx)("path",{d:"M19.5 12a7.5 7.5 0 1 1-2.2-5.3M19.5 4.5v4h-4"})}),Ct=()=>(0,f.jsxs)(O,{children:[(0,f.jsx)("path",{d:"M4.5 12a7.5 7.5 0 1 0 2.2-5.3L4.5 9"}),(0,f.jsx)("path",{d:"M4.5 4.5V9H9M12 8v4.5l3 2"})]}),At=()=>(0,f.jsx)(O,{children:(0,f.jsx)("path",{d:"M12 4v11M7.5 10.5 12 15l4.5-4.5M5 19.5h14"})});var Rt=()=>(0,f.jsxs)(O,{children:[(0,f.jsx)("circle",{cx:"6",cy:"12",r:".8"}),(0,f.jsx)("circle",{cx:"12",cy:"12",r:".8"}),(0,f.jsx)("circle",{cx:"18",cy:"12",r:".8"})]}),Mt=()=>(0,f.jsxs)(O,{children:[(0,f.jsx)("path",{d:"M12 3.5a8.5 8.5 0 1 0 0 17c1.2 0 1.8-.9 1.4-1.9-.5-1.2.3-2.4 1.6-2.4h1.8a3.7 3.7 0 0 0 3.7-3.7c0-5-3.8-9-8.5-9Z"}),(0,f.jsx)("circle",{cx:"7.8",cy:"11",r:"1"}),(0,f.jsx)("circle",{cx:"10.5",cy:"7.3",r:"1"}),(0,f.jsx)("circle",{cx:"15",cy:"7.5",r:"1"})]}),Pt=()=>(0,f.jsx)(O,{children:(0,f.jsx)("path",{d:"M14.5 6 8.5 12l6 6"})}),Et=()=>(0,f.jsxs)(O,{children:[(0,f.jsx)("path",{d:"M5 4.5h11l3 3v12H5z"}),(0,f.jsx)("path",{d:"M8 4.5V9h7V4.5M8 19.5v-5h8v5"})]});var xe=require("react"),pe=require("react/jsx-runtime");function ve({label:e,items:t,onClose:r}){let n=(0,xe.useRef)(null),a=(0,xe.useRef)(null);return(0,xe.useEffect)(()=>{a.current=document.activeElement,n.current?.querySelector("button")?.focus();let o=d=>{d.target instanceof Node&&n.current?.contains(d.target)!==!0&&r()};return document.addEventListener("pointerdown",o,!0),()=>{document.removeEventListener("pointerdown",o,!0),a.current instanceof HTMLElement&&a.current.focus()}},[r]),(0,pe.jsx)("div",{ref:n,className:"art-menu",role:"menu","aria-label":e,onKeyDown:o=>{let d=[...n.current?.querySelectorAll("button")??[]],m=d.findIndex(p=>p===document.activeElement);o.key==="Escape"?(o.preventDefault(),o.stopPropagation(),r()):o.key==="ArrowDown"?(o.preventDefault(),d[(m+1)%d.length]?.focus()):o.key==="ArrowUp"&&(o.preventDefault(),d[(m-1+d.length)%d.length]?.focus())},children:t.map(o=>(0,pe.jsxs)("div",{role:"none",children:[o.separatorBefore===!0?(0,pe.jsx)("hr",{}):null,(0,pe.jsxs)("button",{type:"button",role:"menuitem",onClick:()=>{r(),o.run()},children:[o.icon,o.label]})]},o.id))})}var te=require("react");var ze=require("react/jsx-runtime");function $e({content:e,designCss:t,title:r,frameTitle:n}){let[a,o]=(0,te.useState)(null),[d,m]=(0,te.useState)(!1),p=(0,te.useRef)(0);return(0,te.useEffect)(()=>{p.current=0,m(!1);let h=URL.createObjectURL(new Blob([De(e,t,r)],{type:"text/html"}));return o(h),()=>URL.revokeObjectURL(h)},[e,t,r]),d?(0,ze.jsx)("div",{className:"art-center",role:"alert",children:r}):a===null?null:(0,ze.jsx)("iframe",{className:"art-frame",title:n,sandbox:wt,referrerPolicy:"no-referrer",src:a,onLoad:()=>{p.current+=1,p.current>1&&m(!0)}},a)}function Dt({value:e,readOnly:t,label:r,onChange:n,onSave:a}){return(0,ze.jsx)("textarea",{className:"art-source","aria-label":r,spellCheck:!1,readOnly:t,value:e,onChange:o=>n(o.target.value),onKeyDown:o=>{if((o.ctrlKey||o.metaKey)&&o.key.toLowerCase()==="s"){o.preventDefault(),a();return}if(o.key==="Tab"&&!o.shiftKey&&!t){o.preventDefault();let d=o.currentTarget,m=d.selectionStart,p=d.selectionEnd,h=`${e.slice(0,m)}  ${e.slice(p)}`;n(h),requestAnimationFrame(()=>d.setSelectionRange(m+2,m+2))}}})}var Oe=require("react");function Je(e){let t=e,r=new Set;return{get:()=>t,set(n){t=n;for(let a of r)a()},subscribe(n){return r.add(n),()=>r.delete(n)}}}var ue=Je(new Map);function re(e,t){if(ue.get().get(e)===t)return;let r=new Map(ue.get());r.set(e,t),ue.set(r)}function It(e){return ue.get().get(e)}function Lt(e){return(0,Oe.useSyncExternalStore)(ue.subscribe,()=>e===void 0?void 0:ue.get().get(e))}var we=Je(new Map);function ae(e,t){if((we.get().get(e)??0)>=t)return;let r=new Map(we.get());r.set(e,t),we.set(r)}function zt(e){return(0,Oe.useSyncExternalStore)(we.subscribe,()=>e===void 0?0:we.get().get(e)??0)}var He=Je(0);function G(){He.set(He.get()+1)}function $t(){return(0,Oe.useSyncExternalStore)(He.subscribe,He.get)}var Qe,J=null;function A(e){typeof document>"u"||(J===null&&(J=document.createElement("div"),J.className="art-toast",J.setAttribute("role","status")),J.textContent=e,J.isConnected||document.body.appendChild(J),Qe!==void 0&&clearTimeout(Qe),Qe=setTimeout(()=>J?.remove(),3600))}var s=require("react/jsx-runtime"),Rr=1200;function Mr(e){return e.scope==="workspace"?{scope:"workspace",workspaceId:e.workspaceId}:{scope:"library",workspaceId:null}}function Pr(e,t){switch(t){case"dirty":return{text:e("tab.unsaved"),tone:"warn"};case"saving":return{text:e("tab.saving")};case"conflict":return{text:e("error.stale"),tone:"error"};case"error":return{text:e("error.generic"),tone:"error"};case"clean":return{text:e("tab.saved")};default:return{text:String(t)}}}function et(e){let{t,useTabInfo:r}=e,n=r(),a=le(n.tab.contentId??n.tab.navigation?.address);return a===void 0?(0,s.jsx)("section",{className:"art-root",children:(0,s.jsx)("div",{className:"art-center",children:(0,s.jsx)("p",{className:"art-center-title",children:t("error.notFound")})})}):(0,s.jsx)(Er,{...e,address:a})}function Er({t:e,useTabInfo:t,address:r}){let n=t(),a=Mr(r),o=r.id,[d,m]=(0,u.useState)({status:"loading"}),[p,h]=(0,u.useState)("preview"),[k,N]=(0,u.useState)(null),[S,i]=(0,u.useState)("clean"),[v,oe]=(0,u.useState)(!1),[ke,ge]=(0,u.useState)(null),[We,me]=(0,u.useState)(!1),[R,W]=(0,u.useState)(null),[_,B]=(0,u.useState)(null),[se,q]=(0,u.useState)(!1),[x,X]=(0,u.useState)(0),ie=zt(o),E=(0,u.useRef)(void 0),Z=(0,u.useRef)(null);Z.current=k;let _e=(0,u.useRef)(S);_e.current=S;let Te=(0,u.useRef)(0),st=(0,u.useRef)(null);st.current=R;let ee=d.status==="ready"?d.payload:null,T=ee?.manifest??null,z=(0,u.useCallback)(()=>X(l=>l+1),[]);(0,u.useEffect)(()=>{let l=new AbortController;return C.get(a,o,void 0,l.signal).then(b=>{l.signal.aborted||(re(o,b.manifest.title),ae(o,b.manifest.version),m({status:"ready",payload:b}),N(null),i("clean"),W(null))}).catch(b=>{l.signal.aborted||m({status:"failed",code:M(b)})}),()=>l.abort()},[o,r.scope,x]),(0,u.useEffect)(()=>{T===null||ie<=Math.max(T.version,Te.current)||(Z.current===null?z():i("conflict"))},[ie,T,z]),(0,u.useEffect)(()=>{if(!v||T===null)return;let l=new AbortController;return ge(null),me(!1),C.history(a,o,l.signal).then(b=>{l.signal.aborted||ge(b.versions)}).catch(b=>{l.signal.aborted||(ge([]),me(!0),A(e(P(M(b)))))}),()=>l.abort()},[v,T?.version,o]);let Be=(0,u.useRef)(async()=>{}),Se=(0,u.useRef)(0);Se.current=T?.version??Se.current;let Ne=(0,u.useCallback)(()=>{E.current!==void 0&&clearTimeout(E.current),E.current=setTimeout(()=>void Be.current(),Rr)},[]);Be.current=async()=>{E.current!==void 0&&(clearTimeout(E.current),E.current=void 0);let l=Z.current;if(l!==null){if(_e.current==="saving"){Ne();return}if(_e.current!=="conflict"){i("saving");try{let{manifest:b}=await C.update(a,o,Se.current,l);Se.current=b.version,Te.current=b.version,ae(o,b.version),G(),m(j=>j.status==="ready"?{status:"ready",payload:{...j.payload,manifest:b,content:l,version:b.version}}:j),Z.current!==null&&Z.current!==l?(i("dirty"),Ne()):(N(null),i("clean"))}catch(b){let j=M(b);i(j==="artifact/stale-version"?"conflict":"error"),j!=="artifact/stale-version"&&A(e(P(j)))}}}};let Ue=(0,u.useCallback)(()=>Be.current(),[]),it=(0,u.useCallback)(()=>Z.current!==null&&!window.confirm(e("tab.discardConfirm"))?!1:(z(),!0),[z,e]);(0,u.useEffect)(()=>{let l=n.tab.actions;if(l!==void 0)return l.bindCommands({refresh:()=>void it()})},[n.tab.actions,it]);let lt=(0,u.useCallback)((l,b)=>{N(l),i(j=>j==="conflict"?j:"dirty"),b?Ne():E.current!==void 0&&(clearTimeout(E.current),E.current=void 0)},[Ne]);(0,u.useEffect)(()=>()=>{E.current!==void 0&&clearTimeout(E.current)},[]);let Xt=(0,u.useCallback)(l=>{if(T!==null){if(l===T.version){W(null);return}C.get(a,o,l).then(W).catch(b=>A(e(P(M(b)))))}},[T,o,e]),Zt=(0,u.useCallback)(async()=>{if(!(T===null||R===null)&&!(Z.current!==null&&!window.confirm(e("tab.discardConfirm"))))try{let{manifest:l}=await C.restore(a,o,R.version,T.version);Te.current=l.version,ae(o,l.version),G(),W(null),z()}catch(l){A(e(P(M(l))))}},[T,R,o,z,e]),Qt=(0,u.useCallback)(async l=>{try{let b=await C.exportFile(a,o,l);yt(b),A(e("export.done",{name:b.fileName,path:b.path}))}catch(b){A(e(P(M(b))))}},[o,e]),Jt=(0,u.useCallback)(async()=>{if(ee!==null)try{ee.manifest.type==="page"?Ze(De(Z.current??ee.content,ee.designCss,ee.manifest.title)):st.current!==null?A(e("tab.printOldVersion")):Ze((await C.printable(a,o)).html)}catch(l){A(e(P(M(l))))}},[ee,o,e]),ct=(0,u.useCallback)(async l=>{if(q(!1),!(T===null||l.trim()===""||l.trim()===T.title))try{let{manifest:b}=await C.rename(a,o,T.version,l);re(o,b.title),Te.current=b.version,ae(o,b.version),G(),z()}catch(b){A(e(P(M(b))))}},[T,o,z,e]),er=(0,u.useCallback)(async()=>{if(T!==null&&window.confirm(e("tab.deleteConfirm",{title:T.title})))try{await C.remove(a,o),G(),n.tab.actions?.close()}catch(l){A(e(P(M(l))))}},[T,o,n.tab.actions,e]);if(d.status==="loading")return(0,s.jsx)("section",{className:"art-root","data-dsh-artifacts":"",children:(0,s.jsx)("div",{className:"art-center",children:(0,s.jsx)("p",{className:"art-center-hint",children:e("empty.loading")})})});if(d.status==="failed"){let l=d.code==="artifact/not-found";return(0,s.jsx)("section",{className:"art-root","data-dsh-artifacts":"",children:(0,s.jsxs)("div",{className:"art-center",role:"alert",children:[(0,s.jsx)("p",{className:"art-center-title",children:e(l?"tab.deleted":P(d.code))}),l?(0,s.jsx)("p",{className:"art-center-hint",children:e("tab.deletedHint")}):null,(0,s.jsxs)("div",{className:"art-empty-actions",children:[l?null:(0,s.jsx)("button",{type:"button",className:"art-button",onClick:z,children:e("action.retry")}),(0,s.jsx)("button",{type:"button",className:"art-button",onClick:()=>n.tab.actions?.close(),children:e("tab.close")})]})]})})}let w=d.payload,tr=R??w,dt=R!==null,Ge=R===null?k??w.content:R.content,pt=Pr(e,S),rr=[...ft[w.manifest.type].map(l=>({id:l,label:e(`export.${l}`),run:()=>void Qt(l)})),{id:"print",label:e("export.print"),separatorBefore:!0,run:()=>void Jt()}],ar=[{id:"rename",label:e("tab.rename"),run:()=>q(!0)},{id:"reload",label:e("tab.reload"),run:z},{id:"delete",label:e("tab.delete"),separatorBefore:!0,run:()=>void er()}];return(0,s.jsxs)("section",{className:"art-root","data-dsh-artifacts":"","data-artifact-id":o,children:[(0,s.jsxs)("header",{className:"art-header art-relative",children:[(0,s.jsxs)("div",{className:"art-heading",children:[se?(0,s.jsx)("input",{className:"art-title-input","aria-label":e("tab.rename"),defaultValue:w.manifest.title,maxLength:120,autoFocus:!0,onBlur:l=>void ct(l.target.value),onKeyDown:l=>{l.key==="Enter"&&ct(l.currentTarget.value),l.key==="Escape"&&q(!1)}}):(0,s.jsx)("span",{className:"art-title",title:w.manifest.title,children:w.manifest.title}),(0,s.jsxs)("span",{className:"art-meta",children:[(0,s.jsx)("span",{className:"art-badge","data-scope":w.manifest.scope,children:e(`scope.${w.manifest.scope}`)}),(0,s.jsx)("span",{children:e("gallery.version",{version:w.manifest.version})})]})]}),(0,s.jsxs)("div",{className:"art-actions",children:[w.manifest.type==="page"?(0,s.jsxs)("div",{className:"art-segment",role:"group",children:[(0,s.jsx)("button",{type:"button","aria-pressed":p==="preview",onClick:()=>h("preview"),children:e("tab.preview")}),(0,s.jsx)("button",{type:"button","aria-pressed":p==="source",onClick:()=>h("source"),children:e("tab.source")})]}):null,k!==null&&R===null?(0,s.jsx)("button",{type:"button",className:"art-icon-button","aria-label":e("tab.save"),title:e("tab.save"),onClick:()=>void Ue(),children:(0,s.jsx)(Et,{})}):null,(0,s.jsx)("button",{type:"button",className:"art-icon-button","aria-label":e("tab.history"),title:e("tab.history"),"aria-pressed":v,onClick:()=>{oe(l=>!l),W(null)},children:(0,s.jsx)(Ct,{})}),(0,s.jsx)("button",{type:"button",className:"art-icon-button","aria-label":e("tab.export"),title:e("tab.export"),"aria-haspopup":"menu","aria-expanded":_==="export",onClick:()=>B(_==="export"?null:"export"),children:(0,s.jsx)(At,{})}),(0,s.jsx)("button",{type:"button",className:"art-icon-button","aria-label":e("tab.reload"),title:e("tab.reload"),onClick:z,children:(0,s.jsx)(Le,{})}),(0,s.jsx)("button",{type:"button",className:"art-icon-button","aria-label":e("gallery.more"),title:e("gallery.more"),"aria-haspopup":"menu","aria-expanded":_==="more",onClick:()=>B(_==="more"?null:"more"),children:(0,s.jsx)(Rt,{})})]}),_==="export"?(0,s.jsx)(ve,{label:e("tab.export"),items:rr,onClose:()=>B(null)}):null,_==="more"?(0,s.jsx)(ve,{label:e("gallery.more"),items:ar,onClose:()=>B(null)}):null]}),S==="conflict"?(0,s.jsxs)("div",{className:"art-bar","data-tone":"warn",role:"alert",children:[(0,s.jsxs)("span",{className:"art-bar-text",children:[(0,s.jsx)("strong",{children:e("tab.conflictTitle")}),(0,s.jsx)("span",{children:e("tab.conflictHint",{current:Math.max(ie,w.manifest.version)})})]}),(0,s.jsx)("span",{className:"art-bar-actions",children:(0,s.jsx)("button",{type:"button",className:"art-button",onClick:z,children:e("tab.reload")})})]}):null,R!==null?(0,s.jsxs)("div",{className:"art-bar",role:"status",children:[(0,s.jsx)("span",{className:"art-bar-text",children:(0,s.jsx)("span",{children:e("tab.viewingOld",{version:R.version,current:w.manifest.version})})}),(0,s.jsxs)("span",{className:"art-bar-actions",children:[(0,s.jsx)("button",{type:"button",className:"art-button",onClick:()=>W(null),children:e("tab.backToCurrent")}),(0,s.jsx)("button",{type:"button",className:"art-button art-button-primary",onClick:()=>void Zt(),children:e("tab.restoreThis")})]})]}):null,(0,s.jsxs)("div",{className:"art-body",children:[(0,s.jsxs)("div",{className:"art-stage",children:[w.manifest.type==="page"&&p==="preview"?(0,s.jsx)($e,{content:Ge,designCss:w.designCss,title:w.manifest.title,frameTitle:e("tab.frameTitle",{title:w.manifest.title})}):null,w.manifest.type==="page"&&p==="source"?(0,s.jsx)(Dt,{value:Ge,readOnly:dt,label:e("tab.source"),onChange:l=>lt(l,!1),onSave:()=>void Ue()}):null,w.manifest.type==="doc"?(0,s.jsx)(Ee,{markdown:Ge,revision:`${R===null?0:R.version}:${x}`,editable:!dt&&S!=="conflict",label:w.manifest.title,loadingLabel:e("empty.loading"),failedLabel:e("error.generic"),onChange:l=>lt(l,!0),onSave:()=>void Ue()}):null]}),v?(0,s.jsx)(St,{t:e,versions:ke,failed:We,current:w.manifest.version,selected:tr.version,onSelect:Xt}):null]}),(0,s.jsxs)("footer",{className:"art-status",children:[(0,s.jsx)("span",{children:w.manifest.type==="page"?e("tab.scripts"):e(`type.${w.manifest.type}`)}),(0,s.jsx)("span",{"data-tone":pt.tone,"aria-live":"polite",children:pt.text})]})]})}var Ht=dr(require("react"),1),ne=require("react/jsx-runtime"),Fe=class extends Ht.default.Component{constructor(t){super(t),this.state={failed:!1}}static getDerivedStateFromError(){return{failed:!0}}render(){return this.state.failed?(0,ne.jsx)("section",{className:"art-root","data-dsh-artifacts":"",children:(0,ne.jsxs)("div",{className:"art-center",role:"alert",children:[(0,ne.jsx)("p",{className:"art-center-title",children:this.props.title}),(0,ne.jsx)("p",{className:"art-center-hint",children:this.props.hint}),(0,ne.jsx)("button",{type:"button",className:"art-button",onClick:()=>window.location.reload(),children:this.props.reloadLabel})]})}):this.props.children}};var Ot=require("react");var fe={sidebarRight:null};var y=require("react/jsx-runtime");function Dr(e){if(e===null||typeof e!="object")return null;let t={...e},{id:r,type:n,title:a,version:o,workspaceId:d}=t;if(t.kind!=="artifact"||typeof r!="string"||typeof a!="string"||typeof o!="number"||n!=="page"&&n!=="doc")return null;let m=gt(r);return m===void 0?null:m==="workspace"?typeof d!="string"||d===""?null:{id:r,type:n,title:a,version:o,address:{scope:m,workspaceId:d,id:r}}:{id:r,type:n,title:a,version:o,address:{scope:m,id:r}}}function Ir(e){return Array.isArray(e)?e.map(t=>{if(t===null||typeof t!="object")return"";let r={...t};return r.type==="text"&&typeof r.text=="string"?r.text:""}).filter(t=>t!=="").join(`
`).trim():""}function tt({t:e,phase:t,toolName:r,block:n}){let a=t==="result"&&n?.isError!==!0?Dr(n?.meta):null;if((0,Ot.useEffect)(()=>{a!==null&&(re(a.id,a.title),ae(a.id,a.version),G())},[a?.id,a?.version,a?.title]),t!=="result")return(0,y.jsxs)("div",{className:"art-card","data-artifact-card":"working",children:[(0,y.jsx)("span",{className:"art-card-icon",children:(0,y.jsx)(U,{})}),(0,y.jsx)("span",{className:"art-card-status",role:"status",children:e("card.working")}),(0,y.jsx)("span",{})]});if(n?.isError===!0)return(0,y.jsxs)("div",{className:"art-card","data-artifact-card":"error",children:[(0,y.jsx)("span",{className:"art-card-icon",children:(0,y.jsx)(U,{})}),(0,y.jsxs)("span",{className:"art-card-text",children:[(0,y.jsx)("span",{className:"art-card-title",children:e("card.failed")}),(0,y.jsx)("span",{className:"art-card-status","data-tone":"error",children:Ir(n.content)})]}),(0,y.jsx)("span",{})]});if(a===null)return(0,y.jsxs)("div",{className:"art-card","data-artifact-card":"missing",children:[(0,y.jsx)("span",{className:"art-card-icon",children:(0,y.jsx)(U,{})}),(0,y.jsx)("span",{className:"art-card-status",children:e("card.missing")}),(0,y.jsx)("span",{})]});let o=be(a.address);return(0,y.jsxs)("div",{className:"art-card","data-artifact-card":"ready","data-artifact-id":a.id,children:[(0,y.jsx)("span",{className:"art-card-icon",children:a.type==="page"?(0,y.jsx)(U,{}):(0,y.jsx)(Q,{})}),(0,y.jsxs)("span",{className:"art-card-text",children:[(0,y.jsx)("span",{className:"art-card-title",title:a.title,children:a.title}),(0,y.jsxs)("span",{className:"art-card-sub",children:[(0,y.jsx)("span",{children:e(r==="artifact_update"?"card.updated":"card.created")}),(0,y.jsx)("span",{children:"\xB7"}),(0,y.jsx)("span",{children:e(`type.${a.type}`)}),(0,y.jsx)("span",{className:"art-badge","data-scope":a.address.scope,children:e(`scope.${a.address.scope}`)}),(0,y.jsx)("span",{children:e("gallery.version",{version:a.version})})]})]}),(0,y.jsx)("button",{type:"button",className:"art-button",onClick:()=>fe.sidebarRight?.openResource(o),children:e("card.open")})]})}var rt=require("react/jsx-runtime"),at="artifacts";function Ft({t:e}){return(0,rt.jsx)("button",{type:"button",className:"art-composer","aria-label":e("composer.label"),title:e("composer.label"),onClick:()=>fe.sidebarRight?.openTab(at),children:(0,rt.jsx)(he,{})})}var I=require("react");var jt=require("react");function Vt({sessionId:e,useSessions:t,useWorkspaces:r}){let n=r(o=>o.items),a=t(o=>o.byId[e]);return(0,jt.useMemo)(()=>{let o=typeof a?.cwd=="string"?a.cwd:null,d=n.find(m=>m.sessionIds?.includes(e))??n.find(m=>o!==null&&(o===m.path||o.startsWith(`${m.path}/`)))??null;return{root:o??d?.path??null,workspaceId:d?.workspaceId??null}},[n,a,e])}var K=require("react");var g=require("react/jsx-runtime"),Lr=["primary","accent","surface","text","muted"],zr=["sm","md","lg"],$r=e=>`<!doctype html><html><head><style>
body { margin: 0; padding: 20px; font-family: var(--artifact-font-family); background: var(--artifact-color-surface); color: var(--artifact-color-text); }
h2 { margin: 0 0 6px; font-size: var(--artifact-font-size-4); letter-spacing: -0.02em; }
p { margin: 0 0 14px; color: var(--artifact-color-muted); }
.row { display: flex; gap: 8px; align-items: center; }
button { padding: 8px 14px; border: 0; border-radius: var(--artifact-radius-md); background: var(--artifact-color-primary); color: #fff; font: inherit; }
.tag { padding: 3px 8px; border-radius: var(--artifact-radius-sm); background: var(--artifact-color-accent); color: #fff; font-size: 12px; }
code { font-family: var(--artifact-font-mono); font-size: 12px; }
</style></head><body><h2>${e("design.previewHeading")}</h2><p>${e("design.previewBody")}</p>
<div class="row"><button>${e("design.previewButton")}</button><span class="tag">+12%</span><code>var(--artifact-color-primary)</code></div></body></html>`;function Hr(e){return/^#[0-9a-f]{6}$/i.test(e)}function Wt({t:e,workspaceId:t}){let[r,n]=(0,K.useState)(null),[a,o]=(0,K.useState)(null),[d,m]=(0,K.useState)(!1),[p,h]=(0,K.useState)(!1);(0,K.useEffect)(()=>{let i=new AbortController;return C.designSystem(t,i.signal).then(v=>{n(v),o(v.tokens)}).catch(()=>{i.signal.aborted||m(!0)}),()=>i.abort()},[t]);let k=(0,K.useMemo)(()=>a===null?"":mt(a),[a]);if(d)return(0,g.jsx)("p",{className:"art-note",children:e("error.generic")});if(r===null||a===null)return(0,g.jsx)("p",{className:"art-note",children:e("empty.loading")});let N=async i=>{h(!0);try{let v=await C.saveDesignSystem({scope:i,workspaceId:t},a);n(v),o(v.tokens),A(e("design.saved"))}catch(v){A(e(P(M(v))))}finally{h(!1)}},S=async()=>{if(t!==null){h(!0);try{let i=await C.clearDesignSystem(t);n(i),o(i.tokens)}catch(i){A(e(P(M(i))))}finally{h(!1)}}};return(0,g.jsxs)("div",{className:"art-design",children:[(0,g.jsxs)("p",{className:"art-design-source",children:[e("design.hint")," ",e(`design.source.${r.source}`)]}),(0,g.jsxs)("div",{className:"art-design-group",children:[(0,g.jsx)("h3",{children:e("design.preview")}),(0,g.jsx)("div",{className:"art-design-preview",style:{height:150,display:"flex"},children:(0,g.jsx)($e,{content:$r(e),designCss:k,title:a.name,frameTitle:e("design.preview")})})]}),(0,g.jsxs)("label",{className:"art-field",children:[e("design.name"),(0,g.jsx)("input",{type:"text",value:a.name,maxLength:80,onChange:i=>o({...a,name:i.target.value})})]}),(0,g.jsxs)("div",{className:"art-design-group",children:[(0,g.jsx)("h3",{children:e("design.colors")}),(0,g.jsx)("div",{className:"art-swatches",children:Lr.map(i=>(0,g.jsxs)("div",{className:"art-swatch",children:[(0,g.jsx)("input",{type:"color","aria-label":e(`design.color.${i}`),value:Hr(a.colors[i])?a.colors[i]:"#000000",onChange:v=>o({...a,colors:{...a.colors,[i]:v.target.value}})}),(0,g.jsxs)("span",{className:"art-swatch-text",children:[e(`design.color.${i}`),(0,g.jsx)("input",{type:"text","aria-label":`${e(`design.color.${i}`)} CSS`,value:a.colors[i],onChange:v=>o({...a,colors:{...a.colors,[i]:v.target.value}})})]})]},i))})]}),(0,g.jsxs)("div",{className:"art-design-group",children:[(0,g.jsx)("h3",{children:e("design.type")}),(0,g.jsxs)("label",{className:"art-field",children:[e("design.font"),(0,g.jsx)("input",{type:"text",value:a.typography.fontFamily,onChange:i=>o({...a,typography:{...a.typography,fontFamily:i.target.value}})})]}),(0,g.jsxs)("label",{className:"art-field",children:[e("design.mono"),(0,g.jsx)("input",{type:"text",value:a.typography.monoFamily,onChange:i=>o({...a,typography:{...a.typography,monoFamily:i.target.value}})})]})]}),(0,g.jsxs)("div",{className:"art-design-group",children:[(0,g.jsx)("h3",{children:e("design.radius")}),(0,g.jsx)("div",{className:"art-radius-row",children:zr.map(i=>(0,g.jsxs)("label",{children:[e(`design.radius.${i}`),(0,g.jsx)("input",{type:"number",min:0,max:64,value:a.radius[i],onChange:v=>o({...a,radius:{...a.radius,[i]:Number(v.target.value)||0}})})]},i))})]}),(0,g.jsxs)("label",{className:"art-field",children:[e("design.notes"),(0,g.jsx)("textarea",{value:a.notes,maxLength:4e3,onChange:i=>o({...a,notes:i.target.value})}),(0,g.jsx)("span",{className:"art-field-hint",children:e("design.notesHint")})]}),(0,g.jsxs)("div",{className:"art-design-actions",children:[t===null?null:(0,g.jsx)("button",{type:"button",className:"art-button art-button-primary",disabled:p,onClick:()=>void N("workspace"),children:e("design.saveWorkspace")}),(0,g.jsx)("button",{type:"button",className:t===null?"art-button art-button-primary":"art-button",disabled:p,onClick:()=>void N("library"),children:e("design.saveLibrary")}),r.source==="workspace"&&t!==null?(0,g.jsx)("button",{type:"button",className:"art-button",disabled:p,onClick:()=>void S(),children:e("design.clear")}):null]})]})}var Or=`<!doctype html>
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
`,Fr=`# {{title}}

Start writing, or ask the agent to draft this document.
`;function _t(e,t){if(e==="doc")return Fr.replace("{{title}}",t.replace(/[\\`*_[\]#]/g,n=>`\\${n}`));let r=t.replace(/[&<>"']/g,n=>`&#${n.charCodeAt(0)};`);return Or.replace("{{title}}",r)}var c=require("react/jsx-runtime");function jr(e,t,r){if(e!==void 0)if(re(t.id,t.title),t.scope==="workspace"){if(r===null)return;e(be({scope:"workspace",workspaceId:r,id:t.id}))}else e(be({scope:"library",id:t.id}))}function Bt({t:e,scope:t,state:r,query:n,onOpen:a,onMore:o,onCreate:d}){let m=`art-section-${t}`;return(0,c.jsxs)("section",{className:"art-section","aria-labelledby":m,children:[(0,c.jsxs)("div",{className:"art-section-head",children:[(0,c.jsx)("h2",{className:"art-section-title",id:m,children:e(`scope.${t}`)}),(0,c.jsx)("span",{className:"art-section-hint",children:r.status==="ready"&&r.page.total>0?e("gallery.count",{count:r.page.total}):e(`scope.${t}Hint`)})]}),r.status==="loading"?(0,c.jsx)("p",{className:"art-note",children:e("empty.loading")}):null,r.status==="failed"?(0,c.jsx)("div",{className:"art-empty",role:"alert",children:(0,c.jsx)("p",{className:"art-empty-title",children:e(P(r.code))})}):null,r.status==="ready"&&r.page.items.length===0?n!==""?(0,c.jsx)("p",{className:"art-note",children:e("empty.noMatch")}):(0,c.jsxs)("div",{className:"art-empty",children:[(0,c.jsx)("p",{className:"art-empty-title",children:e(t==="workspace"?"empty.workspaceTitle":"empty.libraryTitle")}),(0,c.jsx)("p",{className:"art-empty-hint",children:e(t==="workspace"?"empty.workspaceHint":"empty.libraryHint")}),(0,c.jsxs)("div",{className:"art-empty-actions",children:[(0,c.jsxs)("button",{type:"button",className:"art-button",onClick:()=>d("page",t),children:[(0,c.jsx)(U,{size:14}),e("gallery.newPage")]}),(0,c.jsxs)("button",{type:"button",className:"art-button",onClick:()=>d("doc",t),children:[(0,c.jsx)(Q,{size:14}),e("gallery.newDoc")]})]})]}):null,r.status==="ready"&&r.page.items.length>0?(0,c.jsx)("ul",{className:"art-list",children:r.page.items.map(p=>(0,c.jsx)("li",{children:(0,c.jsxs)("button",{type:"button",className:"art-row",onClick:()=>a(p),children:[(0,c.jsx)("span",{className:"art-row-icon","data-type":p.type,children:p.type==="page"?(0,c.jsx)(U,{}):(0,c.jsx)(Q,{})}),(0,c.jsxs)("span",{className:"art-row-text",children:[(0,c.jsx)("span",{className:"art-row-title",children:p.title}),(0,c.jsxs)("span",{className:"art-row-sub",children:[e(`type.${p.type}`)," \xB7 ",e("gallery.updated",{time:Ie(e,p.updatedAt)})]})]}),(0,c.jsx)("span",{className:"art-row-version",children:e("gallery.version",{version:p.version})})]})},p.id))}):null,r.status==="ready"&&r.page.hasMore?(0,c.jsx)("button",{type:"button",className:"art-button",style:{margin:"6px 8px"},onClick:o,children:e("gallery.more")}):null,r.status==="ready"&&r.page.truncated?(0,c.jsx)("p",{className:"art-note",children:e("gallery.truncated")}):null]})}function Ut(e,t,r){let[n,a]=(0,I.useState)({status:"loading"}),[o,d]=(0,I.useState)(1),m=e===null?"none":`${e.scope}:${e.workspaceId??""}`;return(0,I.useEffect)(()=>d(1),[m,t]),(0,I.useEffect)(()=>{if(e===null)return;let p=new AbortController,h=setTimeout(async()=>{try{let k=[];for(let S=0;S<o&&(k.push(await C.list(e,{query:t,offset:S*50},p.signal)),!!k[k.length-1]?.hasMore);S+=1);let N=k[k.length-1];if(N===void 0||p.signal.aborted)return;a({status:"ready",page:{...N,items:k.flatMap(S=>S.items)}})}catch(k){p.signal.aborted||a({status:"failed",code:M(k)})}},t===""?0:180);return()=>{p.abort(),clearTimeout(h)}},[m,t,r,o]),{state:n,more:()=>d(p=>p+1)}}function nt(e){let{t,sessionId:r,useSessions:n,useWorkspaces:a,useTabInfo:o}=e,d=o(),p=Vt({sessionId:r,useSessions:n,useWorkspaces:a}).workspaceId,[h,k]=(0,I.useState)(""),[N,S]=(0,I.useState)("all"),[i,v]=(0,I.useState)("list"),[oe,ke]=(0,I.useState)(!1),[ge,We]=(0,I.useState)(0),me=$t()+ge,R=Ut(p===null?null:{scope:"workspace",workspaceId:p},h,me),W=Ut({scope:"library",workspaceId:p},h,me),_=d.tab.actions?.openResource,B=(0,I.useCallback)(x=>jr(_,x,p),[_,p]),se=(0,I.useCallback)(async(x,X)=>{if(X==="workspace"&&p===null)return;let ie=t(x==="page"?"create.untitledPage":"create.untitledDoc");try{let{manifest:E}=await C.create({scope:X,workspaceId:p},x,ie,_t(x,ie));G(),B(E)}catch(E){A(t(P(M(E))))}},[p,t,B]),q=N==="library"||p===null?"library":"workspace";return(0,c.jsxs)("section",{className:"art-root","data-dsh-artifacts":"",children:[(0,c.jsxs)("header",{className:"art-header art-relative",children:[(0,c.jsxs)("div",{className:"art-heading",children:[i==="design"?(0,c.jsx)("button",{type:"button",className:"art-icon-button","aria-label":t("panel"),title:t("panel"),onClick:()=>v("list"),children:(0,c.jsx)(Pt,{})}):null,(0,c.jsx)("span",{className:"art-title",children:t(i==="design"?"design.title":"panel")})]}),i==="list"?(0,c.jsxs)("div",{className:"art-actions",children:[(0,c.jsx)("button",{type:"button",className:"art-icon-button","aria-label":t("gallery.design"),title:t("gallery.design"),onClick:()=>v("design"),children:(0,c.jsx)(Mt,{})}),(0,c.jsx)("button",{type:"button",className:"art-icon-button","aria-label":t("gallery.refresh"),title:t("gallery.refresh"),onClick:()=>We(x=>x+1),children:(0,c.jsx)(Le,{})}),(0,c.jsx)("button",{type:"button",className:"art-icon-button","aria-label":t("gallery.new"),title:t("gallery.new"),"aria-haspopup":"menu","aria-expanded":oe,onClick:()=>ke(x=>!x),children:(0,c.jsx)(Nt,{})})]}):null,oe?(0,c.jsx)(ve,{label:t("gallery.new"),onClose:()=>ke(!1),items:[{id:"page",label:`${t("gallery.newPage")} \xB7 ${t(`scope.${q}`)}`,icon:(0,c.jsx)(U,{size:14}),run:()=>void se("page",q)},{id:"doc",label:`${t("gallery.newDoc")} \xB7 ${t(`scope.${q}`)}`,icon:(0,c.jsx)(Q,{size:14}),run:()=>void se("doc",q)}]}):null]}),i==="design"?(0,c.jsx)("div",{className:"art-scroll",children:(0,c.jsx)(Wt,{t,workspaceId:p})}):(0,c.jsxs)(c.Fragment,{children:[(0,c.jsxs)("div",{className:"art-toolbar",children:[(0,c.jsx)("input",{className:"art-search",type:"search","aria-label":t("gallery.searchLabel"),placeholder:t("gallery.search"),value:h,onChange:x=>k(x.target.value)}),(0,c.jsx)("div",{className:"art-segment",role:"group","aria-label":t("create.scope"),children:["all","workspace","library"].map(x=>(0,c.jsx)("button",{type:"button","aria-pressed":N===x,onClick:()=>S(x),children:t(x==="all"?"filter.all":`scope.${x}`)},x))})]}),(0,c.jsxs)("div",{className:"art-scroll",children:[N!=="library"?p===null?(0,c.jsx)("p",{className:"art-note",style:{padding:"12px 14px"},children:t("empty.noWorkspace")}):(0,c.jsx)(Bt,{t,scope:"workspace",state:R.state,query:h,onOpen:B,onMore:R.more,onCreate:(x,X)=>void se(x,X)}):null,N!=="workspace"?(0,c.jsx)(Bt,{t,scope:"library",state:W.state,query:h,onOpen:B,onMore:W.more,onCreate:(x,X)=>void se(x,X)}):null]})]})]})}var Gt="dsh-artifacts/styles",Vr=`
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
@media (prefers-reduced-motion: no-preference) {
  .art-row, .art-version, .art-icon-button, .art-button { transition: background-color .12s ease-out, color .12s ease-out; }
  .art-toast { animation: art-rise .18s cubic-bezier(.16, 1, .3, 1); }
}
@keyframes art-rise { from { opacity: 0; transform: translate(-50%, 6px); } to { opacity: 1; transform: translate(-50%, 0); } }
`;function Kt(){if(typeof document>"u"||document.querySelector(`style[data-plugin-css="${Gt}"]`)!==null)return;let e=document.createElement("style");e.dataset.plugin="dsh-artifacts",e.dataset.pluginCss=Gt,e.textContent=Vr,document.head.appendChild(e)}var F=require("react/jsx-runtime");var Y="artifacts",je="dsh-artifacts",Ve="dsh-artifacts/artifact",Yt="artifact",qt=["artifact_create","artifact_update"],Wr=["connection","slots","locale","sidebarRightTabs","sidebarRight"];function ot(e){return function(r){return(0,F.jsx)(Fe,{title:r.t("error.surface"),hint:r.t("error.surfaceHint"),reloadLabel:r.t("action.reloadWindow"),children:(0,F.jsx)(e,{...r})})}}function _r({t:e}){return(0,F.jsxs)("span",{className:"art-chip",children:[(0,F.jsx)(he,{}),(0,F.jsx)("span",{children:e("panel")})]})}function Br({useTabInfo:e}){let{tab:t}=e(),r=le(t.contentId??t.navigation?.address),n=Lt(r?.id);return(0,F.jsxs)("span",{className:"art-chip",children:[(0,F.jsx)(Q,{}),(0,F.jsx)("span",{children:n??r?.id??""})]})}function Ur(e){Kt(),bt(e.connection),fe.sidebarRight=e.sidebarRight,e.locale.register(Y,"en",kt),e.locale.register(Y,"zh",Tt);let t=e.locale.bind(Y),r=(a,o)=>t(a,o);e.effect(()=>e.sidebarRightTabs.register({id:je,kind:at,priority:"extension",keepMounted:!0,title:()=>r("panel"),guide:[{id:"artifacts",order:40,title:()=>r("guide.title"),description:()=>r("guide.description"),icon:()=>(0,F.jsx)(he,{size:22})}]}),"dsh-artifacts: gallery tab type"),e.effect(()=>e.sidebarRightTabs.register({id:Ve,kind:Yt,priority:"extension",patterns:["dsh-resource://artifact/**"],canOpen:a=>le(a)!==void 0,title:a=>{let o=le(a);return o===void 0?"":It(o.id)??o.id}}),"dsh-artifacts: artifact tab type");let n=()=>({t:r});e.slots.inject("sidebar.right.pane.tab",()=>e.slots.register({name:"sidebar.right.pane.tab",key:je,locale:Y,inject:n},ot(nt))),e.slots.inject("sidebar.right.pane.tab",()=>e.slots.register({name:"sidebar.right.pane.tab",key:Ve,locale:Y,inject:n},ot(et))),e.slots.inject("sidebar.right.pane.tab.title",()=>e.slots.register({name:"sidebar.right.pane.tab.title",key:je,locale:Y,inject:n},_r)),e.slots.inject("sidebar.right.pane.tab.title",()=>e.slots.register({name:"sidebar.right.pane.tab.title",key:Ve,locale:Y,inject:n},Br));for(let a of qt)e.slots.inject("tool.call.toolview",()=>e.slots.register({name:"tool.call.toolview",key:a,locale:Y,inject:n},ot(tt)));e.slots.inject("conversation.input.left",()=>e.slots.register({name:"conversation.input.left",id:"dsh-artifacts",order:40,locale:Y,inject:n},Ft))}

    return module.exports;
  },
});
