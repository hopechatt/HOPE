import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_UID } from './config';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const LOGO = 'https://media.base44.com/images/public/6a276d56de2d596e49ec189a/ec3567149_IMG_1097.jpeg';
const CHATT_LAT = 35.0456;
const CHATT_LNG = -85.3097;
const pink  = '#A2135D';
const pink2 = '#E0358D';
const dark  = '#121212';
const cardBg = '#1E1E1E';
const cardLight = '#2a2a2a';

const btn = (bg=`linear-gradient(135deg,${pink},${pink2})`,color='#fff') => ({
  background:bg,color,border:'none',borderRadius:'14px',padding:'15px',
  fontWeight:'800',fontSize:'16px',cursor:'pointer',width:'100%',letterSpacing:'0.3px'
});
const ghostBtn = {background:cardLight,color:'#ccc',border:'1px solid #333',
  borderRadius:'12px',padding:'12px 16px',fontWeight:'600',fontSize:'14px',cursor:'pointer'};
const pill=(active)=>({
  background:active?`linear-gradient(135deg,${pink},${pink2})`:'#2a2a2a',
  color:active?'#fff':'#888',border:'none',borderRadius:'20px',padding:'8px 18px',
  fontWeight:'700',fontSize:'13px',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0
});
const inp={background:'#2a2a2a',border:'1px solid #333',borderRadius:'12px',
  padding:'14px 16px',color:'#fff',fontSize:'15px',width:'100%',boxSizing:'border-box',outline:'none'};
const row={display:'flex',flexDirection:'row',alignItems:'center'};

function isAfterHours(){
  const h=new Date().getHours();
  return h>=17&&h<20; // 5pm-8pm
}

function calcFare(distMi=2.8,durMin=8,hasPet=false,extraStops=0,undeclaredPets=0){
  const afterHours=isAfterHours();
  const base      = afterHours ? 10.00 : 8.00;
  const perMile   = afterHours ? 1.75  : 1.50;
  const perMin    = afterHours ? 0.50  : 0.30;
  const dist      = distMi * perMile;
  const dur       = durMin * perMin;
  const pet       = hasPet ? 5.00 : 0;          // declared pet fee
  const undecPet  = undeclaredPets * 10.00;      // undeclared pet penalty
  // Up to 2 stops: $0.50 per stop + 5 min wait included, then $0.25/min extra
  const stopCount = Math.min(extraStops, 2);
  const stopBase  = stopCount * 0.50;
  const total     = base + dist + dur + pet + undecPet + stopBase;
  return {
    base:       base.toFixed(2),
    dist:       dist.toFixed(2),
    dur:        dur.toFixed(2),
    pet:        pet.toFixed(2),
    undecPet:   undecPet.toFixed(2),
    stops:      stopBase.toFixed(2),
    total:      total.toFixed(2),
    distMi:     distMi.toFixed(1),
    durMin:     Math.round(durMin),
    afterHours,
    perMile,
    perMin,
  };
}

async function geocodeAddress(addr){
  try{
    const q=encodeURIComponent(addr+', Chattanooga, TN');
    const r=await fetch(`https://nominatim.openstreetmap.org/search?q=${q}&format=json&limit=1`);
    const d=await r.json();
    if(d[0]) return {lat:parseFloat(d[0].lat),lng:parseFloat(d[0].lon)};
  }catch(e){}
  return null;
}

async function getRoute(pc,dc){
  try{
    const r=await fetch(`https://router.project-osrm.org/route/v1/driving/${pc.lng},${pc.lat};${dc.lng},${dc.lat}?overview=full&geometries=geojson`);
    const d=await r.json();
    if(d.routes?.[0]) return {distMi:d.routes[0].distance/1609.34,durMin:d.routes[0].duration/60,geometry:d.routes[0].geometry.coordinates};
  }catch(e){}
  return null;
}

