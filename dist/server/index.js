const page = `<!doctype html>
<html lang="es-AR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Pendientes City Bell</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#f2f4eb;color:#1e352a;font:16px system-ui,sans-serif}main{max-width:650px;margin:auto;padding:clamp(22px,6vw,54px) 18px}header{padding:32px 26px;background:#234537;color:#fff;border-radius:24px}h1{font-size:clamp(27px,7vw,44px);margin:0;letter-spacing:-.04em}header p{margin:8px 0 0;color:#dce8dc}section{margin-top:18px;background:#fff;padding:20px;border-radius:20px}label{display:block;font-weight:700;margin-bottom:8px}.entry,li{display:flex;gap:10px;align-items:center}input,button{font:inherit}input:not([type=checkbox]){min-width:0;flex:1;border:1px solid #aab9ae;border-radius:10px;padding:12px}button{border:0;border-radius:10px;padding:12px 16px;background:#286247;color:white;cursor:pointer}button:disabled{opacity:.6}input[type=checkbox]{width:22px;height:22px;flex:none;accent-color:#286247;cursor:pointer}ul{margin:0;padding:0;list-style:none}li{padding:12px 0;border-bottom:1px solid #e3e9e3;overflow-wrap:anywhere}li:last-child{border:0}li:has(:checked) span{text-decoration:line-through;color:#54665b}#status{margin:10px 0 0;color:#7b3232}#status:empty{display:none}#empty{color:#54665b}h2{font-size:19px;margin:0 0 8px}button:focus-visible,input:focus-visible{outline:3px solid #8da47b;outline-offset:2px}
</style>
<main><header><h1>Pendientes City Bell</h1><p id="count" aria-live="polite">Cargando lista…</p></header>
<section><form><label for="title">Nuevo pendiente</label><div class="entry"><input id="title" maxlength="200" required placeholder="¿Qué tenés que hacer?"><button>Agregar</button></div></form><p id="status" role="alert"></p></section>
<section><h2>Mi lista</h2><p id="empty" hidden>Todavía no hay pendientes.</p><ul></ul></section></main>
<script>
const form=document.querySelector('form');
const title=document.querySelector('#title');
const button=form.querySelector('button');
const list=document.querySelector('ul');
const status=document.querySelector('#status');
const count=document.querySelector('#count');
let busy=false;
async function api(body) {
  const response=await fetch('/api/pendientes',body ? {method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)} : {});
  if(!response.ok) throw Error('No se pudo conectar con la lista. Probá de nuevo.');
  return response.json();
}
function render(items) {
  list.replaceChildren();
  document.querySelector('#empty').hidden=items.length>0;
  count.textContent=items.filter(item=>!item.hecho).length+' por hacer · '+items.filter(item=>item.hecho).length+' hechos';
  for(const item of items) {
    const row=document.createElement('li');
    const check=document.createElement('input');
    check.type='checkbox';
    check.checked=Boolean(item.hecho);
    check.setAttribute('aria-label',item.titulo);
    const name=document.createElement('span');
    name.textContent=item.titulo;
    check.onchange=async()=>{
      const value=check.checked;
      if(busy){check.checked=!value;return;}
      await run(async()=>{try{render(await api({accion:'marcar',id:item.id,hecho:value}));}catch(error){check.checked=!value;throw error;}});
    };
    row.append(check,name);
    list.append(row);
  }
}
async function run(action){
  if(busy)return;
  busy=true;
  button.disabled=true;
  status.textContent='';
  try{await action();}catch(error){status.textContent=error.message;}
  finally{busy=false;button.disabled=false;}
}
form.onsubmit=event=>{
  event.preventDefault();
  const value=title.value.trim();
  if(!value){title.focus();return;}
  run(async()=>{render(await api({accion:'agregar',titulo:value}));if(title.value.trim()===value)title.value='';title.focus();});
};
const refresh=()=>run(async()=>render(await api()));
refresh();
window.addEventListener('focus',refresh);
setInterval(()=>{if(!document.hidden)refresh();},30000);
</script></html>`;

