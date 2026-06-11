import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_UID } from './config';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const LOGO = 'https://media.base44.com/images/public/6a276d56de2d596e49ec189a/ec3567149_IMG_1097.jpeg';
const BG   = 'https://media.base44.com/images/public/6a276d56de2d596e49ec189a/ec3567149_IMG_1097.jpeg';
const MAP_EMBED = 'https://www.openstreetmap.org/export/embed.html?bbox=-85.45%2C34.95%2C-85.15%2C35.15&layer=mapnik';

/* ── shared styles ── */
const pink  = '#A2135D';
const pink2 = '#E0358D';
const dark  = '#121212';
const card  = '#1E1E1E';
const input = '#2a2a2a';

const btn = (bg=`linear-gradient(135deg,${pink},${pink2})`, color='#fff') => ({
  background: bg, color, border: 'none', borderRadius: '14px',
  padding: '15px', fontWeight: '800', fontSize: '16px',
  cursor: 'pointer', width: '100%', letterSpacing: '0.3px',
});
const ghostBtn = { background: '#2a2a2a', color: '#ccc', border: '1px solid #333',
  borderRadius: '12px', padding: '12px 16px', fontWeight: '600',
  fontSize: '14px', cursor: 'pointer' };
const pill = (active) => ({
  background: active ? `linear-gradient(135deg,${pink},${pink2})` : '#2a2a2a',
  color: active ? '#fff' : '#888', border: 'none', borderRadius: '20px',
  padding: '8px 18px', fontWeight: '700', fontSize: '13px',
  cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
});
const inp = {
  background: '#2a2a2a', border: '1px solid #333', borderRadius: '12px',
  padding: '14px 16px', color: '#fff', fontSize: '15px',
  width: '100%', boxSizing: 'border-box', outline: 'none',
};
const row = { display:'flex', flexDirection:'row', alignItems:'center' };
const col = { display:'flex', flexDirection:'column' };

function calcFare(hasPet=false, extraStops=0) {
  const base=3.50, dist=2.80, dur=1.20;
  const total = base + dist + dur + (hasPet?5:0) + (extraStops*1.50);
  return { base, dist: dist.toFixed(2), dur: dur.toFixed(2),
           pet: hasPet?5:0, stops: (extraStops*1.50).toFixed(2),
           total: total.toFixed(2) };
}

