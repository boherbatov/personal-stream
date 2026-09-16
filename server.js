'use strict';

const http = require('node:http');
const { readFile } = require('node:fs/promises');
const { extname, join, normalize } = require('node:path');
const { randomBytes } = require('node:crypto');

const PORT = Number(process.env.PORT || 3000);
const PUBLIC_DIR = join(__dirname, 'public');
const sessions = new Map();
const SESSION_TTL_MS = 24 * 60 * 60 * 1000;
const APP_ACCESS_KEY = process.env.APP_ACCESS_KEY || '';
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN || '';
const TELEGRAM_API_BASE = (process.env.TELEGRAM_BOT_API_BASE || 'https://api.telegram.org').replace(/\/$/, '');
const telegramState = { offset: 0, chats: new Map() };

const MIME = { '.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.svg':'image/svg+xml','.json':'application/json' };
function json(res,status,value,headers={}){res.writeHead(status,{'content-type':'application/json; charset=utf-8',...headers});res.end(JSON.stringify(value));}
function cookies(req){return Object.fromEntries((req.headers.cookie||'').split(';').filter(Boolean).map(part=>{const [key,...rest]=part.trim().split('=');return [key,decodeURIComponent(rest.join('='))];}));}
function getSession(req){const sid=cookies(req).stream_session;const session=sid&&sessions.get(sid);if(!session)return null;if(session.expiresAt<Date.now()){sessions.delete(sid);return null;}return session;}
async function bodyJson(req){let body='';for await(const chunk of req){body+=chunk;if(body.length>100_000)throw new Error('Request too large');}return JSON.parse(body||'{}');}
function telegramApi(method,query={}){if(!TELEGRAM_BOT_TOKEN)throw new Error('Telegram bot is not configured');return fetch(`${TELEGRAM_API_BASE}/bot${TELEGRAM_BOT_TOKEN}/${method}?${new URLSearchParams(query)}`);}
function telegramMedia(message){const media=message.video||message.document||message.animation;if(!media)return null;const mime=media.mime_type||(message.video?'video/mp4':'application/octet-stream');if(!mime.startsWith('video/'))return null;return{id:media.file_id,uniqueId:media.file_unique_id,title:media.file_name||message.caption||`Telegram ${message.message_id}`,mimeType:mime,size:Number(media.file_size||0),durationMs:Number(media.duration||0)*1000,width:media.width||null,height:media.height||null,modifiedTime:new Date(message.date*1000).toISOString(),source:'telegram'};}
async function syncTelegram(){if(!TELEGRAM_BOT_TOKEN)return;const response=await telegramApi('getUpdates',{offset:telegramState.offset,timeout:0,allowed_updates:JSON.stringify(['message','channel_post'])});if(!response.ok)throw new Error('Telegram update failed');const data=await response.json();for(const update of data.result||[]){telegramState.offset=Math.max(telegramState.offset,update.update_id+1);const message=update.message||update.channel_post;if(!message)continue;const chatId=String(message.chat.id);if(!telegramState.chats.has(chatId))telegramState.chats.set(chatId,{title:message.chat.title||message.chat.username||message.from?.first_name||chatId,items:new Map()});const item=telegramMedia(message);if(item)telegramState.chats.get(chatId).items.set(item.uniqueId,item);}}

