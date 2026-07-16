let volakoSync={client:null,user:null,household:null,version:0,channel:null,applying:false,timer:null,lastSync:null};

function syncConfig(){const embedded=window.VOLAKO_SYNC_CONFIG||{},saved=JSON.parse(localStorage.getItem('volakoSyncConfig')||'{}');return{url:embedded.url||saved.url||'',anonKey:embedded.anonKey||saved.anonKey||''}}
function syncMessage(text,error=false){const el=document.getElementById('syncMessage');el.textContent=text;el.classList.remove('hidden');el.classList.toggle('error',error);clearTimeout(el._timer);el._timer=setTimeout(()=>el.classList.add('hidden'),6000)}
function setSyncIndicator(state,title,subtitle){['syncDot','modalSyncDot'].forEach(id=>{const el=document.getElementById(id);if(el)el.className='sync-dot '+state});if(document.getElementById('syncTitle'))document.getElementById('syncTitle').textContent=title;if(document.getElementById('syncSubtitle'))document.getElementById('syncSubtitle').textContent=subtitle;if(document.getElementById('modalSyncTitle'))document.getElementById('modalSyncTitle').textContent=title;if(document.getElementById('modalSyncSubtitle'))document.getElementById('modalSyncSubtitle').textContent=subtitle}
function showSyncSection(id,show){document.getElementById(id)?.classList.toggle('hidden',!show)}