/* ══════════════════════════════════════════════════════════════ */
export default function App() {
  /* auth */
  const [session,  setSession]  = useState(null);
  const [profile,  setProfile]  = useState(null);
  const [view,     setView]     = useState('splash');   // splash|auth|conduct|rider|driver
  const [authMode, setAuthMode] = useState('login');
  const [loading,  setLoading]  = useState(false);
  const [msg,      setMsg]      = useState('');
  const [email,    setEmail]    = useState('');
  const [pass,     setPass]     = useState('');
  const [name,     setName]     = useState('');
  const [phone,    setPhone]    = useState('');
  const [agreed,   setAgreed]   = useState(false);

  /* rider */
  const [rTab,     setRTab]     = useState('home');   // home|book|schedule|history|profile
  const [pickup,   setPickup]   = useState('');
  const [dropoff,  setDropoff]  = useState('');
  const [stops,    setStops]    = useState([]);
  const [hasPet,   setHasPet]   = useState(false);
  const [history,  setHistory]  = useState([]);
  const [active,   setActive]   = useState(null);
  const [safety,   setSafety]   = useState(false);
  const [sheet,    setSheet]    = useState(false);    // bottom sheet open

  /* driver */
  const [dTab,     setDTab]     = useState('requests');
  const [pending,  setPending]  = useState([]);
  const [stats,    setStats]    = useState({pending:0,today:0,completed:0,earnings:0});
  const [online,   setOnline]   = useState(false);

  const timer = useRef(null);

  /* ── boot ── */
  useEffect(() => {
    supabase.auth.getSession().then(({data}) => {
      if (data.session) initSession(data.session); else setView('splash');
    });
    const {data:L} = supabase.auth.onAuthStateChange((_,s) => {
      if (s) initSession(s); else { setSession(null); setView('splash'); }
    });
    return () => L.subscription.unsubscribe();
  }, []);

  async function initSession(s) {
    setSession(s);
    let {data:p} = await supabase.from('profiles').select('*').eq('id',s.user.id).single();
    if (!p) {
      await supabase.from('profiles').insert({
        id: s.user.id, full_name: s.user.user_metadata?.full_name||'',
        phone: s.user.user_metadata?.phone||'',
        role: s.user.id===ADMIN_UID?'driver':'rider', agreed_to_conduct:false
      });
      const r = await supabase.from('profiles').select('*').eq('id',s.user.id).single();
      p = r.data;
    }
    setProfile(p);
    if (s.user.id===ADMIN_UID) { setView('driver'); startPoll(); }
    else if (!p?.agreed_to_conduct) setView('conduct');
    else { setView('rider'); }
  }

  function startPoll() { fetchPending(); fetchStats(); timer.current = setInterval(()=>{ fetchPending(); fetchStats(); },8000); }
  useEffect(()=>()=>clearInterval(timer.current),[]);

  async function fetchPending() {
    const {data} = await supabase.from('rides').select('*').in('status',['pending','accepted']).order('created_at',{ascending:false});
    setPending(data||[]);
  }
  async function fetchStats() {
    const t=new Date(); t.setHours(0,0,0,0);
    const {data} = await supabase.from('rides').select('*').gte('created_at',t.toISOString());
    if (!data) return;
    setStats({
      pending:   data.filter(r=>r.status==='pending').length,
      today:     data.filter(r=>r.status!=='cancelled').length,
      completed: data.filter(r=>r.status==='completed').length,
      earnings:  data.filter(r=>r.status==='completed').reduce((s,r)=>s+(r.fare_total||0),0),
    });
  }
  async function fetchHistory() {
    if (!session) return;
    const {data} = await supabase.from('rides').select('*').eq('rider_id',session.user.id).order('created_at',{ascending:false});
    setHistory(data||[]);
  }
  async function fetchActive() {
    if (!session) return;
    const {data} = await supabase.from('rides').select('*').eq('rider_id',session.user.id).in('status',['pending','accepted','en_route']).maybeSingle();
    setActive(data);
  }
  useEffect(()=>{ if(view==='rider'){ fetchHistory(); fetchActive(); } },[view]);

  /* ── auth ── */
  async function handleSignUp(e) {
    e.preventDefault();
    if (!agreed) { setMsg('Please agree to the terms.'); return; }
    setLoading(true); setMsg('');
    const {error} = await supabase.auth.signUp({ email, password:pass,
      options:{data:{full_name:name,phone}, emailRedirectTo:'https://hope-rideshare.netlify.app'}});
    setLoading(false);
    if (error) setMsg(error.message);
    else setMsg('Check your email to confirm your account!');
  }
  async function handleLogin(e) {
    e.preventDefault(); setLoading(true); setMsg('');
    const {error} = await supabase.auth.signInWithPassword({email,password:pass});
    setLoading(false); if (error) setMsg(error.message);
  }
  async function signOut() { clearInterval(timer.current); await supabase.auth.signOut(); setView('splash'); setProfile(null); setSession(null); }
  async function agreeConduct() { await supabase.from('profiles').update({agreed_to_conduct:true}).eq('id',session.user.id); setView('rider'); }

  /* ── booking ── */
  async function requestRide() {
    if (!pickup||!dropoff) { setMsg('Enter pickup and dropoff.'); return; }
    const fare = calcFare(hasPet, stops.filter(Boolean).length);
    setLoading(true);
    try {
      const res = await fetch('/.netlify/functions/create-stripe-checkout',{
        method:'POST', headers:{'Content-Type':'application/json'},
        body:JSON.stringify({ amountInCents:Math.round(parseFloat(fare.total)*100),
          riderEmail:session.user.email, pickupAddress:pickup, dropoffAddress:dropoff })
      });
      const d = await res.json();
      if (d?.url) { window.location.href=d.url; return; }
    } catch(e){}
    await supabase.from('rides').insert({
      rider_id:session.user.id, rider_name:profile?.full_name||'Rider',
      rider_phone:profile?.phone||'', pickup_address:pickup, dropoff_address:dropoff,
      stops:stops.filter(Boolean), has_pet:hasPet,
      fare_total:parseFloat(fare.total), status:'pending'
    });
    setMsg('Ride requested!'); setLoading(false); setSheet(false); fetchActive();
  }
  async function updateStatus(id,status) { await supabase.from('rides').update({status}).eq('id',id); fetchPending(); fetchStats(); }

  /* ── SOS ── */
  function triggerSOS() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos=>{
        const t=encodeURIComponent(`SOS! Hope Rideshare rider ${profile?.full_name||''}. GPS: https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`);
        window.open(`sms:911?body=${t}`);
      },()=>window.open('tel:911'));
    } else window.open('tel:911');
  }

  /* ═══════════════════════════════════════════════════════════ */
  /* SPLASH                                                      */
  /* ═══════════════════════════════════════════════════════════ */
  if (view==='splash') return (
    <div style={{minHeight:'100vh',background:dark,display:'flex',flexDirection:'column',
      alignItems:'center',justifyContent:'center',
      backgroundImage:`linear-gradient(rgba(18,18,18,0.7),rgba(18,18,18,0.95)),url(${BG})`,
      backgroundSize:'cover',backgroundPosition:'center',padding:'32px 24px',fontFamily:'system-ui,sans-serif'}}>
      <img src={LOGO} alt="Hope" style={{width:'180px',borderRadius:'24px',marginBottom:'24px',
        boxShadow:`0 12px 40px rgba(162,19,93,0.5)`}} />
      <h1 style={{color:'#fff',margin:'0 0 8px',fontSize:'34px',fontWeight:'900',letterSpacing:'-0.5px'}}>Hope Rideshare</h1>
      <p style={{color:'#aaa',margin:'0 0 48px',fontSize:'15px',textAlign:'center',lineHeight:'1.5'}}>
        Chattanooga&apos;s Women-Only Rideshare
      </p>
      <div style={{display:'flex',flexDirection:'column',gap:'14px',width:'100%',maxWidth:'340px'}}>
        <button style={btn()} onClick={()=>{setAuthMode('login');setView('auth');}}>Log In</button>
        <button style={btn('#2a2a2a','#fff')} onClick={()=>{setAuthMode('register');setView('auth');}}>Create Account</button>
      </div>
      <p style={{color:'#444',fontSize:'12px',marginTop:'32px',textAlign:'center'}}>Women-Only Pilot · Chattanooga, TN</p>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════ */
  /* AUTH                                                        */
  /* ═══════════════════════════════════════════════════════════ */
  if (view==='auth') return (
    <div style={{minHeight:'100vh',
      backgroundImage:`linear-gradient(rgba(18,18,18,0.85),rgba(18,18,18,0.95)),url(${BG})`,
      backgroundSize:'cover',backgroundPosition:'center',display:'flex',
      flexDirection:'column',alignItems:'center',justifyContent:'center',
      padding:'24px',fontFamily:'system-ui,sans-serif'}}>
      <img src={LOGO} alt="Hope" style={{width:'100px',borderRadius:'16px',marginBottom:'20px'}} />
      <h2 style={{color:'#fff',margin:'0 0 6px',fontSize:'24px',fontWeight:'900'}}>Welcome Back</h2>
      <p style={{color:'#888',fontSize:'13px',marginBottom:'28px'}}>Chattanooga&apos;s Trusted Rides for Women</p>
      <div style={{display:'flex',gap:'8px',marginBottom:'24px'}}>
        <button style={pill(authMode==='login')} onClick={()=>setAuthMode('login')}>Log In</button>
        <button style={pill(authMode==='register')} onClick={()=>setAuthMode('register')}>Create Account</button>
      </div>
      <form onSubmit={authMode==='login'?handleLogin:handleSignUp}
        style={{display:'flex',flexDirection:'column',gap:'12px',width:'100%',maxWidth:'380px'}}>
        {authMode==='register'&&<>
          <input style={inp} placeholder="Full Name" value={name} onChange={e=>setName(e.target.value)} required/>
          <input style={inp} type="tel" placeholder="Phone Number" value={phone} onChange={e=>setPhone(e.target.value)}/>
        </>}
        <input style={inp} type="email" placeholder="Email" required value={email} onChange={e=>setEmail(e.target.value)}/>
        <input style={inp} type="password" placeholder="Password" required value={pass} onChange={e=>setPass(e.target.value)}/>
        {authMode==='register'&&(
          <label style={{...row,gap:'10px',color:'#ccc',fontSize:'13px',cursor:'pointer'}}>
            <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}
              style={{width:'18px',height:'18px',accentColor:pink}}/>
            I agree to the Code of Conduct & Privacy Policy
          </label>
        )}
        {msg&&<p style={{color:msg.startsWith('Check')?'#4caf50':'#f06292',fontSize:'13px',margin:0,textAlign:'center'}}>{msg}</p>}
        <button type="submit" disabled={loading||(authMode==='register'&&!agreed)}
          style={{...btn(),opacity:(authMode==='register'&&!agreed)?0.4:1}}>
          {loading?'...':(authMode==='login'?'Log In':'Create Account')}
        </button>
      </form>
      <button onClick={()=>setView('splash')} style={{marginTop:'20px',background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'13px'}}>← Back</button>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════ */
  /* CODE OF CONDUCT                                             */
  /* ═══════════════════════════════════════════════════════════ */
  if (view==='conduct') return (
    <div style={{minHeight:'100vh',background:dark,padding:'24px',fontFamily:'system-ui,sans-serif'}}>
      <div style={{maxWidth:'480px',margin:'0 auto',display:'flex',flexDirection:'column',gap:'16px'}}>
        <div style={{textAlign:'center',paddingTop:'20px'}}>
          <img src={LOGO} alt="Hope" style={{width:'80px',borderRadius:'12px'}}/>
          <h2 style={{color:'#fff',margin:'14px 0 4px',fontSize:'22px',fontWeight:'900'}}>Rider Code of Conduct</h2>
          <p style={{color:'#888',fontSize:'13px',margin:0}}>Read & agree before entering</p>
        </div>
        <div style={{background:card,borderRadius:'16px',padding:'16px',display:'flex',flexDirection:'column',gap:'14px',maxHeight:'52vh',overflowY:'auto'}}>
          {[['Gender Policy','This service is strictly for women and children (boys under 12). Male adults at pickup = immediate cancellation, no refund.'],
            ['ID Verification','You agree to submit a photo ID for manual verification. No account sharing.'],
            ['Respectful Behavior','No harassment, profanity, or aggression toward the driver.'],
            ['Child Safety','Parents must bring appropriate car seats per Tennessee law.'],
            ['Zero Tolerance','No smoking, vaping, or open alcohol/drug containers in the vehicle.'],
            ['Right to Refuse','Driver may cancel any ride if she feels unsafe.'],
            ['Privacy','We collect name, email, phone, GPS (active trips only). We never sell your data.'],
          ].map(([t,d])=>(
            <div key={t}>
              <p style={{margin:'0 0 3px',fontWeight:'700',color:pink2,fontSize:'13px'}}>{t}</p>
              <p style={{margin:0,color:'#bbb',fontSize:'13px',lineHeight:'1.5'}}>{d}</p>
            </div>
          ))}
        </div>
        <label style={{...row,gap:'12px',color:'#ddd',fontSize:'14px',cursor:'pointer'}}>
          <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)}
            style={{width:'20px',height:'20px',accentColor:pink,flexShrink:0}}/>
          I have read and agree to the Code of Conduct & Privacy Policy
        </label>
        <button style={{...btn(),opacity:agreed?1:0.4}} disabled={!agreed} onClick={agreeConduct}>
          Continue to Hope Rideshare 🌸
        </button>
        <button onClick={signOut} style={{background:'none',border:'none',color:'#555',cursor:'pointer',fontSize:'13px',textAlign:'center'}}>Sign Out</button>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════ */
  /* SAFETY HUB OVERLAY                                          */
  /* ═══════════════════════════════════════════════════════════ */
  if (safety) return (
    <div style={{minHeight:'100vh',background:'#0a0a0a',padding:'24px',fontFamily:'system-ui,sans-serif'}}>
      <div style={{maxWidth:'480px',margin:'0 auto',display:'flex',flexDirection:'column',gap:'14px'}}>
        <div style={{...row,justifyContent:'space-between'}}>
          <h2 style={{color:'#fff',margin:0,fontSize:'22px',fontWeight:'900'}}>🛡️ Safety Hub</h2>
          <button onClick={()=>setSafety(false)} style={{...ghostBtn,padding:'8px 16px'}}>✕ Close</button>
        </div>
        {/* BIG SOS */}
        <button onClick={triggerSOS} style={{background:'#c62828',color:'#fff',border:'none',borderRadius:'16px',
          padding:'22px',fontWeight:'900',fontSize:'20px',cursor:'pointer',
          boxShadow:'0 6px 24px rgba(198,40,40,0.6)',letterSpacing:'1px'}}>
          ⚠️ SOS — Emergency Alert
        </button>
        <p style={{color:'#666',fontSize:'12px',textAlign:'center',margin:'-4px 0 0'}}>Sends your GPS location to 911 via SMS</p>
        <div style={{background:card,borderRadius:'16px',padding:'16px'}}>
          <p style={{margin:'0 0 10px',fontWeight:'700',color:pink2}}>📍 Share My Trip</p>
          <p style={{margin:'0 0 12px',color:'#bbb',fontSize:'13px'}}>Let a trusted contact follow your ride in real time.</p>
          <button style={{...btn('#2a2a2a','#ddd')}} onClick={()=>{
            const t=encodeURIComponent('I am on a Hope Rideshare trip. Follow along: https://hope-rideshare.netlify.app');
            window.open(`sms:?body=${t}`);
          }}>📤 Share Trip via SMS</button>
        </div>
        {active&&(
          <div style={{background:card,borderRadius:'16px',padding:'16px',border:`1px solid ${pink}`}}>
            <p style={{margin:'0 0 10px',fontWeight:'700',color:pink2}}>🚗 Your Active Ride</p>
            <p style={{margin:'0 0 3px',color:'#ccc',fontSize:'13px'}}>From: {active.pickup_address}</p>
            <p style={{margin:'0 0 12px',color:'#ccc',fontSize:'13px'}}>To:   {active.dropoff_address}</p>
            <div style={{background:'#2a2a2a',borderRadius:'10px',padding:'12px'}}>
              <p style={{margin:'0 0 2px',fontWeight:'800',color:'#fff',fontSize:'14px'}}>Hope Schiesser — Your Driver</p>
              <p style={{margin:0,color:'#888',fontSize:'12px'}}>Women-Only Pilot · Verified Driver</p>
            </div>
          </div>
        )}
        <div style={{background:card,borderRadius:'16px',padding:'16px'}}>
          <p style={{margin:'0 0 10px',fontWeight:'700',color:pink2}}>📋 Safety Tips</p>
          {['Verify driver photo matches app before entering','Seatbelt on at all times','Trust your instincts — cancel anytime','Note car make, model & license plate'].map(t=>(
            <p key={t} style={{margin:'0 0 6px',color:'#bbb',fontSize:'13px'}}>✓ {t}</p>
          ))}
        </div>
      </div>
    </div>
  );

  /* ═══════════════════════════════════════════════════════════ */
  /* RIDER  — Lyft-style map + bottom sheet                     */
  /* ═══════════════════════════════════════════════════════════ */
  if (view==='rider') {
    const firstName = profile?.full_name?.split(' ')[0]||'there';
    const fare = calcFare(hasPet, stops.filter(Boolean).length);

    return (
      <div style={{minHeight:'100vh',background:dark,fontFamily:'system-ui,sans-serif',position:'relative',overflow:'hidden'}}>

        {/* ── TOP NAV ── */}
        <div style={{position:'absolute',top:0,left:0,right:0,zIndex:20,
          padding:'14px 18px',display:'flex',alignItems:'center',justifyContent:'space-between',
          background:'linear-gradient(to bottom,rgba(0,0,0,0.75),transparent)'}}>
          <div style={{...row,gap:'10px'}}>
            <img src={LOGO} alt="Hope" style={{width:'36px',height:'36px',borderRadius:'8px',objectFit:'cover'}}/>
            <span style={{color:'#fff',fontWeight:'800',fontSize:'15px'}}>Hope</span>
          </div>
          <div style={{...row,gap:'8px'}}>
            <button onClick={()=>setSafety(true)} style={{background:'rgba(162,19,93,0.85)',border:'none',
              color:'#fff',borderRadius:'20px',padding:'7px 14px',fontWeight:'700',fontSize:'13px',cursor:'pointer'}}>
              🛡️ Safety
            </button>
            <button onClick={signOut} style={{background:'rgba(0,0,0,0.5)',border:'1px solid #333',
              color:'#aaa',borderRadius:'20px',padding:'7px 12px',fontSize:'12px',cursor:'pointer'}}>
              Out
            </button>
          </div>
        </div>

        {/* ── FULL-SCREEN MAP ── */}
        <div style={{position:'absolute',top:0,left:0,right:0,bottom:0,zIndex:0}}>
          <iframe title="Map" src={MAP_EMBED} width="100%" height="100%"
            style={{border:'none',filter:'brightness(0.6) saturate(1.2)'}} allowFullScreen/>
        </div>

        {/* ── ACTIVE RIDE BANNER ── */}
        {active&&(
          <div style={{position:'absolute',top:'70px',left:'16px',right:'16px',zIndex:15,
            background:'rgba(162,19,93,0.92)',borderRadius:'16px',padding:'14px 16px',backdropFilter:'blur(8px)'}}>
            <div style={{...row,justifyContent:'space-between',marginBottom:'6px'}}>
              <p style={{margin:0,fontWeight:'800',color:'#fff',fontSize:'15px'}}>🚗 Ride in Progress</p>
              <button onClick={()=>setSafety(true)} style={{background:'#c62828',border:'none',color:'#fff',
                borderRadius:'8px',padding:'4px 10px',fontSize:'12px',cursor:'pointer',fontWeight:'700'}}>SOS</button>
            </div>
            <p style={{margin:'0 0 2px',fontSize:'13px',color:'rgba(255,255,255,0.85)'}}>
              Status: <strong>{active.status.replace('_',' ').toUpperCase()}</strong>
            </p>
            <p style={{margin:0,fontSize:'12px',color:'rgba(255,255,255,0.7)'}}>
              {active.pickup_address} → {active.dropoff_address}
            </p>
          </div>
        )}

        {/* ── BOTTOM SHEET ── */}
        <div style={{position:'absolute',bottom:0,left:0,right:0,zIndex:10,
          background:dark,borderRadius:'24px 24px 0 0',
          boxShadow:'0 -4px 32px rgba(0,0,0,0.8)',
          transition:'max-height 0.3s ease',
          maxHeight: sheet ? '92vh' : '220px',
          overflow: sheet ? 'auto' : 'hidden'}}>

          {/* drag handle */}
          <div style={{width:'40px',height:'4px',background:'#333',borderRadius:'2px',margin:'12px auto 0'}}/>

          {/* ── HOME SHEET (collapsed) ── */}
          {!sheet&&(
            <div style={{padding:'16px 20px 24px'}}>
              <p style={{margin:'0 0 14px',color:'#fff',fontWeight:'900',fontSize:'22px'}}>
                Hello, {firstName} 👋
              </p>
              {/* Lyft-style "Where to?" bar */}
              <button onClick={()=>{ setSheet(true); setRTab('book'); }}
                style={{...row,gap:'12px',background:'#fff',borderRadius:'14px',
                  padding:'16px 18px',border:'none',cursor:'pointer',width:'100%',marginBottom:'14px'}}>
                <div style={{width:'10px',height:'10px',borderRadius:'50%',background:pink,flexShrink:0}}/>
                <span style={{color:'#333',fontWeight:'700',fontSize:'16px',flex:1,textAlign:'left'}}>Where to?</span>
                <span style={{background:`linear-gradient(135deg,${pink},${pink2})`,color:'#fff',
                  borderRadius:'8px',padding:'4px 10px',fontSize:'12px',fontWeight:'700'}}>Now</span>
              </button>
              {/* Quick shortcuts */}
              <div style={{...row,gap:'10px'}}>
                <button onClick={()=>{ setDropoff('Home'); setSheet(true); setRTab('book'); }}
                  style={{...ghostBtn,flex:1,display:'flex',alignItems:'center',gap:'8px'}}>
                  <span style={{fontSize:'16px'}}>🏠</span> Home
                </button>
                <button onClick={()=>{ setDropoff('Work'); setSheet(true); setRTab('book'); }}
                  style={{...ghostBtn,flex:1,display:'flex',alignItems:'center',gap:'8px'}}>
                  <span style={{fontSize:'16px'}}>💼</span> Work
                </button>
              </div>
            </div>
          )}

          {/* ── EXPANDED SHEET (tabs) ── */}
          {sheet&&(
            <div style={{paddingBottom:'32px'}}>
              {/* Tab bar */}
              <div style={{...row,gap:'8px',padding:'14px 16px 10px',overflowX:'auto',
                borderBottom:'1px solid #1a1a1a',background:dark}}>
                {[['home','🏠'],['book','🚗 Book'],['schedule','📅'],['history','📋'],['profile','👤']].map(([t,label])=>(
                  <button key={t} style={pill(rTab===t)} onClick={()=>setRTab(t)}>{label}</button>
                ))}
                <button onClick={()=>setSheet(false)} style={{...pill(false),marginLeft:'auto'}}>✕</button>
              </div>

              <div style={{padding:'16px 20px',display:'flex',flexDirection:'column',gap:'14px'}}>

                {/* HOME tab */}
                {rTab==='home'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    <div style={{...row,gap:'10px'}}>
                      {[
                        [history.length,'Total Rides','rgba(162,19,93,0.25)'],
                        ['5.0 ⭐','Rating','#1a1a1a'],
                        ['✓','Verified','#1a1a1a'],
                      ].map(([v,l,bg])=>(
                        <div key={l} style={{background:bg,borderRadius:'12px',padding:'14px',flex:1,textAlign:'center'}}>
                          <p style={{margin:0,fontWeight:'900',color:pink2,fontSize:'18px'}}>{v}</p>
                          <p style={{margin:'4px 0 0',fontSize:'11px',color:'#888'}}>{l}</p>
                        </div>
                      ))}
                    </div>
                    <button onClick={triggerSOS} style={{background:'#c62828',color:'#fff',border:'none',
                      borderRadius:'14px',padding:'16px',fontWeight:'900',fontSize:'16px',cursor:'pointer',
                      boxShadow:'0 4px 16px rgba(198,40,40,0.4)'}}>
                      ⚠️ SOS — Emergency Alert
                    </button>
                  </div>
                )}

                {/* BOOK tab */}
                {rTab==='book'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    <div style={{background:card,borderRadius:'16px',padding:'16px',
                      display:'flex',flexDirection:'column',gap:'10px'}}>
                      {/* Route line */}
                      <div style={{...row,gap:'12px'}}>
                        <div style={{display:'flex',flexDirection:'column',alignItems:'center',gap:'4px'}}>
                          <div style={{width:'10px',height:'10px',borderRadius:'50%',background:'#4caf50'}}/>
                          <div style={{width:'2px',flex:1,background:'#333',minHeight:'24px'}}/>
                          <div style={{width:'10px',height:'10px',borderRadius:'2px',background:pink}}/>
                        </div>
                        <div style={{flex:1,display:'flex',flexDirection:'column',gap:'8px'}}>
                          <input style={{...inp,background:'#2a2a2a'}} placeholder="Pickup address"
                            value={pickup} onChange={e=>setPickup(e.target.value)}/>
                          <input style={{...inp,background:'#2a2a2a'}} placeholder="Where to?"
                            value={dropoff} onChange={e=>setDropoff(e.target.value)}/>
                        </div>
                      </div>
                      {stops.map((s,i)=>(
                        <div key={i} style={{...row,gap:'8px'}}>
                          <input style={{...inp,flex:1}} placeholder={`Stop ${i+1}`}
                            value={s} onChange={e=>{const a=[...stops];a[i]=e.target.value;setStops(a);}}/>
                          <button onClick={()=>setStops(stops.filter((_,j)=>j!==i))}
                            style={{background:'#333',border:'none',color:'#f06292',borderRadius:'8px',padding:'8px 12px',cursor:'pointer'}}>✕</button>
                        </div>
                      ))}
                      <div style={{...row,gap:'8px'}}>
                        {stops.length<2&&<button style={{...ghostBtn,flex:1}} onClick={()=>setStops([...stops,''])}>＋ Add Stop</button>}
                        <label style={{...ghostBtn,flex:1,display:'flex',alignItems:'center',gap:'8px',justifyContent:'center',cursor:'pointer'}}>
                          <input type="checkbox" checked={hasPet} onChange={e=>setHasPet(e.target.checked)} style={{accentColor:pink}}/>
                          🐾 Pet (+$5)
                        </label>
                      </div>
                    </div>

                    {/* Vehicle option — Women-Only Pilot */}
                    <div style={{background:card,borderRadius:'16px',padding:'16px',
                      border:`2px solid ${pink}`,display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                      <div>
                        <p style={{margin:'0 0 4px',fontWeight:'800',color:'#fff',fontSize:'15px'}}>🌸 Women-Only Pilot</p>
                        <p style={{margin:0,color:'#888',fontSize:'12px'}}>Verified female driver · Safe & private</p>
                        <p style={{margin:'4px 0 0',color:'#555',fontSize:'11px'}}>~15 min away</p>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <p style={{margin:0,fontWeight:'900',color:pink2,fontSize:'22px'}}>${fare.total}</p>
                        <p style={{margin:0,color:'#555',fontSize:'11px'}}>estimated</p>
                      </div>
                    </div>

                    {/* Fare breakdown */}
                    <div style={{background:card,borderRadius:'14px',padding:'14px'}}>
                      <p style={{margin:'0 0 10px',fontWeight:'700',color:pink2,fontSize:'12px',letterSpacing:'0.5px'}}>FARE BREAKDOWN</p>
                      {[['Base Fare',`$${fare.base.toFixed(2)}`],['Distance (~2 mi)',`$${fare.dist}`],['Duration (~4 min)',`$${fare.dur}`],
                        hasPet&&['Pet Fee','$5.00'],
                        stops.filter(Boolean).length>0&&['Extra Stops',`$${fare.stops}`]
                      ].filter(Boolean).map(([k,v])=>(
                        <div key={k} style={{...row,justifyContent:'space-between',marginBottom:'6px'}}>
                          <span style={{color:'#888',fontSize:'13px'}}>{k}</span>
                          <span style={{color:'#ccc',fontSize:'13px'}}>{v}</span>
                        </div>
                      ))}
                      <div style={{borderTop:'1px solid #333',paddingTop:'10px',...row,justifyContent:'space-between'}}>
                        <span style={{color:'#fff',fontWeight:'800',fontSize:'15px'}}>Total</span>
                        <span style={{color:pink2,fontWeight:'900',fontSize:'20px'}}>${fare.total}</span>
                      </div>
                    </div>

                    {msg&&<p style={{color:'#f06292',fontSize:'13px',margin:0,textAlign:'center'}}>{msg}</p>}
                    <button style={btn()} onClick={requestRide} disabled={loading}>
                      {loading?'Processing...': `💳 Request & Pay $${fare.total}`}
                    </button>
                  </div>
                )}

                {/* SCHEDULE tab */}
                {rTab==='schedule'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Schedule a Ride</h3>
                    <div style={{background:card,borderRadius:'16px',padding:'16px',display:'flex',flexDirection:'column',gap:'10px'}}>
                      <input style={inp} placeholder="Pickup Address"/>
                      <input style={inp} placeholder="Dropoff Address"/>
                      <input type="datetime-local" style={{...inp,colorScheme:'dark'}} min={new Date().toISOString().slice(0,16)}/>
                      <button style={btn()}>📅 Schedule Ride</button>
                    </div>
                    <div style={{background:card,borderRadius:'14px',padding:'14px',textAlign:'center'}}>
                      <p style={{margin:0,color:'#555',fontSize:'13px'}}>No scheduled rides yet</p>
                    </div>
                  </div>
                )}

                {/* HISTORY tab */}
                {rTab==='history'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                    <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Ride History</h3>
                    {history.length===0
                      ?<div style={{background:card,borderRadius:'14px',padding:'20px',textAlign:'center'}}>
                        <p style={{margin:0,color:'#555'}}>No rides yet. Book your first ride! 🌸</p></div>
                      :history.map(r=>(
                        <div key={r.id} style={{background:card,borderRadius:'14px',padding:'14px'}}>
                          <div style={{...row,justifyContent:'space-between',marginBottom:'6px'}}>
                            <span style={{color:pink2,fontWeight:'700',fontSize:'12px',textTransform:'uppercase'}}>{r.status}</span>
                            <span style={{color:pink2,fontWeight:'900'}}>${r.fare_total?.toFixed(2)||'--'}</span>
                          </div>
                          <p style={{margin:'0 0 2px',color:'#ccc',fontSize:'13px'}}>From: {r.pickup_address}</p>
                          <p style={{margin:0,color:'#888',fontSize:'13px'}}>To: {r.dropoff_address}</p>
                          <p style={{margin:'6px 0 0',color:'#444',fontSize:'11px'}}>{new Date(r.created_at).toLocaleDateString()}</p>
                        </div>
                      ))
                    }
                  </div>
                )}

                {/* PROFILE tab */}
                {rTab==='profile'&&(
                  <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                    <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>My Profile</h3>
                    <div style={{background:card,borderRadius:'16px',padding:'20px',textAlign:'center'}}>
                      <div style={{width:'72px',height:'72px',borderRadius:'50%',
                        background:`linear-gradient(135deg,${pink},${pink2})`,
                        display:'flex',alignItems:'center',justifyContent:'center',
                        margin:'0 auto 14px',fontSize:'28px',color:'#fff',fontWeight:'800'}}>
                        {profile?.full_name?.[0]||'?'}
                      </div>
                      <p style={{margin:'0 0 4px',color:'#fff',fontWeight:'800',fontSize:'18px'}}>{profile?.full_name||'Rider'}</p>
                      <p style={{margin:'0 0 2px',color:'#888',fontSize:'13px'}}>{session?.user?.email}</p>
                      <p style={{margin:0,color:'#888',fontSize:'13px'}}>{profile?.phone||'No phone'}</p>
                    </div>
                    <div style={{background:card,borderRadius:'14px',padding:'14px'}}>
                      {[['Account Status','Active ✓'],['Code of Conduct','Agreed ✓'],['Total Rides',history.length],['Rating','5.0 ⭐']].map(([k,v])=>(
                        <div key={k} style={{...row,justifyContent:'space-between',marginBottom:'8px'}}>
                          <span style={{color:'#888',fontSize:'13px'}}>{k}</span>
                          <span style={{color:'#4caf50',fontWeight:'700',fontSize:'13px'}}>{v}</span>
                        </div>
                      ))}
                    </div>
                    <button style={{...btn('#2a2a2a','#f06292')}} onClick={signOut}>Sign Out</button>
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════ */
  /* DRIVER CONSOLE                                              */
  /* ═══════════════════════════════════════════════════════════ */
  if (view==='driver') {
    const pendingList = pending.filter(r=>r.status==='pending');
    const activeList  = pending.filter(r=>r.status==='accepted');

    return (
      <div style={{minHeight:'100vh',background:dark,fontFamily:'system-ui,sans-serif'}}>

        {/* Header */}
        <div style={{background:'#0a0a0a',padding:'14px 20px',display:'flex',
          alignItems:'center',justifyContent:'space-between',
          borderBottom:'1px solid #1a1a1a',position:'sticky',top:0,zIndex:10}}>
          <div style={{...row,gap:'10px'}}>
            <img src={LOGO} alt="Hope" style={{width:'38px',height:'38px',borderRadius:'8px',objectFit:'cover'}}/>
            <div>
              <p style={{margin:0,color:'#fff',fontWeight:'800',fontSize:'14px'}}>Driver Console</p>
              <p style={{margin:0,color:'#666',fontSize:'11px'}}>Hope Rideshare</p>
            </div>
          </div>
          <div style={{...row,gap:'8px'}}>
            {/* Online toggle */}
            <button onClick={()=>setOnline(!online)}
              style={{...row,gap:'8px',background:online?'rgba(46,125,50,0.3)':'rgba(162,19,93,0.2)',
                border:`1px solid ${online?'#2e7d32':pink}`,borderRadius:'20px',
                padding:'7px 14px',cursor:'pointer'}}>
              <div style={{width:'8px',height:'8px',borderRadius:'50%',background:online?'#4caf50':'#666'}}/>
              <span style={{color:online?'#4caf50':'#aaa',fontSize:'12px',fontWeight:'700'}}>
                {online?'ONLINE':'OFFLINE'}
              </span>
            </button>
            <button onClick={signOut} style={{...ghostBtn,padding:'7px 12px',fontSize:'12px'}}>Out</button>
          </div>
        </div>

        {/* Stat tiles */}
        <div style={{...row,gap:'10px',padding:'14px 16px'}}>
          {[
            ['⏳',stats.pending,'Pending'],
            ['🚗',stats.today,"Today"],
            ['✅',stats.completed,'Done'],
            ['💰',`$${stats.earnings.toFixed(0)}`,'Earned'],
          ].map(([icon,val,label])=>(
            <div key={label} style={{background:card,borderRadius:'12px',padding:'12px',flex:1,textAlign:'center'}}>
              <p style={{margin:0,fontSize:'11px'}}>{icon}</p>
              <p style={{margin:'4px 0 2px',fontWeight:'900',color:pink2,fontSize:'17px'}}>{val}</p>
              <p style={{margin:0,fontSize:'10px',color:'#555'}}>{label}</p>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{...row,gap:'8px',padding:'0 16px 12px',overflowX:'auto'}}>
          {[['requests',`Requests${pendingList.length>0?` (${pendingList.length})`:''}'],
            ['active','Active'],['earnings','Earnings'],['map','Map']].map(([t,l])=>(
            <button key={t} style={pill(dTab===t)} onClick={()=>setDTab(t)}>{l}</button>
          ))}
        </div>

        <div style={{padding:'0 16px 32px',display:'flex',flexDirection:'column',gap:'12px'}}>

          {/* REQUESTS */}
          {dTab==='requests'&&(
            <>
              <div style={{...row,justifyContent:'space-between'}}>
                <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Incoming Requests</h3>
                <button onClick={()=>{fetchPending();fetchStats();}}
                  style={{...ghostBtn,padding:'6px 12px',fontSize:'12px'}}>↻ Refresh</button>
              </div>
              {pendingList.length===0
                ?<div style={{background:card,borderRadius:'14px',padding:'20px',textAlign:'center'}}>
                  <p style={{margin:0,color:'#555'}}>{online?'No pending requests right now':'Go Online to receive ride requests'}</p></div>
                :pendingList.map(r=>(
                  <div key={r.id} style={{background:card,borderRadius:'16px',padding:'16px',border:'1px solid #2a2a2a'}}>
                    <div style={{...row,justifyContent:'space-between',marginBottom:'10px'}}>
                      <div>
                        <p style={{margin:'0 0 2px',fontWeight:'800',color:'#fff',fontSize:'16px'}}>{r.rider_name||'Rider'}</p>
                        <p style={{margin:0,color:'#666',fontSize:'12px'}}>{r.rider_phone||''}</p>
                      </div>
                      <div style={{textAlign:'right'}}>
                        <p style={{margin:0,fontWeight:'900',color:pink2,fontSize:'20px'}}>${r.fare_total?.toFixed(2)}</p>
                        {r.has_pet&&<p style={{margin:0,color:'#888',fontSize:'11px'}}>🐾 Pet</p>}
                      </div>
                    </div>
                    <div style={{background:'#1a1a1a',borderRadius:'10px',padding:'10px',marginBottom:'12px'}}>
                      <p style={{margin:'0 0 4px',color:'#ccc',fontSize:'13px'}}>📍 {r.pickup_address}</p>
                      <p style={{margin:0,color:'#aaa',fontSize:'13px'}}>🏁 {r.dropoff_address}</p>
                    </div>
                    <div style={{...row,gap:'8px'}}>
                      <button style={{...btn(),flex:1,padding:'12px'}} onClick={()=>updateStatus(r.id,'accepted')}>✅ Accept</button>
                      <button style={{...btn('#2a2a2a','#ccc'),flex:1,padding:'12px'}} onClick={()=>updateStatus(r.id,'cancelled')}>✕ Decline</button>
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
                ?<div style={{background:card,borderRadius:'14px',padding:'20px',textAlign:'center'}}>
                  <p style={{margin:0,color:'#555'}}>No active rides</p></div>
                :activeList.map(r=>(
                  <div key={r.id} style={{background:card,borderRadius:'16px',padding:'16px',border:`2px solid ${pink}`}}>
                    <p style={{margin:'0 0 6px',fontWeight:'800',color:pink2,fontSize:'15px'}}>🚗 Active — {r.rider_name}</p>
                    <p style={{margin:'0 0 2px',color:'#ccc',fontSize:'13px'}}>From: {r.pickup_address}</p>
                    <p style={{margin:'0 0 14px',color:'#aaa',fontSize:'13px'}}>To: {r.dropoff_address}</p>
                    <div style={{...row,gap:'8px'}}>
                      <button style={{...btn(),flex:1,padding:'11px'}} onClick={()=>updateStatus(r.id,'en_route')}>🚦 En Route</button>
                      <button style={{...btn('#2e7d32'),flex:1,padding:'11px'}} onClick={()=>updateStatus(r.id,'completed')}>✅ Complete</button>
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
              <div style={{background:card,borderRadius:'16px',padding:'20px',textAlign:'center'}}>
                <p style={{margin:'0 0 4px',color:'#666',fontSize:'12px',letterSpacing:'1px'}}>TODAY'S NET EARNINGS</p>
                <p style={{margin:0,fontWeight:'900',fontSize:'48px',color:pink2}}>${(stats.earnings*0.80).toFixed(2)}</p>
                <p style={{margin:'4px 0 0',color:'#444',fontSize:'13px'}}>After 20% platform fee</p>
              </div>
              <div style={{background:card,borderRadius:'14px',padding:'14px'}}>
                {[['Gross Fares',`$${stats.earnings.toFixed(2)}`],
                  ['Platform Fee (20%)',`- $${(stats.earnings*0.20).toFixed(2)}`],
                  ['You Keep',`$${(stats.earnings*0.80).toFixed(2)}`]
                ].map(([k,v],i)=>(
                  <div key={k} style={{...row,justifyContent:'space-between',
                    paddingBottom:i<2?'10px':'0',borderBottom:i<2?'1px solid #2a2a2a':'none',marginBottom:i<2?'10px':'0'}}>
                    <span style={{color:'#888',fontSize:'13px'}}>{k}</span>
                    <span style={{color:i===2?pink2:'#ccc',fontWeight:i===2?'900':'600',fontSize:'13px'}}>{v}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* MAP */}
          {dTab==='map'&&(
            <>
              <h3 style={{margin:0,color:'#fff',fontWeight:'800'}}>Live Map — Chattanooga</h3>
              <div style={{borderRadius:'16px',overflow:'hidden',border:'1px solid #2a2a2a'}}>
                <iframe title="Map" src={MAP_EMBED} width="100%" height="360"
                  style={{border:'none',display:'block'}} allowFullScreen/>
              </div>
            </>
          )}

        </div>
      </div>
    );
  }

  return null;
}
