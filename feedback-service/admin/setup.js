import {initDialogs,openDialog} from 'https://iam-ajmunna.github.io/Comic-Book/src/ui.js?v=20261014-2';
const $ = id=>document.getElementById(id);
const form=$('github-setup-form'), fields=$('github-setup-fields'), status=$('github-setup-status');
let pending=false,ready=false,version=null;
const dirty=()=>!form.hidden && Boolean($('github-client-id').value || $('github-client-secret').value);
initDialogs();
const back=document.querySelector('.site-nav a'),leave=$('setup-leave-dialog');
back.addEventListener('click',event=>{if(pending){event.preventDefault();status.textContent='Wait for the save to finish before leaving.';}else if(dirty()){event.preventDefault();openDialog(leave,back);leave.querySelector('[data-close]').focus();}});
$('leave-github-setup').addEventListener('click',()=>{$('github-client-id').value=$('github-client-secret').value='';location.assign('/admin');});
window.addEventListener('beforeunload',event=>{if(dirty()){event.preventDefault();event.returnValue='';}});
async function request(options={}) {
  const aborter=new AbortController(),timer=setTimeout(()=>aborter.abort(),20_000);
  try {
    const result=await fetch('/api/admin/github-setup',{credentials:'same-origin',cache:'no-store',...options,signal:aborter.signal});
    const data=await result.json();if(!result.ok){const error=new Error(data.error||'Setup could not be saved. Try again.');error.field=data.field;error.status=result.status;throw error;}return data;
  } catch(e) { if(e.name==='AbortError')throw new Error('The request took too long. Your entries are still here; try again.');if(e instanceof TypeError)throw new Error('Couldn’t reach the server. Check your connection and try again.');throw e; }
  finally {clearTimeout(timer);}
}
function busy(value){pending=value;fields.disabled=value||!ready;form.setAttribute('aria-busy',String(value));$('save-github-setup').disabled=$('show-github-secret').disabled=value||!ready;$('save-github-setup').textContent=value?'Saving…':'Save and enable GitHub sign-in';}
function clearErrors(){for(const id of ['id','secret']){$('github-'+id+'-error').hidden=true;$('github-client-'+id).setAttribute('aria-invalid','false');}}
$('show-github-secret').addEventListener('click',()=>{const shown=$('github-client-secret').type==='password';$('github-client-secret').type=shown?'text':'password';$('show-github-secret').textContent=shown?'Hide':'Show';$('show-github-secret').setAttribute('aria-label',shown?'Hide client secret':'Show client secret');$('show-github-secret').setAttribute('aria-pressed',String(shown));});
form.addEventListener('submit',async event=>{
  event.preventDefault();if(pending||!ready)return;clearErrors();
  const data={clientId:$('github-client-id').value.trim(),clientSecret:$('github-client-secret').value.trim(),version};
  const invalid=!/^[A-Za-z0-9_.-]{8,120}$/.test(data.clientId)?'clientId':!/^[A-Za-z0-9_.-]{20,256}$/.test(data.clientSecret)?'clientSecret':'';
  if(invalid){showError({field:invalid,message:invalid==='clientId'?'Enter the Client ID from your GitHub OAuth app.':'Enter the Client secret from your GitHub OAuth app.'});return;}
  busy(true);status.textContent='Saving the GitHub connection…';
  try {await request({method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(data)});$('github-client-secret').value='';form.hidden=true;$('github-setup-success').hidden=false;$('github-setup-success').querySelector('a').focus();}
  catch(e){showError(e);}
  finally {busy(false);}
});
function showError(e){
  status.textContent=e.message;
  if(e.field==='clientId'||e.field==='clientSecret'){const id=e.field==='clientId'?'id':'secret';$('github-'+id+'-error').textContent=e.message;$('github-'+id+'-error').hidden=false;$('github-client-'+id).setAttribute('aria-invalid','true');$('github-client-'+id).focus();}
  if(e.status===401){const link=document.createElement('a');link.href='/admin/github-setup';link.target='_top';link.textContent=' Sign in again';status.append(link);}
}
try {
  const data=await request();version=data.version;$('github-callback').textContent=data.callback;ready=true;busy(false);leave.querySelectorAll('button').forEach(node=>{node.disabled=false;});
  status.textContent=data.configured?'GitHub is configured. Saving new credentials replaces its connection.':'Ready for the credentials from your GitHub OAuth app.';
} catch(e){showError(e);}
