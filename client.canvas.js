window.__ModuleLoader__.load({
  id: "dsh-artifact-studio",
  chunk: "client.canvas.js",
  factory(require) {
    var module = { exports: {} };
    var exports = module.exports;
"use strict";var o=Object.defineProperty;var t=Object.getOwnPropertyDescriptor;var r=Object.getOwnPropertyNames;var g=Object.prototype.hasOwnProperty;var v=(n,s)=>{for(var e in s)o(n,e,{get:s[e],enumerable:!0})},c=(n,s,e,i)=>{if(s&&typeof s=="object"||typeof s=="function")for(let a of r(s))!g.call(n,a)&&a!==e&&o(n,a,{get:()=>s[a],enumerable:!(i=t(s,a))||i.enumerable});return n};var C=n=>c(o({},"__esModule",{value:!0}),n);var _={};v(_,{mountDesignCanvas:()=>u});module.exports=C(_);var d=["/artifacts-canvas/canvas.engine.js?v=","0.10.0"].join("");function l(n){return n===null||typeof n!="object"?!1:typeof{...n}.mountDesignCanvas=="function"}async function u(n){let s=await import(d);if(!l(s))throw new Error("The canvas engine did not load.");return s.mountDesignCanvas(n)}

    return module.exports;
  },
});