async function initVolakoSync(){
  const cfg=syncConfig();document.getElementById('syncUrl').value=cfg.url;document.getElementById('syncKey').value=cfg.anonKey;
  if(!cfg.url||!cfg.anonKey||!window.supabase?.createClient){setSyncIndicator('offline','Hors ligne uniquement','Configurez Supabase pour partager le foyer');renderSyncUI();return}
  try{
    volakoSync.client=window.supabase.createClient(cfg.url,cfg.anonKey,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    const{data:{session}}=await volakoSync.client.auth.getSession();volakoSync.user=session?.user||null;
    volakoSync.client.auth.onAuthStateChange((_event,session)=>{volakoSync.user=session?.user||null;setTimeout(()=>handleSyncAuth(),0)});
    await handleSyncAuth();
  }catch(e){setSyncIndicator('offline','Configuration incorrecte',e.message||'Connexion impossible');renderSyncUI()}
}
async function handleSyncAuth(){
  if(!volakoSync.user){volakoSync.household=null;setSyncIndicator(navigator.onLine?'offline':'offline','Non connecté','Connectez-vous pour synchroniser');renderSyncUI();return}
  setSyncIndicator('syncing','Connexion…',volakoSync.user.email||'Compte Volako');
  try{
    const{data:homes,error}=await volakoSync.client.from('volako_households').select('id,name,invite_code').order('created_at').limit(1);if(error)throw error;
    if(homes?.length){volakoSync.household=homes[0];if(localStorage.getItem('volakoSyncDirty')==='1'){const{data:w}=await volakoSync.client.from('volako_wallets').select('version').eq('household_id',volakoSync.household.id).single();volakoSync.version=Number(w?.version||0);await pushWallet(true)}else await pullWallet(true);subscribeWallet()}else setSyncIndicator('online','Compte connecté','Créez ou rejoignez un foyer');
  }catch(e){setSyncIndicator('offline','Base non configurée','Exécutez SUPABASE-SETUP.sql');console.warn(e)}renderSyncUI()
}
function renderSyncUI(){
  const configured=!!volakoSync.client,user=volakoSync.user,home=volakoSync.household;
  showSyncSection('syncConfigSection',!configured);showSyncSection('syncAuthSection',configured&&!user);showSyncSection('syncHouseholdSection',configured&&!!user);
  document.getElementById('currentHousehold')?.classList.toggle('hidden',!home);document.getElementById('householdSetup')?.classList.toggle('hidden',!!home);document.getElementById('householdActions')?.classList.toggle('hidden',!home);
  if(home){document.getElementById('householdName').textContent=home.name;document.getElementById('householdCode').textContent=home.invite_code;setSyncIndicator(navigator.onLine?'online':'offline',home.name,navigator.onLine?`Synchronisé${volakoSync.lastSync?' · '+volakoSync.lastSync:''}`:'Modifications en attente de connexion')}
}
function openSyncSettings(){openModal('syncModal');renderSyncUI()}
async function saveSyncConfig(){
  const url=document.getElementById('syncUrl').value.trim().replace(/\/$/,''),anonKey=document.getElementById('syncKey').value.trim();if(!/^https:\/\/.+\.supabase\.co$/.test(url)||anonKey.length<20)return syncMessage('Vérifiez l’URL et la clé publique Supabase.',true);
  localStorage.setItem('volakoSyncConfig',JSON.stringify({url,anonKey}));syncMessage('Configuration enregistrée. Connexion en cours…');await initVolakoSync();renderSyncUI()
}
async function syncSignUp(){
  const email=document.getElementById('syncEmail').value.trim(),password=document.getElementById('syncPassword').value;if(!email||password.length<6)return syncMessage('Saisissez un e-mail et un mot de passe de 6 caractères minimum.',true);
  const{data:result,error}=await volakoSync.client.auth.signUp({email,password,options:{emailRedirectTo:location.href.split('#')[0]}});if(error)return syncMessage(error.message,true);if(!result.session)syncMessage('Compte créé. Confirmez l’adresse e-mail, puis revenez vous connecter.');else syncMessage('Compte créé et connecté.')
}
async function syncSignIn(e){e.preventDefault();const email=document.getElementById('syncEmail').value.trim(),password=document.getElementById('syncPassword').value;const{error}=await volakoSync.client.auth.signInWithPassword({email,password});if(error)syncMessage(error.message,true);else syncMessage('Connexion réussie.')}
async function syncSignOut(){if(volakoSync.channel)await volakoSync.client.removeChannel(volakoSync.channel);await volakoSync.client.auth.signOut();volakoSync.household=null;volakoSync.version=0;syncMessage('Vous êtes déconnecté.');renderSyncUI()}

async function createHousehold(){
  const name=document.getElementById('newHouseholdName').value.trim();if(!name)return syncMessage('Donnez un nom au foyer.',true);setSyncIndicator('syncing','Création du foyer…','Veuillez patienter');
  const{data:rows,error}=await volakoSync.client.rpc('volako_create_household',{p_name:name});if(error)return syncMessage(error.message,true);volakoSync.household=rows[0];volakoSync.version=Number(rows[0].version||0);subscribeWallet();await pushWallet(true);renderSyncUI();syncMessage('Foyer créé. Partagez le code d’invitation avec le deuxième utilisateur.')
}
async function joinHousehold(){
  const code=document.getElementById('joinCode').value.trim().toUpperCase();if(!code)return syncMessage('Saisissez le code d’invitation.',true);if(!confirm('Les données de ce téléphone seront remplacées par celles du foyer partagé. Exportez une sauvegarde avant de continuer.'))return;
  const{data:rows,error}=await volakoSync.client.rpc('volako_join_household',{p_code:code});if(error)return syncMessage(error.message,true);volakoSync.household=rows[0];volakoSync.version=Number(rows[0].version||0);localStorage.removeItem('volakoSyncDirty');await pullWallet(true);subscribeWallet();renderSyncUI();syncMessage('Vous avez rejoint le foyer partagé.')
}
function copyInviteCode(){const code=volakoSync.household?.invite_code||'';navigator.clipboard?.writeText(code);syncMessage('Code d’invitation copié.')}
async function leaveHouseholdLocal(){if(confirm('Déconnecter ce téléphone du foyer ? Vos données locales resteront présentes.'))await syncSignOut()}

function walletPayload(){return{transactions:data.transactions,budgets:data.budgets,goals:data.goals,debts:data.debts,categories:data.categories,accounts:data.accounts,recurring:data.recurring,goalDeposits:data.goalDeposits||[],sharedSettings:{carryMode:data.settings?.carryMode||'carry'}}}
function applyWalletPayload(remote){
  if(!remote||!Object.keys(remote).length)return false;const localSettings=data.settings;['transactions','budgets','goals','debts','categories','accounts','recurring','goalDeposits'].forEach(k=>{if(Array.isArray(remote[k]))data[k]=remote[k]});data.settings={...localSettings,carryMode:remote.sharedSettings?.carryMode||localSettings.carryMode};volakoSync.applying=true;localStorage.setItem('volakoData',JSON.stringify(data));localStorage.removeItem('volakoSyncDirty');volakoSync.applying=false;renderAll();return true
}
async function pullWallet(initial=false){
  if(!volakoSync.client||!volakoSync.household||!navigator.onLine)return;setSyncIndicator('syncing','Réception des données…',volakoSync.household.name);
  const{data:wallet,error}=await volakoSync.client.from('volako_wallets').select('data,version,updated_at,updated_by').eq('household_id',volakoSync.household.id).single();if(error){syncMessage(error.message,true);return}volakoSync.version=Number(wallet.version||0);const hasRemote=applyWalletPayload(wallet.data);if(!hasRemote&&initial)await pushWallet(true);volakoSync.lastSync=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});renderSyncUI()
}
async function pushWallet(force=false){
  if(volakoSync.applying||!volakoSync.client||!volakoSync.user||!volakoSync.household||!navigator.onLine)return;clearTimeout(volakoSync.timer);setSyncIndicator('syncing','Synchronisation…',volakoSync.household.name);
  const{data:newVersion,error}=await volakoSync.client.rpc('volako_save_wallet',{p_household:volakoSync.household.id,p_data:walletPayload(),p_expected_version:volakoSync.version});if(error){setSyncIndicator('offline','Synchronisation en attente',error.message);return}if(Number(newVersion)===-1){await pullWallet();syncMessage('Des modifications plus récentes ont été reçues du deuxième appareil.')}else{volakoSync.version=Number(newVersion);localStorage.removeItem('volakoSyncDirty');volakoSync.lastSync=new Date().toLocaleTimeString('fr-FR',{hour:'2-digit',minute:'2-digit'});renderSyncUI()}
}
function scheduleWalletPush(){if(volakoSync.applying)return;localStorage.setItem('volakoSyncDirty','1');if(!volakoSync.household)return;clearTimeout(volakoSync.timer);volakoSync.timer=setTimeout(()=>pushWallet(),900)}
async function syncNow(){if(!navigator.onLine)return syncMessage('Aucune connexion Internet.',true);await pullWallet();syncMessage('Synchronisation terminée.')}
function subscribeWallet(){
  if(!volakoSync.client||!volakoSync.household)return;if(volakoSync.channel)volakoSync.client.removeChannel(volakoSync.channel);
  volakoSync.channel=volakoSync.client.channel('volako-'+volakoSync.household.id).on('postgres_changes',{event:'UPDATE',schema:'public',table:'volako_wallets',filter:`household_id=eq.${volakoSync.household.id}`},payload=>{const row=payload.new;if(row.updated_by!==volakoSync.user?.id&&Number(row.version)>volakoSync.version)pullWallet()}).subscribe()
}

const volakoOriginalPersist=persist;persist=function(){volakoOriginalPersist();scheduleWalletPush()};
window.addEventListener('online',()=>{renderSyncUI();if(volakoSync.household){if(localStorage.getItem('volakoSyncDirty')==='1')pushWallet(true);else pullWallet()}});window.addEventListener('offline',renderSyncUI);
initVolakoSync();