const definitions = [
  {name:'listar_pendientes',description:'Lista las tareas de Pendientes City Bell.',inputSchema:{type:'object',properties:{}}},
  {name:'agregar_pendiente',description:'Agrega una tarea a Pendientes City Bell.',inputSchema:{type:'object',properties:{titulo:{type:'string',minLength:1,maxLength:200}},required:['titulo']}},
  {name:'marcar_pendiente',description:'Marca una tarea como hecha o la reabre mediante su ID.',inputSchema:{type:'object',properties:{id:{type:'integer',minimum:1},hecho:{type:'boolean'}},required:['id','hecho']}}
];
const json = (data, status=200) => Response.json(data,{status,headers:{'Cache-Control':'no-store'}});
async function list(db) {
  const {results} = await db.prepare('SELECT id, titulo, hecho FROM pendientes ORDER BY hecho, id DESC').all();
  return results;
}
async function add(db, title) {
  if(typeof title!=='string' || !title.trim() || title.trim().length>200) throw new RangeError('Escribí un pendiente de hasta 200 caracteres.');
  return db.prepare('INSERT INTO pendientes(titulo) VALUES (?) RETURNING id, titulo, hecho').bind(title.trim()).first();
}
async function mark(db, id, done) {
  if(!Number.isSafeInteger(id) || id<1 || typeof done!=='boolean') throw new RangeError('ID o estado inválido.');
  const item=await db.prepare('UPDATE pendientes SET hecho=? WHERE id=? RETURNING id, titulo, hecho').bind(Number(done),id).first();
  if(!item) throw new RangeError('No encontré ese pendiente.');
  return item;
}
async function mcp(request, db) {
  const msg=await request.json();
  const reply=result=>json({jsonrpc:'2.0',id:msg.id??null,result});
  switch(msg.method) {
    case 'server/discover': return reply({supportedVersions:['2026-07-28'],capabilities:{tools:{}}});
    case 'initialize': return reply({protocolVersion:msg.params?.protocolVersion??'2026-07-28',capabilities:{tools:{}},serverInfo:{name:'Pendientes City Bell',version:'1.0.0'}});
    case 'notifications/initialized': return new Response(null,{status:202});
    case 'tools/list': return reply({tools:definitions});
    case 'tools/call': {
      const args=msg.params?.arguments??{};
      try {
        let result;
        switch(msg.params?.name) {
          case 'listar_pendientes': result=await list(db);break;
          case 'agregar_pendiente': result=await add(db,args.titulo);break;
          case 'marcar_pendiente': result=await mark(db,args.id,args.hecho);break;
          default: throw new RangeError('Herramienta desconocida.');
        }
        return reply({content:[{type:'text',text:JSON.stringify(result)}]});
      } catch(error) {
        return reply({isError:true,content:[{type:'text',text:error instanceof RangeError ? error.message : 'No se pudo acceder a la lista.'}]});
      }
    }
    default: return json({jsonrpc:'2.0',id:msg.id??null,error:{code:-32601,message:'Método desconocido'}});
  }
}
export default {
  async fetch(request, env) {
    const url=new URL(request.url);
    try {
      if(url.pathname==='/' && request.method==='GET') return new Response(page,{headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'}});
      if(url.pathname==='/mcp' && request.method==='POST') return await mcp(request,env.DB);
      if(url.pathname==='/api/pendientes'){
        if(request.method==='GET') return json(await list(env.DB));
        if(request.method==='POST'){
          if(request.headers.get('Origin')!==url.origin || !request.headers.get('Content-Type')?.startsWith('application/json')) return json({error:'Solicitud no permitida'},403);
          const item=await request.json();
          if(item.accion==='agregar') await add(env.DB,item.titulo);
          else if(item.accion==='marcar') await mark(env.DB,item.id,item.hecho);
          else return json({error:'Acción desconocida'},400);
          return json(await list(env.DB));
        }
      }
      return json({error:'Página no encontrada'},404);
    } catch(error) {
      if(error instanceof RangeError || error instanceof SyntaxError) return json({error:'Datos inválidos'},400);
      console.error(error);
      return json({error:'No se pudo acceder a la lista.'},500);
    }
  }
};