function LiveMap({pickupCoord,dropoffCoord,routeCoords,userCoord,height='100%'}){
  const mapRef=useRef(null);
  const leafRef=useRef(null);
  const layersRef=useRef({});
  useEffect(()=>{
    if(leafRef.current) return;
    if(!document.getElementById('leaflet-css')){
      const l=document.createElement('link');l.id='leaflet-css';l.rel='stylesheet';
      l.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';document.head.appendChild(l);
    }
    const init=()=>{
      if(!mapRef.current||!window.L) return;
      const map=window.L.map(mapRef.current,{zoomControl:false}).setView([CHATT_LAT,CHATT_LNG],13);
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
      window.L.control.zoom({position:'topright'}).addTo(map);
      leafRef.current=map;
    };
    if(window.L){init();return;}
    const s=document.createElement('script');s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';s.onload=init;document.head.appendChild(s);
  },[]);
  useEffect(()=>{
    const L=window.L,map=leafRef.current;
    if(!L||!map) return;
    Object.values(layersRef.current).forEach(l=>map.removeLayer(l));layersRef.current={};
    const icon=(c)=>L.divIcon({className:'',html:`<div style="background:${c};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,iconSize:[14,14],iconAnchor:[7,7]});
    if(userCoord) layersRef.current.user=L.marker([userCoord.lat,userCoord.lng],{icon:icon('#4caf50')}).addTo(map);
    if(pickupCoord) layersRef.current.pickup=L.marker([pickupCoord.lat,pickupCoord.lng],{icon:icon('#4caf50')}).bindPopup('Pickup').addTo(map);
    if(dropoffCoord) layersRef.current.dropoff=L.marker([dropoffCoord.lat,dropoffCoord.lng],{icon:icon(pink)}).bindPopup('Dropoff').addTo(map);
    if(routeCoords?.length){
      const ll=routeCoords.map(([lng,lat])=>[lat,lng]);
      layersRef.current.route=L.polyline(ll,{color:pink2,weight:4,opacity:0.85}).addTo(map);
      map.fitBounds(layersRef.current.route.getBounds(),{padding:[40,40]});
    } else if(pickupCoord&&dropoffCoord){
      map.fitBounds([[pickupCoord.lat,pickupCoord.lng],[dropoffCoord.lat,dropoffCoord.lng]],{padding:[40,40]});
    } else if(userCoord) map.setView([userCoord.lat,userCoord.lng],14);
  },[pickupCoord,dropoffCoord,routeCoords,userCoord]);
  return <div ref={mapRef} style={{width:'100%',height,borderRadius:'inherit'}}/>;
}

export default function App(){
  const [session,setSession]=useState(null);
  const [profile,setProfile]=useState(null);
  const [view,setView]=useState('splash');
  const [authMode,setAuthMode]=useState('login');
  const [loading,setLoading]=useState(false);
  const [msg,setMsg]=useState('');
  const [email,setEmail]=useState('');
  const [pass,setPass]=useState('');
  const [name,setName]=useState('');
  const [phone,setPhone]=useState('');
  const [agreed,setAgreed]=useState(false);

  // rider
  const [rTab,setRTab]=useState('home');
  const [pickup,setPickup]=useState('');
  const [dropoff,setDropoff]=useState('');
  const [stops,setStops]=useState([]);
  const [hasPet,setHasPet]=useState(false);
  const [history,setHistory]=useState([]);
  const [activeRide,setActiveRide]=useState(null);
  const [safety,setSafety]=useState(false);
  const [sheet,setSheet]=useState(false);
  const [idFile,setIdFile]=useState(null);
  const [idUploading,setIdUploading]=useState(false);

  // map
  const [userCoord,setUserCoord]=useState(null);
  const [pickupCoord,setPickupCoord]=useState(null);
  const [dropoffCoord,setDropoffCoord]=useState(null);
  const [routeCoords,setRouteCoords]=useState(null);
  const [routeInfo,setRouteInfo]=useState(null);
  const [routeLoading,setRouteLoading]=useState(false);

  // driver
  const [dTab,setDTab]=useState('requests');
  const [pending,setPending]=useState([]);
  const [allRides,setAllRides]=useState([]);
  const [stats,setStats]=useState({pending:0,today:0,completed:0,earnings:0,weekEarnings:0,weekTrips:0,hoursOnline:0});
  const [online,setOnline]=useState(false);
  const [onlineStart,setOnlineStart]=useState(null);
  const [unverifiedRiders,setUnverified]=useState([]);
  const [notifPerm,setNotifPerm]=useState('default');
  const [sidebarOpen,setSidebarOpen]=useState(false);

  const timer=useRef(null);
  const prevPendingCount=useRef(0);

  useEffect(()=>{
    navigator.geolocation?.getCurrentPosition(
      p=>setUserCoord({lat:p.coords.latitude,lng:p.coords.longitude}),
      ()=>setUserCoord({lat:CHATT_LAT,lng:CHATT_LNG})
    )||setUserCoord({lat:CHATT_LAT,lng:CHATT_LNG});
  },[]);

  useEffect(()=>{
    if('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(()=>{});
    if('Notification' in window) setNotifPerm(Notification.permission);
  },[]);

  async function requestNotifPermission(){
    if(!('Notification' in window)) return;
    const p=await Notification.requestPermission();setNotifPerm(p);return p==='granted';
  }
  function sendLocalNotif(title,body){
    if(Notification.permission==='granted') new Notification(title,{body,icon:LOGO});
  }

  useEffect(()=>{
    if(!pickup||!dropoff){setPickupCoord(null);setDropoffCoord(null);setRouteCoords(null);setRouteInfo(null);return;}
    const t=setTimeout(async()=>{
      setRouteLoading(true);
      const [pc,dc]=await Promise.all([geocodeAddress(pickup),geocodeAddress(dropoff)]);
      if(pc) setPickupCoord(pc);if(dc) setDropoffCoord(dc);
      if(pc&&dc){const route=await getRoute(pc,dc);if(route){setRouteCoords(route.geometry);setRouteInfo({distMi:route.distMi,durMin:route.durMin});}}
      setRouteLoading(false);
    },800);
    return()=>clearTimeout(t);
  },[pickup,dropoff]);

  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{if(data.session) initSession(data.session);else setView('splash');});
    const {data:L}=supabase.auth.onAuthStateChange((_,s)=>{if(s) initSession(s);else{setSession(null);setView('splash');}});
    return()=>L.subscription.unsubscribe();
  },[]);

  async function initSession(s){
    setSession(s);
    let{data:p}=await supabase.from('profiles').select('*').eq('id',s.user.id).single();
    if(!p){
      await supabase.from('profiles').insert({id:s.user.id,full_name:s.user.user_metadata?.full_name||'',phone:s.user.user_metadata?.phone||'',role:s.user.id===ADMIN_UID?'driver':'rider',agreed_to_conduct:false,is_verified:false});
      const r=await supabase.from('profiles').select('*').eq('id',s.user.id).single();p=r.data;
    }
    setProfile(p);
    if(s.user.id===ADMIN_UID){setView('driver');startPoll();}
    else if(!p?.agreed_to_conduct) setView('conduct');
    else setView('rider');
  }

  function startPoll(){fetchPending();fetchStats();fetchUnverified();fetchAllRides();timer.current=setInterval(()=>{fetchPending();fetchStats();fetchUnverified();},8000);}
  useEffect(()=>()=>clearInterval(timer.current),[]);

  async function fetchPending(){
    const{data}=await supabase.from('rides').select('*').in('status',['pending','accepted']).order('created_at',{ascending:false});
    const nd=data||[];
    if(nd.filter(r=>r.status==='pending').length>prevPendingCount.current) sendLocalNotif('New Ride Request!','A rider is waiting — open the app to accept.');
    prevPendingCount.current=nd.filter(r=>r.status==='pending').length;
    setPending(nd);
  }
  async function fetchAllRides(){
    const{data}=await supabase.from('rides').select('*').order('created_at',{ascending:false}).limit(50);
    setAllRides(data||[]);
  }
  async function fetchStats(){
    const t=new Date();t.setHours(0,0,0,0);
    const w=new Date();w.setDate(w.getDate()-7);
    const{data:today}=await supabase.from('rides').select('*').gte('created_at',t.toISOString());
    const{data:week}=await supabase.from('rides').select('*').gte('created_at',w.toISOString()).eq('status','completed');
    const td=today||[];const wk=week||[];
    const hoursOnline=onlineStart?((Date.now()-onlineStart)/3600000).toFixed(1):0;
    setStats({
      pending:td.filter(r=>r.status==='pending').length,
      today:td.filter(r=>r.status!=='cancelled').length,
      completed:td.filter(r=>r.status==='completed').length,
      earnings:td.filter(r=>r.status==='completed').reduce((s,r)=>s+(r.fare_total||0),0),
      weekEarnings:wk.reduce((s,r)=>s+(r.fare_total||0),0),
      weekTrips:wk.length,
      hoursOnline,
    });
  }
  async function fetchUnverified(){
    const{data}=await supabase.from('profiles').select('*').eq('role','rider').eq('is_verified',false).not('id_photo_url','is',null);
    setUnverified(data||[]);
  }
  async function fetchHistory(){if(!session) return;const{data}=await supabase.from('rides').select('*').eq('rider_id',session.user.id).order('created_at',{ascending:false});setHistory(data||[]);}
  async function fetchActive(){if(!session) return;const{data}=await supabase.from('rides').select('*').eq('rider_id',session.user.id).in('status',['pending','accepted','en_route']).maybeSingle();setActiveRide(data);}
  useEffect(()=>{if(view==='rider'){fetchHistory();fetchActive();};},[view]);

  async function handleSignUp(e){
    e.preventDefault();if(!agreed){setMsg('Please agree to the terms.');return;}
    setLoading(true);setMsg('');
    const{error}=await supabase.auth.signUp({email,password:pass,options:{data:{full_name:name,phone},emailRedirectTo:'https://hope-rideshare.netlify.app'}});
    setLoading(false);if(error) setMsg(error.message);else setMsg('Check your email to confirm your account!');
  }
  async function handleLogin(e){
    e.preventDefault();setLoading(true);setMsg('');
    const{error}=await supabase.auth.signInWithPassword({email,password:pass});
    setLoading(false);if(error) setMsg(error.message);
  }
  async function signOut(){clearInterval(timer.current);await supabase.auth.signOut();setView('splash');setProfile(null);setSession(null);setOnline(false);}
  async function agreeConduct(){await supabase.from('profiles').update({agreed_to_conduct:true}).eq('id',session.user.id);setView('rider');}

  async function uploadIdPhoto(){
    if(!idFile||!session) return;setIdUploading(true);
    const ext=idFile.name.split('.').pop();const path=`id-photos/${session.user.id}.${ext}`;
    const{data,error}=await supabase.storage.from('id-photos').upload(path,idFile,{upsert:true});
    if(!error){
      const{data:u}=supabase.storage.from('id-photos').getPublicUrl(path);
      await supabase.from('profiles').update({id_photo_url:u.publicUrl}).eq('id',session.user.id);
      setProfile(p=>({...p,id_photo_url:u.publicUrl}));setMsg('ID submitted! Awaiting approval.');
    } else setMsg('Upload failed. Please try again.');
    setIdUploading(false);setIdFile(null);
  }

  async function verifyRider(riderId,approve){
    await supabase.from('profiles').update({is_verified:approve}).eq('id',riderId);
    fetchUnverified();sendLocalNotif(approve?'Rider Approved':'Rider Rejected',approve?'Rider can now book rides.':'Rider has been rejected.');
  }

  const fare=calcFare(routeInfo?.distMi||2.8,routeInfo?.durMin||8,hasPet,stops.filter(Boolean).length);

  async function requestRide(){
    if(!pickup||!dropoff){setMsg('Enter pickup and dropoff.');return;}
    if(!profile?.is_verified&&session?.user?.id!==ADMIN_UID){setMsg('Upload your ID first.');setRTab('profile');return;}
    setLoading(true);
    try{
      const res=await fetch('/.netlify/functions/create-stripe-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountInCents:Math.round(parseFloat(fare.total)*100),riderEmail:session.user.email,pickupAddress:pickup,dropoffAddress:dropoff})});
      const d=await res.json();if(d?.url){window.location.href=d.url;return;}
    }catch(e){}
    await supabase.from('rides').insert({rider_id:session.user.id,rider_name:profile?.full_name||'Rider',rider_phone:profile?.phone||'',pickup_address:pickup,dropoff_address:dropoff,stops:stops.filter(Boolean),has_pet:hasPet,fare_total:parseFloat(fare.total),status:'pending'});
    setMsg('Ride requested! Driver will confirm shortly.');setLoading(false);setSheet(false);fetchActive();
  }
  async function updateStatus(id,status){await supabase.from('rides').update({status}).eq('id',id);fetchPending();fetchStats();fetchAllRides();}

  function triggerSOS(){
    navigator.geolocation?.getCurrentPosition(p=>{
      const t=encodeURIComponent(`SOS! Hope Rideshare rider ${profile?.full_name||''}. GPS: https://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}`);
      window.open(`sms:911?body=${t}`);
    },()=>window.open('tel:911'))||window.open('tel:911');
  }

  function toggleOnline(){
    const newState=!online;setOnline(newState);
    if(newState) setOnlineStart(Date.now());else setOnlineStart(null);
  }

  /* ── SPLASH ── */
  if(view==='splash') return(
    <div style={{minHeight:'100vh',background:dark,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',backgroundImage:`linear-gradient(rgba(18,18,18,0.7),rgba(18,18,18,0.95)),url(${LOGO})`,backgroundSize:'cover',backgroundPosition:'center',padding:'32px 24px',fontFamily:'system-ui,sans-serif'}}>
      <img src={LOGO} alt="Hope" style={{width:'180px',borderRadius:'24px',marginBottom:'24px',boxShadow:`0 12px 40px rgba(162,19,93,0.5)`}}/>
      <h1 style={{color:'#fff',margin:'0 0 8px',fontSize:'34px',fontWeight:'900',letterSpacing:'-0.5px'}}>Hope Rideshare</h1>
      <p style={{color:'#aaa',margin:'0 0 48px',fontSize:'15px',textAlign:'center'}}>Chattanooga's Women-Only Rideshare</p>
      <div style={{display:'flex',flexDirection:'column',gap:'14px',width:'100%',maxWidth:'340px'}}>
        <button style={btn()} onClick={()=>{setAuthMode('login');setView('auth');}}>Log In</button>
        <button style={btn('#2a2a2a','#fff')} onClick={()=>{setAuthMode('register');setView('auth');}}>Create Account</button>
      </div>
    </div>
  );

  /* ── AUTH ── */
  if(view==='auth') return(
    <div style={{minHeight:'100vh',backgroundImage:`linear-gradient(rgba(18,18,18,0.88),rgba(18,18,18,0.97)),url(${LOGO})`,backgroundSize:'cover',backgroundPosition:'center',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'24px',fontFamily:'system-ui,sans-serif'}}>
      <img src={LOGO} alt="Hope" style={{width:'100px',borderRadius:'16px',marginBottom:'20px'}}/>
      <h2 style={{color:'#fff',margin:'0 0 6px',fontSize:'24px',fontWeight:'900'}}>Welcome Back</h2>
      <p style={{color:'#888',fontSize:'13px',marginBottom:'28px'}}>Chattanooga's Trusted Rides for Women</p>
      <div style={{display:'flex',gap:'8px',marginBottom:'24px'}}>
        <button style={pill(authMode==='login')} onClick={()=>setAuthMode('login')}>Log In</button>
        <button style={pill(authMode==='register')} onClick={()=>setAuthMode('register')}>Create Account</button>
      </div>
      <form onSubmit={authMode==='login'?handleLogin:handleSignUp} style={{display:'flex',flexDirection:'column',gap:'12px',width:'100%',maxWidth:'380px'}}>
        {authMode==='register'&&<><input style={inp} placeholder="Full Name" value={name} onChange={e=>setName(e.target.value)} required/><input style={inp} type="tel" placeholder="Phone Number" value={phone} onChange={e=>setPhone(e.target.value)}/></>}
        <input style={inp} type="email" placeholder="Email" required value={email} onChange={e=>setEmail(e.target.value)}/>
        <input style={inp} type="password" placeholder="Password" required value={pass} onChange={e=>setPass(e.target.value)}/>
        {authMode==='register'&&(<label style={{...row,gap:'10px',color:'#ccc',fontSize:'13px',cursor:'pointer'}}><input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{width:'18px',height:'18px',accentColor:pink}}/>I agree to the Code of Conduct & Privacy Policy</label>)}
        {msg&&<p style={{color:msg.startsWith('Check')?'#4caf50':'#f06292',fontSize:'13px',margin:0,textAlign:'center'}}>{msg}</p>}
        <button type="submit" disabled={loading||(authMode==='register'&&!agreed)} style={{...btn(),opacity:(authMode==='register'&&!agreed)?0.4:1}}>{loading?'...':(authMode==='login'?'Log In':'Create Account')}</button>
      </form>
      <button onClick={()=>setView('splash')} style={{marginTop:'20px',background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'13px'}}>Back</button>
    </div>
  );

  /* ── CODE OF CONDUCT ── */
  if(view==='conduct') return(
    <div style={{minHeight:'100vh',background:dark,padding:'24px',fontFamily:'system-ui,sans-serif'}}>
      <div style={{maxWidth:'480px',margin:'0 auto',display:'flex',flexDirection:'column',gap:'16px'}}>
        <div style={{textAlign:'center',paddingTop:'20px'}}>
          <img src={LOGO} alt="Hope" style={{width:'80px',borderRadius:'12px'}}/>
          <h2 style={{color:'#fff',margin:'14px 0 4px',fontSize:'22px',fontWeight:'900'}}>Rider Code of Conduct</h2>
        </div>
        <div style={{background:cardBg,borderRadius:'16px',padding:'16px',display:'flex',flexDirection:'column',gap:'14px',maxHeight:'52vh',overflowY:'auto'}}>
          {[['Women & Children Only (P5)','You agree to only transport female passengers and children. This is a strict policy with zero exceptions.'],
            ['Right to Cancel Men','You have the absolute right and obligation to cancel any ride immediately, without penalty, if a male passenger over age 18 attempts to enter your vehicle. Report the incident through the app immediately.'],
            ['ID Verification','Submit a government-issued photo ID for manual verification before booking is unlocked. No account sharing permitted.'],
            ['Respectful Behavior','No harassment, profanity, or aggression toward the driver or other passengers at any time.'],
            ['Child Safety Seats','You are not required to provide car seats. The adult guardian accompanying a small child must properly install and secure the child's car seat before the vehicle moves.'],
            ['Zero Tolerance — Drugs & Alcohol','Hope enforces a zero-tolerance policy regarding the use of drugs or alcohol while operating the vehicle or riding as a passenger.'],
            ['Zero Tolerance — Smoking','No smoking, vaping, or open alcohol/drug containers in the vehicle at any time.'],
            ['Right to Refuse','The driver may cancel any ride at any time if she feels unsafe. Cancelled fares due to policy violations are non-refundable.'],
            ['Privacy','We collect name, email, phone, and GPS (active trips only). We never sell your data to third parties.']].map(([t,d])=>(
            <div key={t}><p style={{margin:'0 0 3px',fontWeight:'700',color:pink2,fontSize:'13px'}}>{t}</p><p style={{margin:0,color:'#bbb',fontSize:'13px',lineHeight:'1.5'}}>{d}</p></div>
          ))}
        </div>
        <label style={{...row,gap:'12px',color:'#ddd',fontSize:'14px',cursor:'pointer'}}>
          <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{width:'20px',height:'20px',accentColor:pink,flexShrink:0}}/>
          I have read and agree to the Code of Conduct
        </label>
        <button style={{...btn(),opacity:agreed?1:0.4}} disabled={!agreed} onClick={agreeConduct}>Continue to Hope Rideshare</button>
        <button onClick={signOut} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'13px',textAlign:'center'}}>Sign Out</button>
      </div>
    </div>
  );

  /* ── SAFETY HUB ── */
  if(safety) return(
    <div style={{minHeight:'100vh',background:'#0a0a0a',padding:'24px',fontFamily:'system-ui,sans-serif'}}>
      <div style={{maxWidth:'480px',margin:'0 auto',display:'flex',flexDirection:'column',gap:'14px'}}>
        <div style={{...row,justifyContent:'space-between'}}>
          <h2 style={{color:'#fff',margin:0,fontSize:'22px',fontWeight:'900'}}>Safety Hub</h2>
          <button onClick={()=>setSafety(false)} style={{...ghostBtn,padding:'8px 16px'}}>Close</button>
        </div>
        <button onClick={triggerSOS} style={{background:'#c62828',color:'#fff',border:'none',borderRadius:'16px',padding:'22px',fontWeight:'900',fontSize:'20px',cursor:'pointer',boxShadow:'0 6px 24px rgba(198,40,40,0.6)'}}>SOS — Emergency Alert</button>
        <div style={{background:cardBg,borderRadius:'16px',padding:'16px'}}>
          <p style={{margin:'0 0 10px',fontWeight:'700',color:pink2}}>Share My Trip</p>
          <button style={btn('#2a2a2a','#ddd')} onClick={()=>{const t=encodeURIComponent('I am on a Hope Rideshare trip: https://hope-rideshare.netlify.app');window.open(`sms:?body=${t}`);}}>Share Trip via SMS</button>
        </div>
        {activeRide&&(
          <div style={{background:cardBg,borderRadius:'16px',padding:'16px',border:`1px solid ${pink}`}}>
            <p style={{margin:'0 0 8px',fontWeight:'700',color:pink2}}>Active Ride</p>
            <p style={{margin:'0 0 2px',color:'#ccc',fontSize:'13px'}}>{activeRide.pickup_address}</p>
            <p style={{margin:'0 0 12px',color:'#ccc',fontSize:'13px'}}>{activeRide.dropoff_address}</p>
          </div>
        )}
        <div style={{background:cardBg,borderRadius:'16px',padding:'16px'}}>
          <p style={{margin:'0 0 10px',fontWeight:'700',color:pink2}}>Safety Tips</p>
          {['Verify driver photo matches app','Seatbelt on at all times','Trust your instincts — cancel anytime','Note car make, model & plate'].map(t=>(
            <p key={t} style={{margin:'0 0 6px',color:'#bbb',fontSize:'13px'}}>✓ {t}</p>
          ))}
        </div>
      </div>
    </div>
  );

  /* ── RIDER ── */
  if(view==='rider'){
    const firstName=profile?.full_name?.split(' ')[0]||'there';
    const isVerified=profile?.is_verified;
    const hasIdPending=profile?.id_photo_url&&!isVerified;
    return(
      <div style={{minHeight:'100vh',background:dark,fontFamily:'system-ui,sans-serif',position:'relative',overflow:'hidden',height:'100vh'}}>
        <div style={{position:'absolute',top:0,left:0,right:0,zIndex:20,padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',background:'linear-gradient(to bottom,rgba(0,0,0,0.8),transparent)'}}>
          <div style={{...row,gap:'10px'}}>
            <img src={LOGO} alt="Hope" style={{width:'36px',height:'36px',borderRadius:'8px',objectFit:'cover'}}/>
            <span style={{color:'#fff',fontWeight:'800',fontSize:'15px'}}>Hope</span>
          </div>
          <div style={{...row,gap:'8px'}}>
            {!isVerified&&<div style={{background:'rgba(255,152,0,0.2)',border:'1px solid #ff9800',borderRadius:'20px',padding:'5px 10px'}}><span style={{color:'#ff9800',fontSize:'11px',fontWeight:'700'}}>PENDING</span></div>}
            <button onClick={()=>setSafety(true)} style={{background:'rgba(162,19,93,0.9)',border:'none',color:'#fff',borderRadius:'20px',padding:'7px 14px',fontWeight:'700',fontSize:'13px',cursor:'pointer'}}>Safety</button>
            <button onClick={signOut} style={{background:'rgba(0,0,0,0.6)',border:'1px solid #333',color:'#aaa',borderRadius:'20px',padding:'7px 12px',fontSize:'12px',cursor:'pointer'}}>Out</button>
          </div>
        </div>
        <div style={{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:0}}>
          <LiveMap pickupCoord={pickupCoord} dropoffCoord={dropoffCoord} routeCoords={routeCoords} userCoord={userCoord} height="100%"/>
        </div>
        {activeRide&&(
          <div style={{position:'absolute',top:'70px',left:'16px',right:'16px',zIndex:15,background:'rgba(162,19,93,0.93)',borderRadius:'16px',padding:'14px 16px',backdropFilter:'blur(8px)'}}>
            <div style={{...row,justifyContent:'space-between',marginBottom:'6px'}}>
              <p style={{margin:0,fontWeight:'800',color:'#fff',fontSize:'15px'}}>Ride in Progress</p>
              <button onClick={()=>setSafety(true)} style={{background:'#c62828',border:'none',color:'#fff',borderRadius:'8px',padding:'4px 10px',fontSize:'12px',cursor:'pointer',fontWeight:'700'}}>SOS</button>
            </div>
            <p style={{margin:'0 0 2px',fontSize:'13px',color:'rgba(255,255,255,0.85)'}}>Status: <strong>{activeRide.status.replace('_',' ').toUpperCase()}</strong></p>
            <p style={{margin:0,fontSize:'12px',color:'rgba(255,255,255,0.7)'}}>{activeRide.pickup_address} → {activeRide.dropoff_address}</p>
          </div>
        )}
        {routeLoading&&<div style={{position:'absolute',top:'70px',left:'50%',transform:'translateX(-50%)',zIndex:15,background:'rgba(0,0,0,0.8)',borderRadius:'20px',padding:'8px 16px'}}><p style={{margin:0,color:pink2,fontSize:'13px',fontWeight:'700'}}>Finding route...</p></div>}
        <div style={{position:'absolute',bottom:0,left:0,right:0,zIndex:10,background:dark,borderRadius:'24px 24px 0 0',boxShadow:'0 -4px 32px rgba(0,0,0,0.8)',transition:'max-height 0.35s cubic-bezier(0.4,0,0.2,1)',maxHeight:sheet?'92vh':'230px',overflow:sheet?'auto':'hidden'}}>
          <div style={{width:'40px',height:'4px',background:'#333',borderRadius:'2px',margin:'12px auto 0',cursor:'pointer'}} onClick={()=>setSheet(!sheet)}/>
          {!sheet&&(
            <div style={{padding:'16px 20px 28px'}}>
              <p style={{margin:'0 0 14px',color:'#fff',fontWeight:'900',fontSize:'22px'}}>Hello, {firstName}</p>
              <button onClick={()=>{setSheet(true);setRTab('book');}} style={{...row,gap:'12px',background:'#fff',borderRadius:'14px',padding:'16px 18px',border:'none',cursor:'pointer',width:'100%',marginBottom:'14px'}}>
                <div style={{width:'10px',height:'10px',borderRadius:'50%',background:pink,flexShrink:0}}/>
                <span style={{color:'#333',fontWeight:'700',fontSize:'16px',flex:1,textAlign:'left'}}>Where to?</span>
                <span style={{background:`linear-gradient(135deg,${pink},${pink2})`,color:'#fff',borderRadius:'8px',padding:'4px 10px',fontSize:'12px',fontWeight:'700'}}>Now</span>
              </button>
              <div style={{display:'flex',gap:'10px'}}>
                <button onClick={()=>{setDropoff('Home');setSheet(true);setRTab('book');}} style={{...ghostBtn,flex:1,textAlign:'center'}}>Home</button>
                <button onClick={()=>{setDropoff('Work');setSheet(true);setRTab('book');}} style={{...ghostBtn,flex:1,textAlign:'center'}}>Work</button>
              </div>
            </div>
          )}
          {sheet&&(
            <div style={{paddingBottom:'32px'}}>
              <div style={{...row,gap:'8px',padding:'14px 16px 10px',overflowX:'auto',borderBottom:'1px solid #1a1a1a'}}>
                {[['home','Home'],['book','Book'],['schedule','Schedule'],['history','History'],['profile','Profile']].map(([t,l])=>(
                  <button key={t} style={pill(rTab===t)} onClick={()=>setRTab(t)}>{l}</button>
                ))}
                <button onClick={()=>setSheet(false)} style={{...pill(false),marginLeft:'auto'}}>✕</button>
              </div>
              <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:'14px'}}>
                {rTab==='home'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    {!isVerified&&(
                      <div style={{background:'rgba(255,152,0,0.1)',border:'1px solid #ff9800',borderRadius:'14px',padding:'14px'}}>
                        <p style={{margin:'0 0 6px',fontWeight:'700',color:'#ff9800',fontSize:'14px'}}>ID Verification Required</p>
                        <p style={{margin:'0 0 10px',color:'#ccc',fontSize:'13px'}}>{hasIdPending?'Your ID is under review.':'Upload your ID to unlock ride booking.'}</p>
                        {!hasIdPending&&<button style={{...btn(),padding:'11px'}} onClick={()=>setRTab('profile')}>Upload My ID</button>}
                      </div>
                    )}
                    <div style={{display:'flex',gap:'10px'}}>
                      {[[history.length,'Rides','rgba(162,19,93,0.25)'],[isVerified?'Verified':'Pending','Status',cardBg],['5.0','Rating',cardBg]].map(([v,l,bg])=>(
                        <div key={l} style={{background:bg,borderRadius:'12px',padding:'14px',flex:1,textAlign:'center'}}>
                          <p style={{margin:0,fontWeight:'900',color:pink2,fontSize:'16px'}}>{v}</p>
                          <p style={{margin:'4px 0 0',fontSize:'11px',color:'#888'}}>{l}</p>
                        </div>
                      ))}
                    </div>
                    <button onClick={triggerSOS} style={{background:'#c62828',color:'#fff',border:'none',borderRadius:'14px',padding:'16px',fontWeight:'900',fontSize:'16px',cursor:'pointer'}}>SOS — Emergency Alert</button>
                  </div>
                )}
                {rTab==='book'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    {!isVerified&&<div style={{background:'rgba(255,152,0,0.1)',border:'1px solid #ff9800',borderRadius:'12px',padding:'12px'}}><p style={{margin:0,color:'#ff9800',fontSize:'13px',fontWeight:'700'}}>{hasIdPending?'ID under review — booking unlocks after approval':'Upload your ID first'}</p></div>}
                    <div style={{background:cardBg,borderRadius:'16px',padding:'16px',display:'flex',flexDirection:'column',gap:'10px'}}>
                      <div style={{...row,gap:'12px'}}>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'3px'}}>
                          <div style={{width:'10px',height:'10px',borderRadius:'50%',background:'#4caf50'}}/>
                          <div style={{width:'2px',flex:1,background:'#333',minHeight:'28px'}}/>
                          <div style={{width:'10px',height:'10px',borderRadius:'2px',background:pink}}/>
                        </div>
                        <div style={{flex:1,display:'flex',flexDirection:'column',gap:'8px'}}>
                          <input style={inp} placeholder="Pickup address" value={pickup} onChange={e=>setPickup(e.target.value)}/>
                          <input style={inp} placeholder="Where to?" value={dropoff} onChange={e=>setDropoff(e.target.value)}/>
                        </div>
                      </div>
                      {stops.map((s,i)=>(
                        <div key={i} style={{...row,gap:'8px'}}>
                          <input style={{...inp,flex:1}} placeholder={`Stop ${i+1}`} value={s} onChange={e=>{const a=[...stops];a[i]=e.target.value;setStops(a);}}/>
                          <button onClick={()=>setStops(stops.filter((_,j)=>j!==i))} style={{background:'#333',border:'none',color:'#f06292',borderRadius:'8px',padding:'8px 12px',cursor:'pointer'}}>✕</button>
                        </div>
                      ))}
                      <div style={{...row,gap:'8px'}}>
                        {stops.length<2&&<button style={{...ghostBtn,flex:1}} onClick={()=>setStops([...stops,''])}>+ Add Stop</button>}
                        <label style={{...ghostBtn,flex:1,display:'flex',alignItems:'center',gap:'8px',justifyContent:'center',cursor:'pointer'}}><input type="checkbox" checked={hasPet} onChange={e=>setHasPet(e.target.checked)} style={{accentColor:pink}}/>Pet (+$5)</label>
                      </div>
                    </div>
                    {routeInfo&&<div style={{...row,gap:'12px',background:'rgba(162,19,93,0.15)',borderRadius:'12px',padding:'10px 14px',border:`1px solid ${pink}`}}><span style={{color:pink2,fontSize:'18px'}}>🗺️</span><div><p style={{margin:0,color:'#fff',fontWeight:'700',fontSize:'14px'}}>{routeInfo.distMi.toFixed(1)} miles · {Math.round(routeInfo.durMin)} min</p></div></div>}
                    <div style={{background:cardBg,borderRadius:'16px',padding:'16px',border:`2px solid ${pink}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div><p style={{margin:'0 0 4px',fontWeight:'800',color:'#fff',fontSize:'15px'}}>Women-Only Pilot</p><p style={{margin:0,color:'#888',fontSize:'12px'}}>Verified driver · Safe & private</p></div>
                      <div style={{textAlign:'right'}}><p style={{margin:0,fontWeight:'900',color:pink2,fontSize:'22px'}}>${fare.total}</p><p style={{margin:0,color:'#555',fontSize:'11px'}}>estimated</p></div>
                    </div>
                    <div style={{background:cardBg,borderRadius:'14px',padding:'14px'}}>
                      {fare.afterHours&&<div style={{background:'rgba(255,152,0,0.15)',border:'1px solid #ff9800',borderRadius:'8px',padding:'6px 10px',marginBottom:'8px'}}><p style={{margin:0,color:'#ff9800',fontSize:'12px',fontWeight:'700'}}>⏰ After-Hours Pricing (5pm–8pm)</p></div>}
                      <p style={{margin:'0 0 10px',fontWeight:'700',color:pink2,fontSize:'12px',letterSpacing:'0.5px'}}>FARE BREAKDOWN</p>
                      {[
                        [`Base Fare`,`$${fare.base}`],
                        [`Distance (${fare.distMi}mi @ $${fare.perMile}/mi)`,`$${fare.dist}`],
                        [`Duration (${fare.durMin}min @ $${fare.perMin}/min)`,`$${fare.dur}`],
                        hasPet&&[`Declared Pet`,`$${fare.pet}`],
                        stops.filter(Boolean).length>0&&[`Stops (${stops.filter(Boolean).length} × $0.50)`,`$${fare.stops}`],
                      ].filter(Boolean).map(([k,v])=>(
                        <div key={k} style={{...row,justifyContent:'space-between',marginBottom:'6px'}}><span style={{color:'#888',fontSize:'12px'}}>{k}</span><span style={{color:'#ccc',fontSize:'13px'}}>{v}</span></div>
                      ))}
                      <div style={{borderTop:'1px solid #333',paddingTop:'10px',...row,justifyContent:'space-between'}}><span style={{color:'#fff',fontWeight:'800',fontSize:'15px'}}>Total</span><span style={{color:pink2,fontWeight:'900',fontSize:'20px'}}>${fare.total}</span></div>
                    </div>
                    {msg&&<p style={{color:'#f06292',fontSize:'13px',margin:0,textAlign:'center'}}>{msg}</p>}
                    <button style={{...btn(),opacity:isVerified?1:0.5}} onClick={requestRide} disabled={loading||routeLoading||!isVerified}>{routeLoading?'Calculating...':loading?'Processing...':`Request & Pay $${fare.total}`}</button>
                    {!isVerified&&<p style={{color:'#ff9800',fontSize:'12px',textAlign:'center',margin:0}}>Booking unlocks after ID verification</p>}
                  </div>
                )}
                {rTab==='schedule'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Schedule a Ride</h3>
                    <div style={{background:cardBg,borderRadius:'16px',padding:'16px',display:'flex',flexDirection:'column',gap:'10px'}}>
                      <input style={inp} placeholder="Pickup Address"/><input style={inp} placeholder="Dropoff Address"/>
                      <input type="datetime-local" style={{...inp,colorScheme:'dark'}} min={new Date().toISOString().slice(0,16)}/>
                      <button style={{...btn(),opacity:isVerified?1:0.5}} disabled={!isVerified}>Schedule Ride</button>
                    </div>
                  </div>
                )}
                {rTab==='history'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                    <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Ride History</h3>
                    {history.length===0?<div style={{background:cardBg,borderRadius:'14px',padding:'20px',textAlign:'center'}}><p style={{margin:0,color:'#555'}}>No rides yet. Book your first!</p></div>
                    :history.map(r=>(
                      <div key={r.id} style={{background:cardBg,borderRadius:'14px',padding:'14px'}}>
                        <div style={{...row,justifyContent:'space-between',marginBottom:'6px'}}><span style={{color:pink2,fontWeight:'700',fontSize:'12px',textTransform:'uppercase'}}>{r.status}</span><span style={{color:pink2,fontWeight:'900'}}>${r.fare_total?.toFixed(2)||'--'}</span></div>
                        <p style={{margin:'0 0 2px',color:'#ccc',fontSize:'13px'}}>{r.pickup_address}</p>
                        <p style={{margin:0,color:'#888',fontSize:'13px'}}>{r.dropoff_address}</p>
                        <p style={{margin:'6px 0 0',color:'#444',fontSize:'11px'}}>{new Date(r.created_at).toLocaleDateString()}</p>
                      </div>
                    ))}
                  </div>
                )}
                {rTab==='profile'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>My Profile</h3>
                    <div style={{background:cardBg,borderRadius:'16px',padding:'20px',textAlign:'center'}}>
                      <div style={{width:'72px',height:'72px',borderRadius:'50%',background:`linear-gradient(135deg,${pink},${pink2})`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',fontSize:'28px',color:'#fff',fontWeight:'800'}}>{profile?.full_name?.[0]||'?'}</div>
                      <p style={{margin:'0 0 4px',color:'#fff',fontWeight:'800',fontSize:'18px'}}>{profile?.full_name||'Rider'}</p>
                      <p style={{margin:'0 0 2px',color:'#888',fontSize:'13px'}}>{session?.user?.email}</p>
                    </div>
                    <div style={{background:cardBg,borderRadius:'16px',padding:'16px'}}>
                      <p style={{margin:'0 0 8px',fontWeight:'700',color:pink2,fontSize:'14px'}}>ID Verification</p>
                      {isVerified?<div style={{...row,gap:'10px'}}><span>✅</span><p style={{margin:0,color:'#4caf50',fontWeight:'700'}}>Verified — Ride booking unlocked!</p></div>
                      :hasIdPending?<div><p style={{margin:0,color:'#ff9800',fontWeight:'700'}}>⏳ ID under review</p></div>
                      :(
                        <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                          <p style={{margin:0,color:'#bbb',fontSize:'13px'}}>Upload a photo of your ID to unlock ride booking.</p>
                          <label style={{background:'#2a2a2a',border:`2px dashed ${pink}`,borderRadius:'12px',padding:'20px',textAlign:'center',cursor:'pointer',display:'block'}}>
                            <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>setIdFile(e.target.files[0])}/>
                            {idFile?<p style={{margin:0,color:'#4caf50',fontWeight:'700'}}>{idFile.name}</p>:<div><p style={{margin:'0 0 4px',color:pink2,fontSize:'24px'}}>📷</p><p style={{margin:0,color:'#fff',fontWeight:'700',fontSize:'14px'}}>Tap to upload ID photo</p></div>}
                          </label>
                          {idFile&&<button style={btn()} onClick={uploadIdPhoto} disabled={idUploading}>{idUploading?'Uploading...':'Submit ID for Verification'}</button>}
                        </div>
                      )}
                    </div>
                    {notifPerm!=='granted'&&<div style={{background:cardBg,borderRadius:'14px',padding:'14px'}}><p style={{margin:'0 0 8px',fontWeight:'700',color:pink2}}>Enable Notifications</p><button style={{...btn(),padding:'11px'}} onClick={requestNotifPermission}>Enable</button></div>}
                    <button style={btn('#2a2a2a','#f06292')} onClick={signOut}>Sign Out</button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ══════════════════════════════════════════════
     DRIVER CONSOLE — Figma-style layout
  ══════════════════════════════════════════════ */
  if(view==='driver'){
    const pendingList=pending.filter(r=>r.status==='pending');
    const activeList=pending.filter(r=>r.status==='accepted');

    // Rider cards styled like the Figma mockup
    const RiderCard=({r})=>(
      <div style={{background:cardBg,borderRadius:'16px',padding:'16px',marginBottom:'12px',border:'1px solid #2a2a2a'}}>
        <div style={{...row,justifyContent:'space-between',marginBottom:'10px'}}>
          <div style={{...row,gap:'12px'}}>
            <div style={{width:'48px',height:'48px',borderRadius:'50%',background:`linear-gradient(135deg,${pink},${pink2})`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:'900',fontSize:'18px',flexShrink:0}}>{r.rider_name?.[0]||'R'}</div>
            <div>
              <p style={{margin:'0 0 2px',fontWeight:'800',color:'#fff',fontSize:'16px'}}>{r.rider_name||'Rider'}</p>
              <div style={{...row,gap:'4px'}}><span style={{color:'#ffd700',fontSize:'12px'}}>★</span><span style={{color:'#888',fontSize:'12px'}}>5.0</span></div>
            </div>
          </div>
          <div style={{textAlign:'right'}}>
            <p style={{margin:'0 0 2px',fontWeight:'900',color:pink2,fontSize:'20px'}}>${r.fare_total?.toFixed(2)}</p>
            <p style={{margin:0,color:'#666',fontSize:'12px'}}>{r.has_pet?'🐾 Pet':''}</p>
          </div>
        </div>
        <div style={{...row,gap:'8px',marginBottom:'12px',background:'#1a1a1a',borderRadius:'10px',padding:'10px'}}>
          <span style={{color:pink2,fontSize:'14px'}}>📍</span>
          <div style={{flex:1}}>
            <p style={{margin:'0 0 3px',color:'#ccc',fontSize:'13px'}}>{r.pickup_address}</p>
            <p style={{margin:0,color:'#888',fontSize:'12px'}}>→ {r.dropoff_address}</p>
          </div>
        </div>
        <button style={{...btn(),padding:'14px',borderRadius:'12px',fontSize:'15px'}} onClick={()=>updateStatus(r.id,'accepted')}>Accept Request</button>
      </div>
    );

    return(
      <div style={{minHeight:'100vh',background:dark,fontFamily:'system-ui,sans-serif'}}>

        {/* TOP HEADER */}
        <div style={{background:`linear-gradient(135deg,${pink},${pink2})`,padding:'14px 20px'}}>
          <div style={{...row,justifyContent:'space-between',marginBottom:'4px'}}>
            <div style={{...row,gap:'10px'}}>
              <img src={LOGO} alt="Hope" style={{width:'36px',height:'36px',borderRadius:'8px',objectFit:'cover'}}/>
              <div>
                <p style={{margin:0,color:'#fff',fontWeight:'900',fontSize:'18px'}}>Hope Driver</p>
                <p style={{margin:0,color:'rgba(255,255,255,0.75)',fontSize:'12px'}}>Start earning today</p>
              </div>
            </div>
            <div style={{...row,gap:'8px'}}>
              <button onClick={toggleOnline} style={{background:online?'rgba(255,255,255,0.25)':'rgba(0,0,0,0.3)',border:'2px solid rgba(255,255,255,0.5)',borderRadius:'20px',padding:'7px 14px',cursor:'pointer',...row,gap:'6px'}}>
                <div style={{width:'8px',height:'8px',borderRadius:'50%',background:online?'#fff':'rgba(255,255,255,0.4)'}}/>
                <span style={{color:'#fff',fontSize:'12px',fontWeight:'800'}}>{online?'ONLINE':'OFFLINE'}</span>
              </button>
              <button onClick={signOut} style={{background:'rgba(0,0,0,0.3)',border:'none',color:'#fff',borderRadius:'12px',padding:'8px 12px',fontSize:'12px',cursor:'pointer'}}>Out</button>
            </div>
          </div>
        </div>

        {/* NOTIFICATION PROMPT */}
        {notifPerm!=='granted'&&(
          <div style={{background:'rgba(162,19,93,0.15)',border:`1px solid ${pink}`,margin:'12px 16px 0',borderRadius:'12px',padding:'10px 16px',...row,justifyContent:'space-between'}}>
            <p style={{margin:0,color:'#fff',fontSize:'13px'}}>Enable alerts for new ride requests</p>
            <button style={{background:`linear-gradient(135deg,${pink},${pink2})`,border:'none',color:'#fff',borderRadius:'8px',padding:'7px 14px',fontSize:'12px',cursor:'pointer',fontWeight:'700'}} onClick={requestNotifPermission}>Enable</button>
          </div>
        )}

        {/* THIS WEEK BANNER */}
        <div style={{margin:'14px 16px 0',background:`linear-gradient(135deg,${pink},${pink2})`,borderRadius:'16px',padding:'16px 20px',...row,justifyContent:'space-between'}}>
          <div>
            <p style={{margin:'0 0 4px',color:'rgba(255,255,255,0.8)',fontSize:'12px',fontWeight:'600'}}>THIS WEEK</p>
            <p style={{margin:'0 0 4px',fontWeight:'900',color:'#fff',fontSize:'32px'}}>${stats.weekEarnings.toFixed(0)||'0'}</p>
            <p style={{margin:0,color:'rgba(255,255,255,0.75)',fontSize:'13px'}}>{stats.weekTrips} trips · {typeof stats.hoursOnline==='number'?stats.hoursOnline.toFixed(1):stats.hoursOnline}h online</p>
          </div>
          <span style={{fontSize:'28px',opacity:0.8}}>📈</span>
        </div>

        {/* STATS ROW */}
        <div style={{...row,gap:'10px',padding:'12px 16px'}}>
          {[['⏳',stats.pending,'Pending'],['🚗',stats.today,'Today'],['✅',stats.completed,'Done'],['💰',`$${stats.earnings.toFixed(0)}}`,'Today $']].map(([icon,val,label])=>(
            <div key={label} style={{background:cardBg,borderRadius:'12px',padding:'12px 8px',flex:1,textAlign:'center',border:'1px solid #2a2a2a'}}>
              <p style={{margin:'0 0 2px',fontSize:'14px'}}>{icon}</p>
              <p style={{margin:'0 0 2px',fontWeight:'900',color:pink2,fontSize:'16px'}}>{val}</p>
              <p style={{margin:0,fontSize:'10px',color:'#555'}}>{label}</p>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{...row,gap:'8px',padding:'0 16px 12px',overflowX:'auto'}}>
          {[['requests',`Nearby Requests${pendingList.length>0?` (${pendingList.length})`:''}`,],['active','Active'],['verify',`Verify${unverifiedRiders.length>0?` (${unverifiedRiders.length})`:''}`,],['earnings','Earnings'],['map','Map']].map(([t,l])=>(
            <button key={t} style={pill(dTab===t)} onClick={()=>setDTab(t)}>{l}</button>
          ))}
        </div>

        <div style={{padding:'0 16px 32px',display:'flex',flexDirection:'column',gap:'0'}}>

          {/* NEARBY REQUESTS — Figma card style */}
          {dTab==='requests'&&(
            <>
              <div style={{...row,justifyContent:'space-between',marginBottom:'14px'}}>
                <h3 style={{margin:0,color:'#fff',fontWeight:'900',fontSize:'18px'}}>Nearby Requests</h3>
                <div style={{...row,gap:'8px'}}>
                  <span style={{color:pink2,fontSize:'13px',fontWeight:'700'}}>{pendingList.length} available</span>
                  <button onClick={()=>{fetchPending();fetchStats();}} style={{...ghostBtn,padding:'6px 12px',fontSize:'12px'}}>↻</button>
                </div>
              </div>
              {pendingList.length===0
                ?<div style={{background:cardBg,borderRadius:'14px',padding:'24px',textAlign:'center'}}><p style={{margin:'0 0 6px',fontSize:'28px'}}>🚗</p><p style={{margin:0,color:'#555',fontSize:'14px'}}>{online?'No ride requests yet':'Go Online to receive requests'}</p></div>
                :pendingList.map(r=><RiderCard key={r.id} r={r}/>)
              }
            </>
          )}

          {/* ACTIVE */}
          {dTab==='active'&&(
            <>
              <h3 style={{margin:'0 0 14px',color:'#fff',fontWeight:'900',fontSize:'18px'}}>Active Rides</h3>
              {activeList.length===0
                ?<div style={{background:cardBg,borderRadius:'14px',padding:'24px',textAlign:'center'}}><p style={{margin:0,color:'#555'}}>No active rides</p></div>
                :activeList.map(r=>(
                  <div key={r.id} style={{background:cardBg,borderRadius:'16px',padding:'16px',marginBottom:'12px',border:`2px solid ${pink}`}}>
                    <div style={{...row,gap:'12px',marginBottom:'12px'}}>
                      <div style={{width:'48px',height:'48px',borderRadius:'50%',background:`linear-gradient(135deg,${pink},${pink2})`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:'900',fontSize:'18px'}}>{r.rider_name?.[0]||'R'}</div>
                      <div><p style={{margin:'0 0 2px',fontWeight:'800',color:'#fff',fontSize:'16px'}}>{r.rider_name}</p><p style={{margin:0,color:pink2,fontWeight:'700',fontSize:'13px'}}>${r.fare_total?.toFixed(2)}</p></div>
                    </div>
                    <div style={{background:'#1a1a1a',borderRadius:'10px',padding:'10px',marginBottom:'12px'}}>
                      <p style={{margin:'0 0 4px',color:'#ccc',fontSize:'13px'}}>📍 {r.pickup_address}</p>
                      <p style={{margin:0,color:'#aaa',fontSize:'13px'}}>🏁 {r.dropoff_address}</p>
                    </div>
                    <div style={{...row,gap:'8px'}}>
                      <button style={{...btn(),flex:1,padding:'12px',fontSize:'14px'}} onClick={()=>updateStatus(r.id,'en_route')}>En Route</button>
                      <button style={{...btn('linear-gradient(135deg,#2e7d32,#388e3c)'),flex:1,padding:'12px',fontSize:'14px'}} onClick={()=>updateStatus(r.id,'completed')}>Complete</button>
                    </div>
                  </div>
                ))
              }
            </>
          )}

          {/* VERIFY */}
          {dTab==='verify'&&(
            <>
              <h3 style={{margin:'0 0 8px',color:'#fff',fontWeight:'900',fontSize:'18px'}}>Rider Verification</h3>
              <p style={{margin:'0 0 14px',color:'#888',fontSize:'13px'}}>Review submitted IDs and approve or reject.</p>
              {unverifiedRiders.length===0
                ?<div style={{background:cardBg,borderRadius:'14px',padding:'24px',textAlign:'center'}}><p style={{margin:'0 0 6px',fontSize:'28px'}}>✅</p><p style={{margin:0,color:'#555'}}>No riders pending verification</p></div>
                :unverifiedRiders.map(r=>(
                  <div key={r.id} style={{background:cardBg,borderRadius:'16px',padding:'16px',marginBottom:'12px',border:`1px solid ${pink}`}}>
                    <div style={{...row,gap:'12px',marginBottom:'12px'}}>
                      <div style={{width:'48px',height:'48px',borderRadius:'50%',background:`linear-gradient(135deg,${pink},${pink2})`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:'900',fontSize:'18px',flexShrink:0}}>{r.full_name?.[0]||'?'}</div>
                      <div><p style={{margin:'0 0 2px',fontWeight:'800',color:'#fff',fontSize:'15px'}}>{r.full_name}</p><p style={{margin:0,color:'#888',fontSize:'12px'}}>{r.phone}</p></div>
                    </div>
                    {r.id_photo_url&&<img src={r.id_photo_url} alt="ID" style={{width:'100%',borderRadius:'10px',maxHeight:'180px',objectFit:'cover',border:'1px solid #333',marginBottom:'12px'}}/>}
                    <div style={{...row,gap:'8px'}}>
                      <button style={{...btn(),flex:1,padding:'12px'}} onClick={()=>verifyRider(r.id,true)}>✅ Approve</button>
                      <button style={{...btn('#c62828'),flex:1,padding:'12px'}} onClick={()=>verifyRider(r.id,false)}>✕ Reject</button>
                    </div>
                  </div>
                ))
              }
            </>
          )}

          {/* EARNINGS */}
          {dTab==='earnings'&&(
            <>
              <h3 style={{margin:'0 0 14px',color:'#fff',fontWeight:'900',fontSize:'18px'}}>Earnings</h3>
              <div style={{background:`linear-gradient(135deg,${pink},${pink2})`,borderRadius:'16px',padding:'20px',textAlign:'center',marginBottom:'12px'}}>
                <p style={{margin:'0 0 4px',color:'rgba(255,255,255,0.8)',fontSize:'12px',letterSpacing:'1px'}}>TODAY'S NET</p>
                <p style={{margin:'0 0 4px',fontWeight:'900',fontSize:'48px',color:'#fff'}}>${(stats.earnings*0.80).toFixed(2)}</p>
                <p style={{margin:0,color:'rgba(255,255,255,0.7)',fontSize:'13px'}}>After 20% platform fee</p>
              </div>
              <div style={{background:cardBg,borderRadius:'14px',padding:'16px',marginBottom:'12px'}}>
                {[['Gross Fares',`$${stats.earnings.toFixed(2)}`],['Platform (20%)',`-$${(stats.earnings*0.20).toFixed(2)}`],['You Keep',`$${(stats.earnings*0.80).toFixed(2)}`]].map(([k,v],i)=>(
                  <div key={k} style={{...row,justifyContent:'space-between',paddingBottom:i<2?'10px':'0',borderBottom:i<2?'1px solid #2a2a2a':'none',marginBottom:i<2?'10px':'0'}}><span style={{color:'#888',fontSize:'14px'}}>{k}</span><span style={{color:i===2?pink2:'#ccc',fontWeight:i===2?'900':'600',fontSize:'14px'}}>{v}</span></div>
                ))}
              </div>
              <div style={{background:cardBg,borderRadius:'14px',padding:'16px'}}>
                <p style={{margin:'0 0 12px',fontWeight:'700',color:pink2,fontSize:'13px',letterSpacing:'0.5px'}}>THIS WEEK</p>
                {[['Trips',stats.weekTrips],['Earnings',`$${stats.weekEarnings.toFixed(2)}`],['Net (80%)',`$${(stats.weekEarnings*0.80).toFixed(2)}`]].map(([k,v])=>(
                  <div key={k} style={{...row,justifyContent:'space-between',marginBottom:'8px'}}><span style={{color:'#888',fontSize:'14px'}}>{k}</span><span style={{color:'#ccc',fontWeight:'700',fontSize:'14px'}}>{v}</span></div>
                ))}
              </div>
            </>
          )}

          {/* MAP */}
          {dTab==='map'&&(
            <>
              <h3 style={{margin:'0 0 14px',color:'#fff',fontWeight:'900',fontSize:'18px'}}>Live Map — Chattanooga</h3>
              <div style={{borderRadius:'16px',overflow:'hidden',border:`1px solid ${pink}`,height:'420px'}}>
                <LiveMap userCoord={userCoord} height="420px"/>
              </div>
            </>
          )}

        </div>
      </div>
    );
  }

  return null;
}
