/* Adaptador do app ROTINA na nuvem: imita o claude.use("db") da página usando o Supabase.
   Login uma vez por aparelho (fica lembrado), cópia local para abrir rápido e sem internet,
   anotações feitas offline ficam guardadas e sobem quando a internet voltar. */
(function(){
  var CFG = window.ROTINA_CFG || {};
  var sb = window.supabase.createClient(CFG.url, CFG.anon, {auth:{persistSession:true, autoRefreshToken:true}});
  var listeners = [], state = null, pend = {};
  var META = {fromCache:false, hasPendingWrites:false};
  function ls(k,v){try{if(v===undefined){var s=localStorage.getItem(k);return s?JSON.parse(s):null}localStorage.setItem(k,JSON.stringify(v))}catch(e){return null}}
  state = ls("rotina_cache"); pend = ls("rotina_pend") || {};
  function aplicarPend(){Object.keys(pend).forEach(function(k){var i=k.indexOf("/"),c=k.slice(0,i),id=k.slice(i+1);state=state||{};state[c]=state[c]||{};
    if(pend[k]===null)delete state[c][id];else state[c][id]=pend[k]})}
  if(state) aplicarPend();
  function fire(){ls("rotina_cache",state);listeners.slice().forEach(function(l){try{l()}catch(e){console.error(e)}})}
  function avisar(t){var el=document.getElementById("status");if(el){el.textContent=t||"";el.hidden=!t;el.classList.toggle("err",!!t)}}
  function snapCol(name){var m=(state&&state[name])||{};var docs=Object.keys(m).map(function(id){var d=m[id];return {id:id,exists:true,data:function(){return d},metadata:META}});
    return {docs:docs,size:docs.length,empty:!docs.length,docChanges:function(){return []},metadata:META}}
  function snapDoc(c,id){var d=state&&state[c]&&state[c][id];return {id:id,exists:!!d,data:function(){return d},metadata:META}}

  async function carregarTudo(){
    var todos={},de=0;
    while(true){var r=await sb.from("docs").select("col,id,data").range(de,de+999);if(r.error)throw r.error;
      r.data.forEach(function(x){(todos[x.col]=todos[x.col]||{})[x.id]=x.data});if(r.data.length<1000)break;de+=1000}
    state=todos;aplicarPend();fire();
  }
  async function enviar(k){
    var i=k.indexOf("/"),c=k.slice(0,i),id=k.slice(i+1),v=pend[k],r;
    if(v===null) r=await sb.from("docs").delete().eq("col",c).eq("id",id);
    else r=await sb.from("docs").upsert({col:c,id:id,data:v},{onConflict:"user_id,col,id"});
    if(r.error) throw r.error;
    if(pend[k]===v){delete pend[k];ls("rotina_pend",pend)}
  }
  var enviando=false;
  async function esvaziar(){if(enviando)return;enviando=true;
    try{for(var k of Object.keys(pend)){await enviar(k)}avisar(Object.keys(pend).length?"":"")}
    catch(e){avisar("Sem internet: "+Object.keys(pend).length+" mudança(s) guardada(s) no aparelho, sobem sozinhas quando a conexão voltar.")}
    enviando=false}
  async function write(c,id,body,del){
    state=state||{};state[c]=state[c]||{};
    if(del)delete state[c][id];else state[c][id]=body;
    pend[c+"/"+id]=del?null:body;ls("rotina_pend",pend);fire();
    esvaziar();
  }
  function sub(fn){listeners.push(fn);if(state)fn();return function(){var i=listeners.indexOf(fn);if(i>=0)listeners.splice(i,1)}}
  var db={
    collection:function(name){return {onSnapshot:function(next){return sub(function(){next(snapCol(name))})},get:async function(){return snapCol(name)},doc:function(id){return db.doc(name+"/"+id)}}},
    doc:function(path){var p=path.split("/"),c=p[0],id=p[1];return {
      set:function(b){return write(c,id,JSON.parse(JSON.stringify(b)))},
      update:function(b){return write(c,id,Object.assign({},(state&&state[c]&&state[c][id])||{},b))},
      delete:function(){return write(c,id,null,true)},
      get:async function(){return snapDoc(c,id)},
      onSnapshot:function(next){return sub(function(){next(snapDoc(c,id))})}}}
  };
  var pronto; var dbPronto=new Promise(function(r){pronto=r});
  window.claude={use:function(n){return n==="db"?dbPronto:Promise.resolve(null)}};

  async function ligar(){
    pronto(db);
    try{await carregarTudo();avisar("")}catch(e){if(state)avisar("Sem internet: mostrando a última cópia deste aparelho.");else avisar("Não consegui carregar ("+(e.message||e)+").")}
    sb.channel("docs-"+Math.random().toString(36).slice(2)).on("postgres_changes",{event:"*",schema:"public",table:"docs"},function(p){
      state=state||{};
      if(p.eventType==="DELETE"){var o=p.old||{};if(o.col&&state[o.col])delete state[o.col][o.id]}
      else{var n=p.new;if(pend[n.col+"/"+n.id]!==undefined)return;(state[n.col]=state[n.col]||{})[n.id]=n.data}
      fire()}).subscribe();
    esvaziar();
    document.addEventListener("visibilitychange",function(){if(!document.hidden){esvaziar();carregarTudo().catch(function(){})}});
    window.addEventListener("online",function(){esvaziar();carregarTudo().catch(function(){})});
    var top=document.querySelector(".top");
    if(top){var b=document.createElement("button");b.type="button";b.className="ghost";b.style.fontSize="12px";b.textContent="Sair";
      b.onclick=async function(){await sb.auth.signOut();try{localStorage.removeItem("rotina_cache")}catch(e){}location.reload()};top.appendChild(b)}
  }

  function telaLogin(){
    var d=document.createElement("div");
    d.innerHTML='<form id="loginRotina" style="position:fixed;inset:0;z-index:50;display:flex;align-items:center;justify-content:center;background:var(--bg);padding:16px">'+
      '<div class="panel" style="width:100%;max-width:360px"><h2>Entrar no ROTINA</h2><p class="small muted" style="margin:0">Só na primeira vez em cada aparelho.</p>'+
      '<input id="lgEmail" type="email" autocomplete="username" placeholder="E-mail" required>'+
      '<input id="lgSenha" type="password" autocomplete="current-password" placeholder="Senha" required>'+
      '<button class="primary">Entrar</button><span class="small" id="lgMsg" style="color:var(--bad)"></span></div></form>';
    document.body.appendChild(d);
    d.querySelector("form").onsubmit=async function(e){e.preventDefault();var m=d.querySelector("#lgMsg");m.textContent="Entrando…";
      var r=await sb.auth.signInWithPassword({email:d.querySelector("#lgEmail").value.trim(),password:d.querySelector("#lgSenha").value});
      if(r.error){m.textContent="Não entrou: confira e-mail e senha.";return}
      d.remove();ligar()};
  }

  document.addEventListener("DOMContentLoaded",async function(){
    var s=await sb.auth.getSession();
    if(s.data&&s.data.session)ligar();else telaLogin();
  });
  if("serviceWorker" in navigator)window.addEventListener("load",function(){navigator.serviceWorker.register("sw.js").catch(function(){})});
})();