async function api(req,res,url){
  if(req.method==='GET'&&url.pathname==='/api/config')return json(res,200,{accessRequired:Boolean(APP_ACCESS_KEY),telegram:{enabled:Boolean(TELEGRAM_BOT_TOKEN),mode:'bot',officialApi:TELEGRAM_API_BASE==='https://api.telegram.org'}});
  if(req.method==='GET'&&url.pathname==='/api/session')return json(res,200,{connected:!APP_ACCESS_KEY||Boolean(getSession(req))});
  if(req.method==='POST'&&url.pathname==='/api/session'){
    const {accessKey}=await bodyJson(req);if(APP_ACCESS_KEY&&accessKey!==APP_ACCESS_KEY)return json(res,401,{error:'wrong_access_key'});
    const sid=randomBytes(24).toString('base64url');sessions.set(sid,{expiresAt:Date.now()+SESSION_TTL_MS});
    return json(res,200,{ok:true},{'set-cookie':`stream_session=${sid}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${SESSION_TTL_MS/1000}${process.env.NODE_ENV==='production'?'; Secure':''}`});
  }
  if(req.method==='DELETE'&&url.pathname==='/api/session'){const sid=cookies(req).stream_session;if(sid)sessions.delete(sid);return json(res,200,{ok:true},{'set-cookie':'stream_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0'});}
  if(req.method==='GET'&&url.pathname==='/api/library'){
    if(APP_ACCESS_KEY&&!getSession(req))return json(res,401,{error:'not_connected'});if(!TELEGRAM_BOT_TOKEN)return json(res,503,{error:'telegram_not_configured'});await syncTelegram();
    const selected=url.searchParams.get('chatId');const chats=[...telegramState.chats].map(([id,chat])=>({id,title:chat.title,count:chat.items.size}));const items=selected&&telegramState.chats.get(selected)?[...telegramState.chats.get(selected).items.values()]:[];
    return json(res,200,{chats,selectedChatId:selected||null,items,officialApiLimitBytes:TELEGRAM_API_BASE==='https://api.telegram.org'?20_000_000:null});
  }
  const streamMatch=url.pathname.match(/^\/api\/stream\/telegram\/([A-Za-z0-9_-]+)$/);
  if(req.method==='GET'&&streamMatch){
    if(APP_ACCESS_KEY&&!getSession(req))return json(res,401,{error:'not_connected'});if(!TELEGRAM_BOT_TOKEN)return json(res,503,{error:'telegram_not_configured'});
    const fileResponse=await telegramApi('getFile',{file_id:streamMatch[1]});if(!fileResponse.ok)return json(res,502,{error:'telegram_file_error'});const fileData=await fileResponse.json();if(!fileData.ok||!fileData.result?.file_path)return json(res,404,{error:'telegram_file_missing'});
    const upstream=await fetch(`${TELEGRAM_API_BASE}/file/bot${TELEGRAM_BOT_TOKEN}/${fileData.result.file_path}`,{headers:req.headers.range?{range:req.headers.range}:{}});if(!upstream.ok&&upstream.status!==206)return json(res,upstream.status,{error:'telegram_stream_error'});
    const pass={'cache-control':'private, no-store'};for(const key of ['content-type','content-length','content-range','accept-ranges']){const value=upstream.headers.get(key);if(value)pass[key]=value;}res.writeHead(upstream.status,pass);if(upstream.body)for await(const chunk of upstream.body)res.write(chunk);return res.end();
  }
  if(url.pathname.startsWith('/api/'))return json(res,404,{error:'not_found'});return false;
}
async function staticFile(req,res,pathname){const relative=pathname==='/'?'index.html':pathname.slice(1);const safe=normalize(relative).replace(/^(\.\.(\/|\\|$))+/,'');const file=join(PUBLIC_DIR,safe);if(!file.startsWith(PUBLIC_DIR))return json(res,403,{error:'forbidden'});try{const content=await readFile(file);res.writeHead(200,{'content-type':MIME[extname(file)]||'application/octet-stream','cache-control':'no-cache'});res.end(content);}catch{json(res,404,{error:'not_found'});}}
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,`http://${req.headers.host||'localhost'}`);const handled=await api(req,res,url);if(handled===false)await staticFile(req,res,url.pathname);}catch(error){console.error(error);if(!res.headersSent)json(res,500,{error:'server_error'});else res.end();}});
if(require.main===module)server.listen(PORT,()=>console.log(`Personal Stream: http://localhost:${PORT}`));
module.exports={server,cookies};
