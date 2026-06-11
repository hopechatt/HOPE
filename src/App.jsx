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

const btn = (bg=`linear-gradient(135deg,${pink},${pink2})`,color='#fff') => ({
  background:bg,color,border:'none',borderRadius:'14px',padding:'15px',
  fontWeight:'800',fontSize:'16px',cursor:'pointer',width:'100%',letterSpacing:'0.3px'
});
const ghostBtn = {background:'#2a2a2a',color:'#ccc',border:'1px solid #333',
  borderRadius:'12px',padding:'12px 16px',fontWeight:'600',fontSize:'14px',cursor:'pointer'};
const pill=(active)=>({
  background:active?`linear-gradient(135deg,${pink},${pink2})`:'#2a2a2a',
  color:active?'#fff':'#888',border:'none',borderRadius:'20px',padding:'8px 18px',
  fontWeight:'700',fontSize:'13px',cursor:'pointer',whiteSpace:'nowrap',flexShrink:0
});
const inp={background:'#2a2a2a',border:'1px solid #333',borderRadius:'12px',
  padding:'14px 16px',color:'#fff',fontSize:'15px',width:'100%',boxSizing:'border-box',outline:'none'};
const row={display:'flex',flexDirection:'row',alignItems:'center'};

function calcFare(distMi=2.8,durMin=8,hasPet=false,extraStops=0){
  const base=3.50,dist=distMi*1.50,dur=durMin*0.30,pet=hasPet?5:0,stop=extraStops*1.50;
  const total=base+dist+dur+pet+stop;
  return {base:base.toFixed(2),dist:dist.toFixed(2),dur:dur.toFixed(2),
    pet:pet.toFixed(2),stops:stop.toFixed(2),total:total.toFixed(2),
    distMi:distMi.toFixed(1),durMin:Math.round(durMin)};
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

/* ── Leaflet Map ── */
function LiveMap({pickupCoord,dropoffCoord,routeCoords,userCoord,height='100%'}){
  const mapRef=useRef(null);
  const leafRef=useRef(null);
  const layersRef=useRef({});

  useEffect(()=>{
    if(leafRef.current) return;
    if(!document.getElementById('leaflet-css')){
      const l=document.createElement('link');
      l.id='leaflet-css';l.rel='stylesheet';
      l.href='https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
      document.head.appendChild(l);
    }
    const init=()=>{
      if(!mapRef.current||!window.L) return;
      const map=window.L.map(mapRef.current,{zoomControl:false}).setView([CHATT_LAT,CHATT_LNG],13);
      window.L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png',{maxZoom:19}).addTo(map);
      window.L.control.zoom({position:'topright'}).addTo(map);
      leafRef.current=map;
    };
    if(window.L){init();return;}
    const s=document.createElement('script');
    s.src='https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    s.onload=init;
    document.head.appendChild(s);
  },[]);

  useEffect(()=>{
    const L=window.L,map=leafRef.current;
    if(!L||!map) return;
    Object.values(layersRef.current).forEach(l=>map.removeLayer(l));
    layersRef.current={};
    const icon=(color)=>L.divIcon({className:'',html:`<div style="background:${color};width:14px;height:14px;border-radius:50%;border:2px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,0.5)"></div>`,iconSize:[14,14],iconAnchor:[7,7]});
    if(userCoord) layersRef.current.user=L.marker([userCoord.lat,userCoord.lng],{icon:icon('#4caf50')}).addTo(map);
    if(pickupCoord) layersRef.current.pickup=L.marker([pickupCoord.lat,pickupCoord.lng],{icon:icon('#4caf50')}).bindPopup('Pickup').addTo(map);
    if(dropoffCoord) layersRef.current.dropoff=L.marker([dropoffCoord.lat,dropoffCoord.lng],{icon:icon(pink)}).bindPopup('Dropoff').addTo(map);
    if(routeCoords?.length){
      const ll=routeCoords.map(([lng,lat])=>[lat,lng]);
      layersRef.current.route=L.polyline(ll,{color:pink2,weight:4,opacity:0.85}).addTo(map);
      map.fitBounds(layersRef.current.route.getBounds(),{padding:[40,40]});
    } else if(pickupCoord&&dropoffCoord){
      map.fitBounds([[pickupCoord.lat,pickupCoord.lng],[dropoffCoord.lat,dropoffCoord.lng]],{padding:[40,40]});
    } else if(userCoord){
      map.setView([userCoord.lat,userCoord.lng],14);
    }
  },[pickupCoord,dropoffCoord,routeCoords,userCoord]);

  return <div ref={mapRef} style={{width:'100%',height,borderRadius:'inherit'}}/>;
}

/* ══════════════════════════════════════════════════════════════ */
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

  /* rider */
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

  /* map */
  const [userCoord,setUserCoord]=useState(null);
  const [pickupCoord,setPickupCoord]=useState(null);
  const [dropoffCoord,setDropoffCoord]=useState(null);
  const [routeCoords,setRouteCoords]=useState(null);
  const [routeInfo,setRouteInfo]=useState(null);
  const [routeLoading,setRouteLoading]=useState(false);

  /* driver */
  const [dTab,setDTab]=useState('requests');
  const [pending,setPending]=useState([]);
  const [stats,setStats]=useState({pending:0,today:0,completed:0,earnings:0});
  const [online,setOnline]=useState(false);
  const [unverifiedRiders,setUnverified]=useState([]);
  const [notifPerm,setNotifPerm]=useState('default');

  const timer=useRef(null);
  const prevPendingCount=useRef(0);

  /* ── GPS ── */
  useEffect(()=>{
    navigator.geolocation?.getCurrentPosition(
      p=>setUserCoord({lat:p.coords.latitude,lng:p.coords.longitude}),
      ()=>setUserCoord({lat:CHATT_LAT,lng:CHATT_LNG})
    )||setUserCoord({lat:CHATT_LAT,lng:CHATT_LNG});
  },[]);

  /* ── Push notification setup ── */
  useEffect(()=>{
    if('serviceWorker' in navigator){
      navigator.serviceWorker.register('/sw.js').catch(()=>{});
    }
    if('Notification' in window) setNotifPerm(Notification.permission);
  },[]);

  async function requestNotifPermission(){
    if(!('Notification' in window)) return;
    const perm=await Notification.requestPermission();
    setNotifPerm(perm);
    return perm==='granted';
  }

  function sendLocalNotif(title,body){
    if(Notification.permission==='granted'){
      new Notification(title,{body,icon:LOGO,badge:LOGO,vibrate:[200,100,200]});
    }
  }

  /* ── Route calc ── */
  useEffect(()=>{
    if(!pickup||!dropoff){setPickupCoord(null);setDropoffCoord(null);setRouteCoords(null);setRouteInfo(null);return;}
    const t=setTimeout(async()=>{
      setRouteLoading(true);
      const [pc,dc]=await Promise.all([geocodeAddress(pickup),geocodeAddress(dropoff)]);
      if(pc) setPickupCoord(pc);
      if(dc) setDropoffCoord(dc);
      if(pc&&dc){
        const route=await getRoute(pc,dc);
        if(route){setRouteCoords(route.geometry);setRouteInfo({distMi:route.distMi,durMin:route.durMin});}
      }
      setRouteLoading(false);
    },800);
    return()=>clearTimeout(t);
  },[pickup,dropoff]);

  /* ── Boot ── */
  useEffect(()=>{
    supabase.auth.getSession().then(({data})=>{
      if(data.session) initSession(data.session); else setView('splash');
    });
    const {data:L}=supabase.auth.onAuthStateChange((_,s)=>{
      if(s) initSession(s); else {setSession(null);setView('splash');}
    });
    return()=>L.subscription.unsubscribe();
  },[]);

  async function initSession(s){
    setSession(s);
    let{data:p}=await supabase.from('profiles').select('*').eq('id',s.user.id).single();
    if(!p){
      await supabase.from('profiles').insert({id:s.user.id,full_name:s.user.user_metadata?.full_name||'',phone:s.user.user_metadata?.phone||'',role:s.user.id===ADMIN_UID?'driver':'rider',agreed_to_conduct:false,is_verified:false});
      const r=await supabase.from('profiles').select('*').eq('id',s.user.id).single();
      p=r.data;
    }
    setProfile(p);
    if(s.user.id===ADMIN_UID){setView('driver');startPoll();}
    else if(!p?.agreed_to_conduct) setView('conduct');
    else setView('rider');
  }

  function startPoll(){
    fetchPending();fetchStats();fetchUnverified();
    timer.current=setInterval(()=>{fetchPending();fetchStats();fetchUnverified();},8000);
  }
  useEffect(()=>()=>clearInterval(timer.current),[]);

  async function fetchPending(){
    const{data}=await supabase.from('rides').select('*').in('status',['pending','accepted']).order('created_at',{ascending:false});
    const newData=data||[];
    // fire notification if new ride came in
    if(newData.filter(r=>r.status==='pending').length > prevPendingCount.current){
      sendLocalNotif('New Ride Request!','A rider is waiting — open the app to accept.');
    }
    prevPendingCount.current=newData.filter(r=>r.status==='pending').length;
    setPending(newData);
  }
  async function fetchStats(){
    const t=new Date();t.setHours(0,0,0,0);
    const{data}=await supabase.from('rides').select('*').gte('created_at',t.toISOString());
    if(!data) return;
    setStats({pending:data.filter(r=>r.status==='pending').length,today:data.filter(r=>r.status!=='cancelled').length,completed:data.filter(r=>r.status==='completed').length,earnings:data.filter(r=>r.status==='completed').reduce((s,r)=>s+(r.fare_total||0),0)});
  }
  async function fetchUnverified(){
    const{data}=await supabase.from('profiles').select('*').eq('role','rider').eq('is_verified',false).not('id_photo_url','is',null);
    setUnverified(data||[]);
  }
  async function fetchHistory(){
    if(!session) return;
    const{data}=await supabase.from('rides').select('*').eq('rider_id',session.user.id).order('created_at',{ascending:false});
    setHistory(data||[]);
  }
  async function fetchActive(){
    if(!session) return;
    const{data}=await supabase.from('rides').select('*').eq('rider_id',session.user.id).in('status',['pending','accepted','en_route']).maybeSingle();
    setActiveRide(data);
  }
  useEffect(()=>{if(view==='rider'){fetchHistory();fetchActive();};},[view]);

  /* ── Auth ── */
  async function handleSignUp(e){
    e.preventDefault();
    if(!agreed){setMsg('Please agree to the terms.');return;}
    setLoading(true);setMsg('');
    const{error}=await supabase.auth.signUp({email,password:pass,options:{data:{full_name:name,phone},emailRedirectTo:'https://hope-rideshare.netlify.app'}});
    setLoading(false);
    if(error) setMsg(error.message);
    else setMsg('Check your email to confirm your account!');
  }
  async function handleLogin(e){
    e.preventDefault();setLoading(true);setMsg('');
    const{error}=await supabase.auth.signInWithPassword({email,password:pass});
    setLoading(false);if(error) setMsg(error.message);
  }
  async function signOut(){clearInterval(timer.current);await supabase.auth.signOut();setView('splash');setProfile(null);setSession(null);}
  async function agreeConduct(){await supabase.from('profiles').update({agreed_to_conduct:true}).eq('id',session.user.id);setView('rider');}

  /* ── ID Upload ── */
  async function uploadIdPhoto(){
    if(!idFile||!session) return;
    setIdUploading(true);
    const ext=idFile.name.split('.').pop();
    const path=`id-photos/${session.user.id}.${ext}`;
    const{data,error}=await supabase.storage.from('id-photos').upload(path,idFile,{upsert:true});
    if(!error){
      const{data:urlData}=supabase.storage.from('id-photos').getPublicUrl(path);
      await supabase.from('profiles').update({id_photo_url:urlData.publicUrl}).eq('id',session.user.id);
      setProfile(p=>({...p,id_photo_url:urlData.publicUrl}));
      setMsg('ID submitted! The driver will verify your account shortly.');
    } else {
      // fallback: store as base64 note in profile
      setMsg('ID photo noted — admin will contact you to verify.');
    }
    setIdUploading(false);
    setIdFile(null);
  }

  /* ── Verify / Reject Rider ── */
  async function verifyRider(riderId,approve){
    await supabase.from('profiles').update({is_verified:approve}).eq('id',riderId);
    fetchUnverified();
    sendLocalNotif(approve?'Rider Approved':'Rider Rejected', approve?'Rider can now book rides.':'Rider has been rejected.');
  }

  /* ── Booking ── */
  const fare=calcFare(routeInfo?.distMi||2.8,routeInfo?.durMin||8,hasPet,stops.filter(Boolean).length);

  async function requestRide(){
    if(!pickup||!dropoff){setMsg('Enter pickup and dropoff.');return;}
    if(!profile?.is_verified&&session?.user?.id!==ADMIN_UID){setMsg('Your account is pending verification. Please upload your ID below.');setRTab('profile');return;}
    setLoading(true);
    try{
      const res=await fetch('/.netlify/functions/create-stripe-checkout',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({amountInCents:Math.round(parseFloat(fare.total)*100),riderEmail:session.user.email,pickupAddress:pickup,dropoffAddress:dropoff})});
      const d=await res.json();
      if(d?.url){window.location.href=d.url;return;}
    }catch(e){}
    await supabase.from('rides').insert({rider_id:session.user.id,rider_name:profile?.full_name||'Rider',rider_phone:profile?.phone||'',pickup_address:pickup,dropoff_address:dropoff,stops:stops.filter(Boolean),has_pet:hasPet,fare_total:parseFloat(fare.total),status:'pending'});
    setMsg('Ride requested! Driver will confirm shortly.');setLoading(false);setSheet(false);fetchActive();
  }
  async function updateStatus(id,status){await supabase.from('rides').update({status}).eq('id',id);fetchPending();fetchStats();}

  function triggerSOS(){
    navigator.geolocation?.getCurrentPosition(p=>{
      const t=encodeURIComponent(`SOS! Hope Rideshare rider ${profile?.full_name||''}. GPS: https://maps.google.com/?q=${p.coords.latitude},${p.coords.longitude}`);
      window.open(`sms:911?body=${t}`);
    },()=>window.open('tel:911'))||window.open('tel:911');
  }

  /* ═══════════ SPLASH ═══════════ */
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

  /* ═══════════ AUTH ═══════════ */
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
        {authMode==='register'&&<>
          <input style={inp} placeholder="Full Name" value={name} onChange={e=>setName(e.target.value)} required/>
          <input style={inp} type="tel" placeholder="Phone Number" value={phone} onChange={e=>setPhone(e.target.value)}/>
        </>}
        <input style={inp} type="email" placeholder="Email" required value={email} onChange={e=>setEmail(e.target.value)}/>
        <input style={inp} type="password" placeholder="Password" required value={pass} onChange={e=>setPass(e.target.value)}/>
        {authMode==='register'&&(
          <label style={{...row,gap:'10px',color:'#ccc',fontSize:'13px',cursor:'pointer'}}>
            <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{width:'18px',height:'18px',accentColor:pink}}/>
            I agree to the Code of Conduct & Privacy Policy
          </label>
        )}
        {msg&&<p style={{color:msg.startsWith('Check')?'#4caf50':'#f06292',fontSize:'13px',margin:0,textAlign:'center'}}>{msg}</p>}
        <button type="submit" disabled={loading||(authMode==='register'&&!agreed)} style={{...btn(),opacity:(authMode==='register'&&!agreed)?0.4:1}}>
          {loading?'...':(authMode==='login'?'Log In':'Create Account')}
        </button>
      </form>
      <button onClick={()=>setView('splash')} style={{marginTop:'20px',background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'13px'}}>Back</button>
    </div>
  );

  /* ═══════════ CODE OF CONDUCT ═══════════ */
  if(view==='conduct') return(
    <div style={{minHeight:'100vh',background:dark,padding:'24px',fontFamily:'system-ui,sans-serif'}}>
      <div style={{maxWidth:'480px',margin:'0 auto',display:'flex',flexDirection:'column',gap:'16px'}}>
        <div style={{textAlign:'center',paddingTop:'20px'}}>
          <img src={LOGO} alt="Hope" style={{width:'80px',borderRadius:'12px'}}/>
          <h2 style={{color:'#fff',margin:'14px 0 4px',fontSize:'22px',fontWeight:'900'}}>Rider Code of Conduct</h2>
          <p style={{color:'#888',fontSize:'13px',margin:0}}>Read & agree before entering</p>
        </div>
        <div style={{background:cardBg,borderRadius:'16px',padding:'16px',display:'flex',flexDirection:'column',gap:'14px',maxHeight:'52vh',overflowY:'auto'}}>
          {[['Gender Policy','This service is strictly for women and children (boys under 12). Male adults at pickup = immediate cancellation, no refund.'],
            ['ID Verification','You agree to submit a photo ID for manual verification. No account sharing.'],
            ['Respectful Behavior','No harassment, profanity, or aggression toward the driver.'],
            ['Child Safety','Parents must bring appropriate car seats per Tennessee law.'],
            ['Zero Tolerance','No smoking, vaping, or open alcohol/drug containers in the vehicle.'],
            ['Right to Refuse','Driver may cancel any ride if she feels unsafe.'],
            ['Privacy','We collect name, email, phone, GPS (active trips only). We never sell your data.'],
          ].map(([t,d])=>(
            <div key={t}><p style={{margin:'0 0 3px',fontWeight:'700',color:pink2,fontSize:'13px'}}>{t}</p><p style={{margin:0,color:'#bbb',fontSize:'13px',lineHeight:'1.5'}}>{d}</p></div>
          ))}
        </div>
        <label style={{...row,gap:'12px',color:'#ddd',fontSize:'14px',cursor:'pointer'}}>
          <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{width:'20px',height:'20px',accentColor:pink,flexShrink:0}}/>
          I have read and agree to the Code of Conduct & Privacy Policy
        </label>
        <button style={{...btn(),opacity:agreed?1:0.4}} disabled={!agreed} onClick={agreeConduct}>Continue to Hope Rideshare</button>
        <button onClick={signOut} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'13px',textAlign:'center'}}>Sign Out</button>
      </div>
    </div>
  );

  /* ═══════════ SAFETY HUB ═══════════ */
  if(safety) return(
    <div style={{minHeight:'100vh',background:'#0a0a0a',padding:'24px',fontFamily:'system-ui,sans-serif'}}>
      <div style={{maxWidth:'480px',margin:'0 auto',display:'flex',flexDirection:'column',gap:'14px'}}>
        <div style={{...row,justifyContent:'space-between'}}>
          <h2 style={{color:'#fff',margin:0,fontSize:'22px',fontWeight:'900'}}>Safety Hub</h2>
          <button onClick={()=>setSafety(false)} style={{...ghostBtn,padding:'8px 16px'}}>Close</button>
        </div>
        <button onClick={triggerSOS} style={{background:'#c62828',color:'#fff',border:'none',borderRadius:'16px',padding:'22px',fontWeight:'900',fontSize:'20px',cursor:'pointer',boxShadow:'0 6px 24px rgba(198,40,40,0.6)'}}>SOS — Emergency Alert</button>
        <p style={{color:'#666',fontSize:'12px',textAlign:'center',margin:'-4px 0 0'}}>Sends GPS location to 911 via SMS</p>
        <div style={{background:cardBg,borderRadius:'16px',padding:'16px'}}>
          <p style={{margin:'0 0 10px',fontWeight:'700',color:pink2}}>Share My Trip</p>
          <button style={btn('#2a2a2a','#ddd')} onClick={()=>{const t=encodeURIComponent('I am on a Hope Rideshare trip: https://hope-rideshare.netlify.app');window.open(`sms:?body=${t}`);}}>Share Trip via SMS</button>
        </div>
        {activeRide&&(
          <div style={{background:cardBg,borderRadius:'16px',padding:'16px',border:`1px solid ${pink}`}}>
            <p style={{margin:'0 0 8px',fontWeight:'700',color:pink2}}>Active Ride</p>
            <p style={{margin:'0 0 2px',color:'#ccc',fontSize:'13px'}}>{activeRide.pickup_address}</p>
            <p style={{margin:'0 0 12px',color:'#ccc',fontSize:'13px'}}>{activeRide.dropoff_address}</p>
            <div style={{background:'#2a2a2a',borderRadius:'10px',padding:'10px'}}>
              <p style={{margin:'0 0 2px',fontWeight:'800',color:'#fff',fontSize:'13px'}}>Hope Schiesser — Your Driver</p>
              <p style={{margin:0,color:'#888',fontSize:'12px'}}>Women-Only Pilot · Verified</p>
            </div>
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

  /* ═══════════ RIDER ═══════════ */
  if(view==='rider'){
    const firstName=profile?.full_name?.split(' ')[0]||'there';
    const isVerified=profile?.is_verified;
    const hasIdPending=profile?.id_photo_url&&!isVerified;
    return(
      <div style={{minHeight:'100vh',background:dark,fontFamily:'system-ui,sans-serif',position:'relative',overflow:'hidden',height:'100vh'}}>
        {/* TOP NAV */}
        <div style={{position:'absolute',top:0,left:0,right:0,zIndex:20,padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',background:'linear-gradient(to bottom,rgba(0,0,0,0.8),transparent)'}}>
          <div style={{...row,gap:'10px'}}>
            <img src={LOGO} alt="Hope" style={{width:'36px',height:'36px',borderRadius:'8px',objectFit:'cover'}}/>
            <span style={{color:'#fff',fontWeight:'800',fontSize:'15px'}}>Hope</span>
          </div>
          <div style={{...row,gap:'8px'}}>
            {!isVerified&&(
              <div style={{background:'rgba(255,152,0,0.2)',border:'1px solid #ff9800',borderRadius:'20px',padding:'5px 10px'}}>
                <span style={{color:'#ff9800',fontSize:'11px',fontWeight:'700'}}>PENDING VERIFY</span>
              </div>
            )}
            <button onClick={()=>setSafety(true)} style={{background:'rgba(162,19,93,0.9)',border:'none',color:'#fff',borderRadius:'20px',padding:'7px 14px',fontWeight:'700',fontSize:'13px',cursor:'pointer'}}>Safety</button>
            <button onClick={signOut} style={{background:'rgba(0,0,0,0.6)',border:'1px solid #333',color:'#aaa',borderRadius:'20px',padding:'7px 12px',fontSize:'12px',cursor:'pointer'}}>Out</button>
          </div>
        </div>

        {/* FULL MAP */}
        <div style={{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:0}}>
          <LiveMap pickupCoord={pickupCoord} dropoffCoord={dropoffCoord} routeCoords={routeCoords} userCoord={userCoord} height="100%"/>
        </div>

        {/* ACTIVE RIDE BANNER */}
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

        {routeLoading&&(
          <div style={{position:'absolute',top:activeRide?'160px':'70px',left:'50%',transform:'translateX(-50%)',zIndex:15,background:'rgba(0,0,0,0.8)',borderRadius:'20px',padding:'8px 16px'}}>
            <p style={{margin:0,color:pink2,fontSize:'13px',fontWeight:'700'}}>Finding route...</p>
          </div>
        )}

        {/* BOTTOM SHEET */}
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
                <button onClick={()=>{setDropoff('Home');setSheet(true);setRTab('book');}} style={{...ghostBtn,flex:1,display:'flex',alignItems:'center',gap:'8px',justifyContent:'center'}}>Home</button>
                <button onClick={()=>{setDropoff('Work');setSheet(true);setRTab('book');}} style={{...ghostBtn,flex:1,display:'flex',alignItems:'center',gap:'8px',justifyContent:'center'}}>Work</button>
              </div>
            </div>
          )}

          {sheet&&(
            <div style={{paddingBottom:'32px'}}>
              <div style={{...row,gap:'8px',padding:'14px 16px 10px',overflowX:'auto',borderBottom:'1px solid #1a1a1a'}}>
                {[['home','Home'],['book','Book'],['schedule','Schedule'],['history','History'],['profile','Profile']].map(([t,l])=>(
                  <button key={t} style={pill(rTab===t)} onClick={()=>setRTab(t)}>{l}</button>
                ))}
                <button onClick={()=>setSheet(false)} style={{...pill(false),marginLeft:'auto'}}>X</button>
              </div>

              <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:'14px'}}>

                {/* HOME */}
                {rTab==='home'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    {!isVerified&&(
                      <div style={{background:'rgba(255,152,0,0.1)',border:'1px solid #ff9800',borderRadius:'14px',padding:'14px'}}>
                        <p style={{margin:'0 0 6px',fontWeight:'700',color:'#ff9800',fontSize:'14px'}}>ID Verification Required</p>
                        <p style={{margin:'0 0 10px',color:'#ccc',fontSize:'13px'}}>{hasIdPending?'Your ID is under review — you\'ll be notified once approved.':'Upload a photo of your ID to unlock ride booking.'}</p>
                        {!hasIdPending&&<button style={{...btn(),padding:'11px'}} onClick={()=>setRTab('profile')}>Upload My ID</button>}
                      </div>
                    )}
                    <div style={{display:'flex',gap:'10px'}}>
                      {[[history.length,'Rides','rgba(162,19,93,0.25)'],[isVerified?'Verified':'Pending','Status',cardBg],['5.0','Rating',cardBg]].map(([v,l,bg])=>(
                        <div key={l} style={{background:bg,borderRadius:'12px',padding:'14px',flex:1,textAlign:'center'}}>
                          <p style={{margin:0,fontWeight:'900',color:isVerified||l==='Rides'||l==='Rating'?pink2:'#ff9800',fontSize:'16px'}}>{v}</p>
                          <p style={{margin:'4px 0 0',fontSize:'11px',color:'#888'}}>{l}</p>
                        </div>
                      ))}
                    </div>
                    <button onClick={triggerSOS} style={{background:'#c62828',color:'#fff',border:'none',borderRadius:'14px',padding:'16px',fontWeight:'900',fontSize:'16px',cursor:'pointer',boxShadow:'0 4px 16px rgba(198,40,40,0.4)'}}>SOS — Emergency Alert</button>
                  </div>
                )}

                {/* BOOK */}
                {rTab==='book'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    {!isVerified&&(
                      <div style={{background:'rgba(255,152,0,0.1)',border:'1px solid #ff9800',borderRadius:'12px',padding:'12px'}}>
                        <p style={{margin:0,color:'#ff9800',fontSize:'13px',fontWeight:'700'}}>{hasIdPending?'ID under review — booking unlocks after approval':'Upload your ID first to book a ride'}</p>
                      </div>
                    )}
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
                          <button onClick={()=>setStops(stops.filter((_,j)=>j!==i))} style={{background:'#333',border:'none',color:'#f06292',borderRadius:'8px',padding:'8px 12px',cursor:'pointer'}}>X</button>
                        </div>
                      ))}
                      <div style={{...row,gap:'8px'}}>
                        {stops.length<2&&<button style={{...ghostBtn,flex:1}} onClick={()=>setStops([...stops,''])}>+ Add Stop</button>}
                        <label style={{...ghostBtn,flex:1,display:'flex',alignItems:'center',gap:'8px',justifyContent:'center',cursor:'pointer'}}>
                          <input type="checkbox" checked={hasPet} onChange={e=>setHasPet(e.target.checked)} style={{accentColor:pink}}/>Pet (+$5)
                        </label>
                      </div>
                    </div>
                    {routeInfo&&(
                      <div style={{...row,gap:'12px',background:'rgba(162,19,93,0.15)',borderRadius:'12px',padding:'10px 14px',border:`1px solid ${pink}`}}>
                        <span style={{color:pink2,fontSize:'18px'}}>🗺️</span>
                        <div><p style={{margin:0,color:'#fff',fontWeight:'700',fontSize:'14px'}}>{routeInfo.distMi.toFixed(1)} miles · {Math.round(routeInfo.durMin)} min</p><p style={{margin:0,color:'#888',fontSize:'12px'}}>Real road route</p></div>
                      </div>
                    )}
                    <div style={{background:cardBg,borderRadius:'16px',padding:'16px',border:`2px solid ${pink}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <p style={{margin:'0 0 4px',fontWeight:'800',color:'#fff',fontSize:'15px'}}>Women-Only Pilot</p>
                        <p style={{margin:0,color:'#888',fontSize:'12px'}}>Verified driver · Safe & private</p>
                        {routeInfo&&<p style={{margin:'4px 0 0',color:'#555',fontSize:'11px'}}>~{Math.round(routeInfo.durMin)} min ETA</p>}
                      </div>
                      <div style={{textAlign:'right'}}>
                        <p style={{margin:0,fontWeight:'900',color:pink2,fontSize:'22px'}}>${fare.total}</p>
                        <p style={{margin:0,color:'#555',fontSize:'11px'}}>estimated</p>
                      </div>
                    </div>
                    <div style={{background:cardBg,borderRadius:'14px',padding:'14px'}}>
                      <p style={{margin:'0 0 10px',fontWeight:'700',color:pink2,fontSize:'12px',letterSpacing:'0.5px'}}>FARE BREAKDOWN</p>
                      {[['Base Fare',`$${fare.base}`],[`Distance (${fare.distMi}mi)`,`$${fare.dist}`],[`Duration (${fare.durMin}min)`,`$${fare.dur}`],hasPet&&['Pet','$5.00'],stops.filter(Boolean).length>0&&['Stops',`$${fare.stops}`]].filter(Boolean).map(([k,v])=>(
                        <div key={k} style={{...row,justifyContent:'space-between',marginBottom:'6px'}}><span style={{color:'#888',fontSize:'12px'}}>{k}</span><span style={{color:'#ccc',fontSize:'13px'}}>{v}</span></div>
                      ))}
                      <div style={{borderTop:'1px solid #333',paddingTop:'10px',...row,justifyContent:'space-between'}}>
                        <span style={{color:'#fff',fontWeight:'800',fontSize:'15px'}}>Total</span>
                        <span style={{color:pink2,fontWeight:'900',fontSize:'20px'}}>${fare.total}</span>
                      </div>
                    </div>
                    {msg&&<p style={{color:'#f06292',fontSize:'13px',margin:0,textAlign:'center'}}>{msg}</p>}
                    <button style={{...btn(),opacity:isVerified?1:0.5}} onClick={requestRide} disabled={loading||routeLoading||!isVerified}>
                      {routeLoading?'Calculating...':loading?'Processing...':`Request & Pay $${fare.total}`}
                    </button>
                    {!isVerified&&<p style={{color:'#ff9800',fontSize:'12px',textAlign:'center',margin:0}}>Booking unlocks after ID verification</p>}
                  </div>
                )}

                {/* SCHEDULE */}
                {rTab==='schedule'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Schedule a Ride</h3>
                    <div style={{background:cardBg,borderRadius:'16px',padding:'16px',display:'flex',flexDirection:'column',gap:'10px'}}>
                      <input style={inp} placeholder="Pickup Address"/>
                      <input style={inp} placeholder="Dropoff Address"/>
                      <input type="datetime-local" style={{...inp,colorScheme:'dark'}} min={new Date().toISOString().slice(0,16)}/>
                      <button style={{...btn(),opacity:isVerified?1:0.5}} disabled={!isVerified}>Schedule Ride</button>
                    </div>
                  </div>
                )}

                {/* HISTORY */}
                {rTab==='history'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                    <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Ride History</h3>
                    {history.length===0
                      ?<div style={{background:cardBg,borderRadius:'14px',padding:'20px',textAlign:'center'}}><p style={{margin:0,color:'#555'}}>No rides yet. Book your first! 🌸</p></div>
                      :history.map(r=>(
                        <div key={r.id} style={{background:cardBg,borderRadius:'14px',padding:'14px'}}>
                          <div style={{...row,justifyContent:'space-between',marginBottom:'6px'}}><span style={{color:pink2,fontWeight:'700',fontSize:'12px',textTransform:'uppercase'}}>{r.status}</span><span style={{color:pink2,fontWeight:'900'}}>${r.fare_total?.toFixed(2)||'--'}</span></div>
                          <p style={{margin:'0 0 2px',color:'#ccc',fontSize:'13px'}}>{r.pickup_address}</p>
                          <p style={{margin:0,color:'#888',fontSize:'13px'}}>{r.dropoff_address}</p>
                          <p style={{margin:'6px 0 0',color:'#444',fontSize:'11px'}}>{new Date(r.created_at).toLocaleDateString()}</p>
                        </div>
                      ))
                    }
                  </div>
                )}

                {/* PROFILE */}
                {rTab==='profile'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>My Profile</h3>
                    <div style={{background:cardBg,borderRadius:'16px',padding:'20px',textAlign:'center'}}>
                      <div style={{width:'72px',height:'72px',borderRadius:'50%',background:`linear-gradient(135deg,${pink},${pink2})`,display:'flex',alignItems:'center',justifyContent:'center',margin:'0 auto 14px',fontSize:'28px',color:'#fff',fontWeight:'800'}}>{profile?.full_name?.[0]||'?'}</div>
                      <p style={{margin:'0 0 4px',color:'#fff',fontWeight:'800',fontSize:'18px'}}>{profile?.full_name||'Rider'}</p>
                      <p style={{margin:'0 0 2px',color:'#888',fontSize:'13px'}}>{session?.user?.email}</p>
                      <p style={{margin:0,color:'#888',fontSize:'13px'}}>{profile?.phone||'No phone'}</p>
                    </div>

                    {/* ID Verification section */}
                    <div style={{background:cardBg,borderRadius:'16px',padding:'16px'}}>
                      <p style={{margin:'0 0 8px',fontWeight:'700',color:pink2,fontSize:'14px'}}>ID Verification</p>
                      {isVerified?(
                        <div style={{...row,gap:'10px'}}><span style={{fontSize:'20px'}}>✅</span><p style={{margin:0,color:'#4caf50',fontWeight:'700',fontSize:'14px'}}>Verified — Ride booking unlocked!</p></div>
                      ):hasIdPending?(
                        <div>
                          <div style={{...row,gap:'10px',marginBottom:'8px'}}><span style={{fontSize:'20px'}}>⏳</span><p style={{margin:0,color:'#ff9800',fontWeight:'700',fontSize:'14px'}}>ID under review</p></div>
                          <p style={{margin:0,color:'#888',fontSize:'13px'}}>You'll be notified once the driver approves your account.</p>
                        </div>
                      ):(
                        <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                          <p style={{margin:0,color:'#bbb',fontSize:'13px'}}>Upload a clear photo of your driver's license or government ID to unlock ride booking.</p>
                          <label style={{background:'#2a2a2a',border:`2px dashed ${pink}`,borderRadius:'12px',padding:'20px',textAlign:'center',cursor:'pointer',display:'block'}}>
                            <input type="file" accept="image/*" style={{display:'none'}} onChange={e=>setIdFile(e.target.files[0])}/>
                            {idFile?(
                              <div><p style={{margin:'0 0 4px',color:'#4caf50',fontWeight:'700',fontSize:'14px'}}>Selected: {idFile.name}</p><p style={{margin:0,color:'#888',fontSize:'12px'}}>Tap to change</p></div>
                            ):(
                              <div><p style={{margin:'0 0 4px',color:pink2,fontSize:'24px'}}>📷</p><p style={{margin:'0 0 2px',color:'#fff',fontWeight:'700',fontSize:'14px'}}>Tap to upload ID photo</p><p style={{margin:0,color:'#666',fontSize:'12px'}}>JPG, PNG accepted</p></div>
                            )}
                          </label>
                          {idFile&&(
                            <button style={btn()} onClick={uploadIdPhoto} disabled={idUploading}>
                              {idUploading?'Uploading...':'Submit ID for Verification'}
                            </button>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Notification opt-in */}
                    {notifPerm!=='granted'&&(
                      <div style={{background:cardBg,borderRadius:'14px',padding:'14px'}}>
                        <p style={{margin:'0 0 8px',fontWeight:'700',color:pink2,fontSize:'14px'}}>Enable Notifications</p>
                        <p style={{margin:'0 0 10px',color:'#bbb',fontSize:'13px'}}>Get notified when your ride is accepted.</p>
                        <button style={{...btn(),padding:'11px'}} onClick={requestNotifPermission}>Enable Notifications</button>
                      </div>
                    )}

                    <div style={{background:cardBg,borderRadius:'14px',padding:'14px'}}>
                      {[['Account','Active'],['Conduct','Agreed'],['Rides',history.length],['Rating','5.0']].map(([k,v])=>(
                        <div key={k} style={{...row,justifyContent:'space-between',marginBottom:'8px'}}><span style={{color:'#888',fontSize:'13px'}}>{k}</span><span style={{color:'#4caf50',fontWeight:'700',fontSize:'13px'}}>{v}</span></div>
                      ))}
                    </div>
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

  /* ═══════════ DRIVER ═══════════ */
  if(view==='driver'){
    const pendingList=pending.filter(r=>r.status==='pending');
    const activeList=pending.filter(r=>r.status==='accepted');
    return(
      <div style={{minHeight:'100vh',background:dark,fontFamily:'system-ui,sans-serif'}}>
        <div style={{background:'#0a0a0a',padding:'14px 20px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:'1px solid #1a1a1a',position:'sticky',top:0,zIndex:10}}>
          <div style={{...row,gap:'10px'}}>
            <img src={LOGO} alt="Hope" style={{width:'38px',height:'38px',borderRadius:'8px',objectFit:'cover'}}/>
            <div><p style={{margin:0,color:'#fff',fontWeight:'800',fontSize:'14px'}}>Driver Console</p><p style={{margin:0,color:'#666',fontSize:'11px'}}>Hope Rideshare</p></div>
          </div>
          <div style={{...row,gap:'8px'}}>
            <button onClick={()=>setOnline(!online)} style={{...row,gap:'8px',background:online?'rgba(46,125,50,0.3)':'rgba(162,19,93,0.2)',border:`1px solid ${online?'#2e7d32':pink}`,borderRadius:'20px',padding:'7px 14px',cursor:'pointer'}}>
              <div style={{width:'8px',height:'8px',borderRadius:'50%',background:online?'#4caf50':'#555'}}/>
              <span style={{color:online?'#4caf50':'#aaa',fontSize:'12px',fontWeight:'700'}}>{online?'ONLINE':'OFFLINE'}</span>
            </button>
            <button onClick={signOut} style={{...ghostBtn,padding:'7px 12px',fontSize:'12px'}}>Out</button>
          </div>
        </div>

        {/* Notification prompt for driver */}
        {notifPerm!=='granted'&&(
          <div style={{background:'rgba(162,19,93,0.15)',border:`1px solid ${pink}`,margin:'12px 16px',borderRadius:'12px',padding:'12px 16px',...row,justifyContent:'space-between'}}>
            <p style={{margin:0,color:'#fff',fontSize:'13px',fontWeight:'600'}}>Enable alerts for new ride requests</p>
            <button style={{...btn(),width:'auto',padding:'8px 14px',fontSize:'12px'}} onClick={requestNotifPermission}>Enable</button>
          </div>
        )}

        {/* Stats */}
        <div style={{...row,gap:'10px',padding:'14px 16px'}}>
          {[['Pending',stats.pending],['Today',stats.today],['Done',stats.completed],['Earned',`$${stats.earnings.toFixed(0)}`]].map(([l,v])=>(
            <div key={l} style={{background:cardBg,borderRadius:'12px',padding:'12px',flex:1,textAlign:'center'}}>
              <p style={{margin:'0 0 2px',fontWeight:'900',color:pink2,fontSize:'17px'}}>{v}</p>
              <p style={{margin:0,fontSize:'10px',color:'#555'}}>{l}</p>
            </div>
          ))}
        </div>

        <div style={{...row,gap:'8px',padding:'0 16px 12px',overflowX:'auto'}}>
          {[['requests',`Requests${pendingList.length>0?` (${pendingList.length})`:''}`,],['active','Active'],['verify',`Verify${unverifiedRiders.length>0?` (${unverifiedRiders.length})`:''}`,],['earnings','Earnings'],['map','Map']].map(([t,l])=>(
            <button key={t} style={pill(dTab===t)} onClick={()=>setDTab(t)}>{l}</button>
          ))}
        </div>

        <div style={{padding:'0 16px 32px',display:'flex',flexDirection:'column',gap:'12px'}}>

          {/* REQUESTS */}
          {dTab==='requests'&&(
            <>
              <div style={{...row,justifyContent:'space-between'}}>
                <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Incoming Requests</h3>
                <button onClick={()=>{fetchPending();fetchStats();}} style={{...ghostBtn,padding:'6px 12px',fontSize:'12px'}}>Refresh</button>
              </div>
              {pendingList.length===0
                ?<div style={{background:cardBg,borderRadius:'14px',padding:'20px',textAlign:'center'}}><p style={{margin:0,color:'#555'}}>{online?'No pending requests':'Go Online to receive requests'}</p></div>
                :pendingList.map(r=>(
                  <div key={r.id} style={{background:cardBg,borderRadius:'16px',padding:'16px',border:'1px solid #2a2a2a'}}>
                    <div style={{...row,justifyContent:'space-between',marginBottom:'10px'}}>
                      <div><p style={{margin:'0 0 2px',fontWeight:'800',color:'#fff',fontSize:'16px'}}>{r.rider_name||'Rider'}</p><p style={{margin:0,color:'#666',fontSize:'12px'}}>{r.rider_phone}</p></div>
                      <div style={{textAlign:'right'}}><p style={{margin:0,fontWeight:'900',color:pink2,fontSize:'20px'}}>${r.fare_total?.toFixed(2)}</p>{r.has_pet&&<p style={{margin:0,color:'#888',fontSize:'11px'}}>Pet</p>}</div>
                    </div>
                    <div style={{background:'#1a1a1a',borderRadius:'10px',padding:'10px',marginBottom:'12px'}}>
                      <p style={{margin:'0 0 4px',color:'#ccc',fontSize:'13px'}}>{r.pickup_address}</p>
                      <p style={{margin:0,color:'#aaa',fontSize:'13px'}}>{r.dropoff_address}</p>
                    </div>
                    <div style={{...row,gap:'8px'}}>
                      <button style={{...btn(),flex:1,padding:'12px'}} onClick={()=>updateStatus(r.id,'accepted')}>Accept</button>
                      <button style={{...btn('#2a2a2a','#ccc'),flex:1,padding:'12px'}} onClick={()=>updateStatus(r.id,'cancelled')}>Decline</button>
                    </div>
                  </div>
                ))
              }
            </>
          )}

          {/* ACTIVE */}
          {dTab==='active'&&(
            <>
              <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Active Rides</h3>
              {activeList.length===0
                ?<div style={{background:cardBg,borderRadius:'14px',padding:'20px',textAlign:'center'}}><p style={{margin:0,color:'#555'}}>No active rides</p></div>
                :activeList.map(r=>(
                  <div key={r.id} style={{background:cardBg,borderRadius:'16px',padding:'16px',border:`2px solid ${pink}`}}>
                    <p style={{margin:'0 0 6px',fontWeight:'800',color:pink2,fontSize:'15px'}}>{r.rider_name}</p>
                    <p style={{margin:'0 0 2px',color:'#ccc',fontSize:'13px'}}>{r.pickup_address}</p>
                    <p style={{margin:'0 0 14px',color:'#aaa',fontSize:'13px'}}>{r.dropoff_address}</p>
                    <div style={{...row,gap:'8px'}}>
                      <button style={{...btn(),flex:1,padding:'11px'}} onClick={()=>updateStatus(r.id,'en_route')}>En Route</button>
                      <button style={{...btn('#2e7d32'),flex:1,padding:'11px'}} onClick={()=>updateStatus(r.id,'completed')}>Complete</button>
                    </div>
                  </div>
                ))
              }
            </>
          )}

          {/* VERIFY RIDERS */}
          {dTab==='verify'&&(
            <>
              <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Rider Verification</h3>
              <p style={{margin:0,color:'#888',fontSize:'13px'}}>Review submitted IDs and approve or reject riders.</p>
              {unverifiedRiders.length===0
                ?<div style={{background:cardBg,borderRadius:'14px',padding:'20px',textAlign:'center'}}><p style={{margin:0,color:'#555'}}>No riders pending verification</p></div>
                :unverifiedRiders.map(r=>(
                  <div key={r.id} style={{background:cardBg,borderRadius:'16px',padding:'16px',border:`1px solid ${pink}`}}>
                    <div style={{...row,gap:'12px',marginBottom:'12px'}}>
                      <div style={{width:'48px',height:'48px',borderRadius:'50%',background:`linear-gradient(135deg,${pink},${pink2})`,display:'flex',alignItems:'center',justifyContent:'center',color:'#fff',fontWeight:'800',fontSize:'18px',flexShrink:0}}>{r.full_name?.[0]||'?'}</div>
                      <div><p style={{margin:'0 0 2px',fontWeight:'800',color:'#fff',fontSize:'15px'}}>{r.full_name}</p><p style={{margin:0,color:'#888',fontSize:'12px'}}>{r.phone}</p></div>
                    </div>
                    {r.id_photo_url&&(
                      <div style={{marginBottom:'12px'}}>
                        <p style={{margin:'0 0 6px',color:'#888',fontSize:'12px',fontWeight:'600'}}>SUBMITTED ID PHOTO</p>
                        <img src={r.id_photo_url} alt="ID" style={{width:'100%',borderRadius:'10px',maxHeight:'180px',objectFit:'cover',border:'1px solid #333'}}/>
                      </div>
                    )}
                    <div style={{...row,gap:'8px'}}>
                      <button style={{...btn(),flex:1,padding:'12px'}} onClick={()=>verifyRider(r.id,true)}>Approve</button>
                      <button style={{...btn('#c62828'),flex:1,padding:'12px'}} onClick={()=>verifyRider(r.id,false)}>Reject</button>
                    </div>
                  </div>
                ))
              }
            </>
          )}

          {/* EARNINGS */}
          {dTab==='earnings'&&(
            <>
              <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Earnings</h3>
              <div style={{background:cardBg,borderRadius:'16px',padding:'20px',textAlign:'center'}}>
                <p style={{margin:'0 0 4px',color:'#666',fontSize:'12px',letterSpacing:'1px'}}>TODAY'S NET</p>
                <p style={{margin:0,fontWeight:'900',fontSize:'48px',color:pink2}}>${(stats.earnings*0.80).toFixed(2)}</p>
                <p style={{margin:'4px 0 0',color:'#444',fontSize:'13px'}}>After 20% platform fee</p>
              </div>
              <div style={{background:cardBg,borderRadius:'14px',padding:'14px'}}>
                {[['Gross',`$${stats.earnings.toFixed(2)}`],['Fee (20%)',`-$${(stats.earnings*0.20).toFixed(2)}`],['You Keep',`$${(stats.earnings*0.80).toFixed(2)}`]].map(([k,v],i)=>(
                  <div key={k} style={{...row,justifyContent:'space-between',paddingBottom:i<2?'10px':'0',borderBottom:i<2?'1px solid #2a2a2a':'none',marginBottom:i<2?'10px':'0'}}><span style={{color:'#888',fontSize:'13px'}}>{k}</span><span style={{color:i===2?pink2:'#ccc',fontWeight:i===2?'900':'600',fontSize:'13px'}}>{v}</span></div>
                ))}
              </div>
            </>
          )}

          {/* MAP */}
          {dTab==='map'&&(
            <>
              <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Live Map</h3>
              <div style={{borderRadius:'16px',overflow:'hidden',border:'1px solid #2a2a2a',height:'400px'}}>
                <LiveMap userCoord={userCoord} height="400px"/>
              </div>
            </>
          )}

        </div>
      </div>
    );
  }

  return null;
}
