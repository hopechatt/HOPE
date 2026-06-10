import { useState, useEffect, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';
import { SUPABASE_URL, SUPABASE_ANON_KEY, ADMIN_UID } from './config';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
const LOGO = 'https://media.base44.com/images/public/6a276d56de2d596e49ec189a/ec3567149_IMG_1097.jpeg';
const BG   = 'https://media.base44.com/images/public/6a276d56de2d596e49ec189a/ec3567149_IMG_1097.jpeg';

const S = {
  col:     { display:'flex', flexDirection:'column', gap:'12px' },
  row:     { display:'flex', flexDirection:'row', alignItems:'center' },
  card:    { background:'#1E1E1E', borderRadius:'16px', padding:'16px' },
  input:   { background:'#2a2a2a', border:'1px solid #333', borderRadius:'10px', padding:'13px 14px', color:'#fff', fontSize:'15px', width:'100%', boxSizing:'border-box', outline:'none' },
  pinkBtn: { background:'linear-gradient(135deg,#A2135D,#E0358D)', color:'#fff', border:'none', borderRadius:'12px', padding:'15px', fontWeight:'800', fontSize:'16px', cursor:'pointer', width:'100%', letterSpacing:'0.5px' },
  grayBtn: { background:'#2a2a2a', color:'#ccc', border:'1px solid #333', borderRadius:'10px', padding:'12px', fontWeight:'600', fontSize:'14px', cursor:'pointer', width:'100%' },
  tab:     (a) => ({ background: a ? 'linear-gradient(135deg,#A2135D,#E0358D)' : '#2a2a2a', color: a ? '#fff' : '#999', border:'none', borderRadius:'20px', padding:'8px 16px', fontWeight:'700', fontSize:'13px', cursor:'pointer', whiteSpace:'nowrap' }),
  sosBtn:  { background:'#d32f2f', color:'#fff', border:'none', borderRadius:'14px', padding:'16px', fontWeight:'900', fontSize:'17px', cursor:'pointer', width:'100%', letterSpacing:'1px', boxShadow:'0 4px 20px rgba(211,47,47,0.5)' },
  stat:    (bg='#2a2a2a') => ({ background:bg, borderRadius:'12px', padding:'14px', flex:1, textAlign:'center' }),
};

function calcFare(pickup, dropoff, hasPet=false, extraStops=0) {
  const base=3.50, dist=2.80, dur=1.20, petFee=5, stopFee=1.50;
  const total = base + dist + dur + (hasPet ? petFee : 0) + (extraStops * stopFee);
  return { base, dist: dist.toFixed(2), dur: dur.toFixed(2), pet: hasPet ? petFee : 0, stops: (extraStops*stopFee).toFixed(2), total: total.toFixed(2) };
}

export default function App() {
  const [session, setSession]     = useState(null);
  const [profile, setProfile]     = useState(null);
  const [view, setView]           = useState('splash');
  const [authMode, setAuthMode]   = useState('login');
  const [loading, setLoading]     = useState(false);
  const [msg, setMsg]             = useState('');
  const [email, setEmail]         = useState('');
  const [password, setPassword]   = useState('');
  const [fullName, setFullName]   = useState('');
  const [phone, setPhone]         = useState('');
  const [agreed, setAgreed]       = useState(false);
  const [riderTab, setRiderTab]   = useState('home');
  const [driverTab, setDriverTab] = useState('requests');
  const [pickup, setPickup]       = useState('');
  const [dropoff, setDropoff]     = useState('');
  const [stops, setStops]         = useState([]);
  const [hasPet, setHasPet]       = useState(false);
  const [rideHistory, setHistory] = useState([]);
  const [activeRide, setActive]   = useState(null);
  const [showSafety, setSafety]   = useState(false);
  const [pending, setPending]     = useState([]);
  const [stats, setStats]         = useState({ pending:0, today:0, completed:0, earnings:0 });
  const [isOnline, setOnline]     = useState(false);
  const timer = useRef(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) initSession(data.session); else setView('splash');
    });
    const { data: L } = supabase.auth.onAuthStateChange((_e, s) => {
      if (s) initSession(s); else { setSession(null); setView('splash'); }
    });
    return () => L.subscription.unsubscribe();
  }, []);

  async function initSession(s) {
    setSession(s);
    let { data: p } = await supabase.from('profiles').select('*').eq('id', s.user.id).single();
    if (!p) {
      await supabase.from('profiles').insert({ id: s.user.id, full_name: s.user.user_metadata?.full_name||'', phone: s.user.user_metadata?.phone||'', role: s.user.id===ADMIN_UID?'driver':'rider', agreed_to_conduct: false });
      const res = await supabase.from('profiles').select('*').eq('id', s.user.id).single();
      p = res.data;
    }
    setProfile(p);
    if (s.user.id === ADMIN_UID) { setView('driver'); poll(); }
    else if (!p?.agreed_to_conduct) setView('conduct');
    else setView('rider');
  }

  function poll() { fetchPending(); fetchStats(); timer.current = setInterval(() => { fetchPending(); fetchStats(); }, 8000); }
  useEffect(() => () => clearInterval(timer.current), []);

  async function fetchPending() {
    const { data } = await supabase.from('rides').select('*').in('status',['pending','accepted']).order('created_at',{ascending:false});
    setPending(data||[]);
  }
  async function fetchStats() {
    const today = new Date(); today.setHours(0,0,0,0);
    const { data } = await supabase.from('rides').select('*').gte('created_at', today.toISOString());
    if (!data) return;
    setStats({ pending: data.filter(r=>r.status==='pending').length, today: data.filter(r=>r.status!=='cancelled').length, completed: data.filter(r=>r.status==='completed').length, earnings: data.filter(r=>r.status==='completed').reduce((s,r)=>s+(r.fare_total||0),0) });
  }
  async function fetchHistory() { if (!session) return; const { data } = await supabase.from('rides').select('*').eq('rider_id',session.user.id).order('created_at',{ascending:false}); setHistory(data||[]); }
  async function fetchActive()  { if (!session) return; const { data } = await supabase.from('rides').select('*').eq('rider_id',session.user.id).in('status',['pending','accepted','en_route']).maybeSingle(); setActive(data); }
  useEffect(() => { if (view==='rider') { fetchHistory(); fetchActive(); } }, [view]);

  async function handleSignUp(e) {
    e.preventDefault();
    if (!agreed) { setMsg('Please agree to the terms.'); return; }
    setLoading(true); setMsg('');
    const { error } = await supabase.auth.signUp({ email, password, options: { data: { full_name: fullName, phone }, emailRedirectTo: 'https://hope-rideshare.netlify.app' } });
    setLoading(false);
    if (error) setMsg(error.message); else setMsg('Check your email to confirm your account!');
  }
  async function handleLogin(e) {
    e.preventDefault(); setLoading(true); setMsg('');
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoading(false); if (error) setMsg(error.message);
  }
  async function signOut() { clearInterval(timer.current); await supabase.auth.signOut(); setView('splash'); setProfile(null); setSession(null); }
  async function agreeConduct() { await supabase.from('profiles').update({ agreed_to_conduct:true }).eq('id', session.user.id); setView('rider'); }

  async function requestRide() {
    if (!pickup || !dropoff) { setMsg('Enter pickup and dropoff.'); return; }
    const fare = calcFare(pickup, dropoff, hasPet, stops.filter(Boolean).length);
    setLoading(true);
    try {
      const res = await fetch('/.netlify/functions/create-stripe-checkout', { method:'POST', headers:{'Content-Type':'application/json'}, body: JSON.stringify({ amountInCents: Math.round(parseFloat(fare.total)*100), riderEmail: session.user.email, pickupAddress: pickup, dropoffAddress: dropoff }) });
      const data = await res.json();
      if (data?.url) { window.location.href = data.url; return; }
    } catch(e) {}
    await supabase.from('rides').insert({ rider_id: session.user.id, rider_name: profile?.full_name||'Rider', rider_phone: profile?.phone||'', pickup_address: pickup, dropoff_address: dropoff, stops: stops.filter(Boolean), has_pet: hasPet, fare_total: parseFloat(fare.total), status:'pending' });
    setMsg('Ride requested! Driver will confirm shortly.'); setLoading(false); setRiderTab('home'); fetchActive();
  }
  async function updateStatus(id, status) { await supabase.from('rides').update({ status }).eq('id', id); fetchPending(); fetchStats(); }

  function triggerSOS() {
    if (navigator.geolocation) {
      navigator.geolocation.getCurrentPosition(pos => {
        const t = encodeURIComponent(`SOS from Hope Rideshare! Rider: ${profile?.full_name||''}. Location: https://maps.google.com/?q=${pos.coords.latitude},${pos.coords.longitude}`);
        window.open(`sms:911?body=${t}`);
      }, () => window.open('tel:911'));
    } else window.open('tel:911');
  }

  // SPLASH
  if (view==='splash') return (
    <div style={{ minHeight:'100vh', background:'#121212', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', backgroundImage:`linear-gradient(rgba(18,18,18,0.75),rgba(18,18,18,0.95)),url(${BG})`, backgroundSize:'cover', backgroundPosition:'center', padding:'32px 24px' }}>
      <img src={LOGO} alt="Hope" style={{ width:'200px', borderRadius:'20px', marginBottom:'20px', boxShadow:'0 8px 32px rgba(162,19,93,0.4)' }} />
      <h1 style={{ color:'#fff', margin:'0 0 6px', fontSize:'32px', fontWeight:'900' }}>Hope Rideshare</h1>
      <p style={{ color:'#aaa', margin:'0 0 40px', fontSize:'14px', textAlign:'center' }}>Chattanooga\'s Trusted Rides for Women</p>
      <div style={{ display:'flex', flexDirection:'column', gap:'14px', width:'100%', maxWidth:'320px' }}>
        <button style={S.pinkBtn} onClick={() => { setAuthMode('login'); setView('auth'); }}>Log In</button>
        <button style={{ ...S.grayBtn, padding:'15px', fontSize:'16px', fontWeight:'700' }} onClick={() => { setAuthMode('register'); setView('auth'); }}>Create Account</button>
      </div>
    </div>
  );

  // AUTH
  if (view==='auth') return (
    <div style={{ minHeight:'100vh', backgroundImage:`linear-gradient(rgba(18,18,18,0.82),rgba(18,18,18,0.93)),url(${BG})`, backgroundSize:'cover', backgroundPosition:'center', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', padding:'24px' }}>
      <img src={LOGO} alt="Hope" style={{ width:'130px', borderRadius:'16px', marginBottom:'16px' }} />
      <h2 style={{ color:'#fff', margin:'0 0 4px', fontSize:'22px' }}>Hope Rideshare</h2>
      <p style={{ color:'#aaa', fontSize:'13px', marginBottom:'24px' }}>Chattanooga\'s Trusted Rides for Women</p>
      <div style={{ display:'flex', gap:'8px', marginBottom:'20px' }}>
        <button style={S.tab(authMode==='login')} onClick={() => setAuthMode('login')}>Log In</button>
        <button style={S.tab(authMode==='register')} onClick={() => setAuthMode('register')}>Create Account</button>
      </div>
      <form onSubmit={authMode==='login'?handleLogin:handleSignUp} style={{ display:'flex', flexDirection:'column', gap:'12px', width:'100%', maxWidth:'360px' }}>
        {authMode==='register' && <>
          <input style={S.input} placeholder="Full Name" value={fullName} onChange={e=>setFullName(e.target.value)} required />
          <input style={S.input} type="tel" placeholder="Phone Number" value={phone} onChange={e=>setPhone(e.target.value)} />
        </>}
        <input style={S.input} type="email" placeholder="Email" required value={email} onChange={e=>setEmail(e.target.value)} />
        <input style={S.input} type="password" placeholder="Password" required value={password} onChange={e=>setPassword(e.target.value)} />
        {authMode==='register' && (
          <label style={{ display:'flex', alignItems:'center', gap:'10px', color:'#ccc', fontSize:'13px', cursor:'pointer' }}>
            <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{ width:'18px', height:'18px', accentColor:'#A2135D' }} />
            I agree to the Rider Code of Conduct & Privacy Policy
          </label>
        )}
        {msg && <p style={{ color: msg.startsWith('Check') ? '#4caf50' : '#f06292', fontSize:'13px', margin:0 }}>{msg}</p>}
        <button type="submit" disabled={loading||(authMode==='register'&&!agreed)} style={{ ...S.pinkBtn, opacity:(authMode==='register'&&!agreed)?0.5:1 }}>
          {loading ? '...' : authMode==='login' ? 'Log In' : 'Create Account'}
        </button>
      </form>
      <button onClick={() => setView('splash')} style={{ marginTop:'20px', background:'none', border:'none', color:'#666', cursor:'pointer' }}>Back</button>
    </div>
  );

  // CODE OF CONDUCT
  if (view==='conduct') return (
    <div style={{ minHeight:'100vh', background:'#121212', padding:'24px', fontFamily:'system-ui,sans-serif' }}>
      <div style={{ maxWidth:'480px', margin:'0 auto', display:'flex', flexDirection:'column', gap:'16px' }}>
        <div style={{ textAlign:'center', paddingTop:'20px' }}>
          <img src={LOGO} alt="Hope" style={{ width:'80px', borderRadius:'12px' }} />
          <h2 style={{ color:'#fff', margin:'12px 0 4px' }}>Rider Code of Conduct</h2>
          <p style={{ color:'#aaa', fontSize:'13px', margin:0 }}>Please read and agree before continuing</p>
        </div>
        <div style={{ ...S.card, display:'flex', flexDirection:'column', gap:'14px', maxHeight:'50vh', overflowY:'auto' }}>
          {[['Gender Policy','This service is strictly for women and children (boys under 12). If a male adult is present at pickup, the ride will be cancelled without a refund.'],
            ['Verification','You agree to provide a clear photo of your ID for manual verification. You will not allow others to use your account.'],
            ['Respectful Behavior','No verbal or physical harassment, profanity, or aggressive behavior toward the driver.'],
            ['Child Safety','Parents must provide appropriate car seats/boosters for children as required by Tennessee law.'],
            ['Zero Tolerance','No smoking, vaping, or open containers of alcohol/illegal substances in the vehicle.'],
            ['Right to Refuse','The driver reserves the right to cancel any ride if she feels unsafe or if these terms are violated.'],
            ['Privacy','We collect your name, email, phone, and live GPS (during rides only). We never sell your data.']
          ].map(([t,d]) => (
            <div key={t}><p style={{ margin:'0 0 4px', fontWeight:'700', color:'#E0358D', fontSize:'14px' }}>{t}</p><p style={{ margin:0, color:'#bbb', fontSize:'13px', lineHeight:'1.5' }}>{d}</p></div>
          ))}
        </div>
        <label style={{ display:'flex', alignItems:'center', gap:'12px', color:'#ddd', fontSize:'14px', cursor:'pointer' }}>
          <input type="checkbox" checked={agreed} onChange={e=>setAgreed(e.target.checked)} style={{ width:'20px', height:'20px', accentColor:'#A2135D', flexShrink:0 }} />
          I have read and agree to the Rider Code of Conduct and Privacy Policy
        </label>
        <button style={{ ...S.pinkBtn, opacity:agreed?1:0.4 }} disabled={!agreed} onClick={agreeConduct}>Continue to Hope Rideshare</button>
        <button onClick={signOut} style={{ background:'none', border:'none', color:'#666', cursor:'pointer', fontSize:'13px' }}>Sign Out</button>
      </div>
    </div>
  );

  // SAFETY HUB
  if (showSafety) return (
    <div style={{ minHeight:'100vh', background:'#0d0d0d', padding:'24px', fontFamily:'system-ui,sans-serif' }}>
      <div style={{ maxWidth:'480px', margin:'0 auto', display:'flex', flexDirection:'column', gap:'14px' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <h2 style={{ color:'#fff', margin:0, fontSize:'22px' }}>Safety Hub</h2>
          <button onClick={() => setSafety(false)} style={{ background:'#2a2a2a', border:'none', color:'#fff', borderRadius:'20px', padding:'8px 14px', cursor:'pointer' }}>Close</button>
        </div>
        <button style={S.sosBtn} onClick={triggerSOS}>SOS — Emergency Alert</button>
        <p style={{ color:'#888', fontSize:'12px', textAlign:'center', margin:'-4px 0 0' }}>Sends your GPS location to 911 via SMS</p>
        <div style={S.card}>
          <p style={{ margin:'0 0 10px', fontWeight:'700', color:'#E0358D' }}>Share My Trip</p>
          <p style={{ margin:'0 0 12px', color:'#bbb', fontSize:'13px' }}>Send your trip details to a trusted contact.</p>
          <button style={S.grayBtn} onClick={() => { const t=encodeURIComponent('I am on a Hope Rideshare trip: https://hope-rideshare.netlify.app'); window.open(`sms:?body=${t}`); }}>Share Trip via SMS</button>
        </div>
        {activeRide && (
          <div style={{ ...S.card, border:'1px solid #A2135D' }}>
            <p style={{ margin:'0 0 8px', fontWeight:'700', color:'#E0358D' }}>Your Active Ride</p>
            <p style={{ margin:'0 0 2px', color:'#ccc', fontSize:'13px' }}>From: {activeRide.pickup_address}</p>
            <p style={{ margin:'0 0 10px', color:'#ccc', fontSize:'13px' }}>To: {activeRide.dropoff_address}</p>
            <div style={{ padding:'10px', background:'#2a2a2a', borderRadius:'10px' }}>
              <p style={{ margin:'0 0 2px', fontWeight:'700', color:'#fff', fontSize:'13px' }}>Hope Schiesser — Your Driver</p>
              <p style={{ margin:0, color:'#aaa', fontSize:'12px' }}>Women-Only Pilot · Verified Driver</p>
            </div>
          </div>
        )}
        <div style={S.card}>
          <p style={{ margin:'0 0 10px', fontWeight:'700', color:'#E0358D' }}>Safety Guidelines</p>
          {['Verify the driver matches the app profile before entering','Keep your seatbelt on at all times','Trust your instincts — you can cancel at any time','Note the car make, model, and license plate'].map(t => (
            <p key={t} style={{ margin:'0 0 6px', color:'#bbb', fontSize:'13px' }}>✓ {t}</p>
          ))}
        </div>
      </div>
    </div>
  );

  // RIDER
  if (view==='rider') {
    const firstName = profile?.full_name?.split(' ')[0] || 'there';
    const fare = calcFare(pickup, dropoff, hasPet, stops.filter(Boolean).length);
    return (
      <div style={{ minHeight:'100vh', background:'#121212', fontFamily:'system-ui,sans-serif' }}>
        <div style={{ background:'#0d0d0d', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #222', position:'sticky', top:0, zIndex:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <img src={LOGO} alt="Hope" style={{ width:'38px', height:'38px', borderRadius:'8px', objectFit:'cover' }} />
            <span style={{ color:'#fff', fontWeight:'800', fontSize:'15px' }}>Hope</span>
          </div>
          <div style={{ display:'flex', gap:'8px' }}>
            <button onClick={() => setSafety(true)} style={{ background:'rgba(162,19,93,0.2)', border:'1px solid #A2135D', color:'#E0358D', borderRadius:'20px', padding:'7px 13px', fontWeight:'700', fontSize:'13px', cursor:'pointer' }}>Shield Safety</button>
            <button onClick={signOut} style={{ background:'#2a2a2a', border:'none', color:'#999', borderRadius:'20px', padding:'7px 12px', fontSize:'12px', cursor:'pointer' }}>Sign Out</button>
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px', padding:'12px 16px', overflowX:'auto', background:'#0d0d0d', borderBottom:'1px solid #1a1a1a' }}>
          {['home','book','schedule','history','profile'].map(t => (
            <button key={t} style={S.tab(riderTab===t)} onClick={() => setRiderTab(t)}>
              {t==='home'?'Home':t==='book'?'Book Ride':t==='schedule'?'Schedule':t==='history'?'History':'Profile'}
            </button>
          ))}
        </div>
        <div style={{ padding:'16px', maxWidth:'480px', margin:'0 auto', display:'flex', flexDirection:'column', gap:'12px' }}>
          {activeRide && (
            <div style={{ ...S.card, background:'rgba(162,19,93,0.15)', border:'2px solid #A2135D' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'8px' }}>
                <p style={{ margin:0, fontWeight:'800', color:'#E0358D', fontSize:'15px' }}>Ride in Progress</p>
                <button onClick={() => setSafety(true)} style={{ background:'#d32f2f', border:'none', color:'#fff', borderRadius:'8px', padding:'5px 10px', fontSize:'12px', cursor:'pointer', fontWeight:'700' }}>SOS</button>
              </div>
              <p style={{ margin:'0 0 4px', fontSize:'13px', color:'#ccc' }}>Status: <strong style={{ color:'#E0358D' }}>{activeRide.status.replace('_',' ').toUpperCase()}</strong></p>
              <p style={{ margin:0, fontSize:'13px', color:'#aaa' }}>From: {activeRide.pickup_address} → To: {activeRide.dropoff_address}</p>
              <div style={{ marginTop:'10px', padding:'10px', background:'#1a1a1a', borderRadius:'10px' }}>
                <p style={{ margin:0, color:'#fff', fontWeight:'700', fontSize:'13px' }}>Hope Schiesser — Your Driver</p>
                <p style={{ margin:'2px 0 0', color:'#aaa', fontSize:'12px' }}>Women-Only Pilot · ETA ~15 min</p>
              </div>
            </div>
          )}

          {riderTab==='home' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <div><h2 style={{ margin:'0 0 4px', fontSize:'26px', fontWeight:'900', color:'#fff' }}>Hello, {firstName}</h2><p style={{ margin:0, color:'#888', fontSize:'14px' }}>Where are you headed today?</p></div>
              <div style={{ ...S.card, display:'flex', flexDirection:'column', gap:'10px' }}>
                <input style={S.input} placeholder="Pickup address" value={pickup} onChange={e=>setPickup(e.target.value)} />
                <input style={S.input} placeholder="Where to?" value={dropoff} onChange={e=>setDropoff(e.target.value)} />
                <button style={S.pinkBtn} onClick={() => setRiderTab('book')}>Request a Ride</button>
              </div>
              <p style={{ margin:'4px 0 0', fontWeight:'700', fontSize:'11px', color:'#666', letterSpacing:'1px' }}>QUICK SHORTCUTS</p>
              <div style={{ display:'flex', gap:'10px' }}>
                <button style={{ ...S.grayBtn, flex:1, textAlign:'left', padding:'14px' }} onClick={() => { setDropoff('Home'); setRiderTab('book'); }}>Home</button>
                <button style={{ ...S.grayBtn, flex:1, textAlign:'left', padding:'14px' }} onClick={() => { setDropoff('Work'); setRiderTab('book'); }}>Work</button>
              </div>
              <div style={{ display:'flex', gap:'10px' }}>
                <div style={S.stat('rgba(162,19,93,0.2)')}><p style={{ margin:0, fontSize:'22px', fontWeight:'900', color:'#A2135D' }}>{rideHistory.length}</p><p style={{ margin:'4px 0 0', fontSize:'11px', color:'#888' }}>Rides</p></div>
                <div style={S.stat()}><p style={{ margin:0, fontSize:'22px', fontWeight:'900', color:'#f5c518' }}>5.0</p><p style={{ margin:'4px 0 0', fontSize:'11px', color:'#888' }}>Rating</p></div>
                <div style={S.stat()}><p style={{ margin:0, fontSize:'22px', fontWeight:'900', color:'#E0358D' }}>Verified</p><p style={{ margin:'4px 0 0', fontSize:'11px', color:'#888' }}>Status</p></div>
              </div>
              <button style={S.sosBtn} onClick={triggerSOS}>SOS — Emergency Alert</button>
            </div>
          )}

          {riderTab==='book' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <h3 style={{ margin:0, color:'#fff', fontWeight:'800', fontSize:'20px' }}>Request Your Ride</h3>
              <div style={S.card}>
                <input style={{ ...S.input, marginBottom:'8px' }} placeholder="Pickup Address" value={pickup} onChange={e=>setPickup(e.target.value)} />
                {stops.map((stop,i) => (
                  <div key={i} style={{ display:'flex', gap:'8px', marginBottom:'8px' }}>
                    <input style={{ ...S.input, flex:1 }} placeholder={`Stop ${i+1}`} value={stop} onChange={e=>{ const a=[...stops]; a[i]=e.target.value; setStops(a); }} />
                    <button onClick={() => setStops(stops.filter((_,j)=>j!==i))} style={{ background:'#333', border:'none', color:'#f06292', borderRadius:'8px', padding:'8px 12px', cursor:'pointer' }}>x</button>
                  </div>
                ))}
                <input style={{ ...S.input, marginBottom:'8px' }} placeholder="Dropoff Address" value={dropoff} onChange={e=>setDropoff(e.target.value)} />
                <div style={{ display:'flex', gap:'8px' }}>
                  {stops.length < 2 && <button style={{ ...S.grayBtn, flex:1 }} onClick={() => setStops([...stops,''])}>+ Stop</button>}
                  <label style={{ ...S.grayBtn, display:'flex', alignItems:'center', gap:'8px', flex:1, justifyContent:'center', cursor:'pointer' }}>
                    <input type="checkbox" checked={hasPet} onChange={e=>setHasPet(e.target.checked)} style={{ accentColor:'#A2135D' }} />Pet (+$5)
                  </label>
                </div>
              </div>
              <div style={{ ...S.card, border:'2px solid #A2135D' }}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <div><p style={{ margin:'0 0 2px', fontWeight:'800', color:'#fff', fontSize:'15px' }}>Women-Only Pilot Ride</p><p style={{ margin:0, color:'#aaa', fontSize:'12px' }}>Verified female driver · Safe & private</p></div>
                  <div style={{ textAlign:'right' }}><p style={{ margin:0, fontWeight:'900', color:'#E0358D', fontSize:'20px' }}>${fare.total}</p><p style={{ margin:0, color:'#666', fontSize:'11px' }}>est. fare</p></div>
                </div>
              </div>
              <div style={S.card}>
                <p style={{ margin:'0 0 10px', fontWeight:'700', color:'#E0358D', fontSize:'13px' }}>FARE BREAKDOWN</p>
                {[['Base Fare','$'+fare.base.toFixed(2)],['Distance (~2mi)','$'+fare.dist],['Duration (~4min)','$'+fare.dur],hasPet&&['Pet Fee','$'+fare.pet],stops.filter(Boolean).length>0&&['Extra Stops','$'+fare.stops]].filter(Boolean).map(([k,v]) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}><span style={{ color:'#aaa', fontSize:'13px' }}>{k}</span><span style={{ color:'#fff', fontSize:'13px' }}>{v}</span></div>
                ))}
                <div style={{ borderTop:'1px solid #333', paddingTop:'10px', display:'flex', justifyContent:'space-between' }}>
                  <span style={{ color:'#fff', fontWeight:'800', fontSize:'15px' }}>Total</span>
                  <span style={{ color:'#E0358D', fontWeight:'900', fontSize:'18px' }}>${fare.total}</span>
                </div>
              </div>
              {msg && <p style={{ color:'#f06292', fontSize:'13px', margin:0, textAlign:'center' }}>{msg}</p>}
              <button style={S.pinkBtn} onClick={requestRide} disabled={loading}>{loading ? 'Processing...' : `Request & Pay $${fare.total}`}</button>
            </div>
          )}

          {riderTab==='schedule' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <h3 style={{ margin:0, color:'#fff', fontWeight:'800' }}>Schedule a Ride</h3>
              <div style={S.card}>
                <input style={{ ...S.input, marginBottom:'8px' }} placeholder="Pickup Address" />
                <input style={{ ...S.input, marginBottom:'8px' }} placeholder="Dropoff Address" />
                <input type="datetime-local" style={{ ...S.input, marginBottom:'8px', colorScheme:'dark' }} min={new Date().toISOString().slice(0,16)} />
                <button style={S.pinkBtn}>Schedule Ride</button>
              </div>
              <div style={{ ...S.card, textAlign:'center' }}><p style={{ margin:0, color:'#666', fontSize:'13px' }}>No scheduled rides yet</p></div>
            </div>
          )}

          {riderTab==='history' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <h3 style={{ margin:0, color:'#fff', fontWeight:'800' }}>Ride History</h3>
              {rideHistory.length===0 ? <div style={{ ...S.card, textAlign:'center' }}><p style={{ margin:0, color:'#666' }}>No rides yet. Book your first ride!</p></div>
               : rideHistory.map(r => (
                <div key={r.id} style={S.card}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                    <span style={{ color:'#E0358D', fontWeight:'700', fontSize:'13px', textTransform:'uppercase' }}>{r.status}</span>
                    <span style={{ color:'#E0358D', fontWeight:'800' }}>${r.fare_total?.toFixed(2)||'--'}</span>
                  </div>
                  <p style={{ margin:'0 0 2px', color:'#ccc', fontSize:'13px' }}>From: {r.pickup_address}</p>
                  <p style={{ margin:0, color:'#aaa', fontSize:'13px' }}>To: {r.dropoff_address}</p>
                  <p style={{ margin:'6px 0 0', color:'#555', fontSize:'11px' }}>{new Date(r.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          )}

          {riderTab==='profile' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <h3 style={{ margin:0, color:'#fff', fontWeight:'800' }}>My Profile</h3>
              <div style={{ ...S.card, textAlign:'center' }}>
                <div style={{ width:'70px', height:'70px', borderRadius:'50%', background:'linear-gradient(135deg,#A2135D,#E0358D)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', fontSize:'28px', color:'#fff', fontWeight:'800' }}>{profile?.full_name?.[0]||'?'}</div>
                <p style={{ margin:'0 0 4px', color:'#fff', fontWeight:'800', fontSize:'18px' }}>{profile?.full_name||'Rider'}</p>
                <p style={{ margin:'0 0 4px', color:'#aaa', fontSize:'13px' }}>{session?.user?.email}</p>
                <p style={{ margin:0, color:'#aaa', fontSize:'13px' }}>{profile?.phone||'No phone added'}</p>
              </div>
              <div style={S.card}>
                {[['Account Status','Active'],['Terms Agreed','Yes'],['Total Rides',rideHistory.length]].map(([k,v]) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}><span style={{ color:'#aaa', fontSize:'13px' }}>{k}</span><span style={{ color:'#4caf50', fontWeight:'700', fontSize:'13px' }}>{v}</span></div>
                ))}
              </div>
              <button style={{ ...S.grayBtn, color:'#f06292' }} onClick={signOut}>Sign Out</button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // DRIVER
  if (view==='driver') {
    const pendingList = pending.filter(r=>r.status==='pending');
    const activeList  = pending.filter(r=>r.status==='accepted');
    return (
      <div style={{ minHeight:'100vh', background:'#121212', fontFamily:'system-ui,sans-serif' }}>
        <div style={{ background:'#0d0d0d', padding:'14px 20px', display:'flex', alignItems:'center', justifyContent:'space-between', borderBottom:'1px solid #222', position:'sticky', top:0, zIndex:10 }}>
          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
            <img src={LOGO} alt="Hope" style={{ width:'38px', height:'38px', borderRadius:'8px', objectFit:'cover' }} />
            <div><p style={{ margin:0, color:'#fff', fontWeight:'800', fontSize:'14px' }}>Driver Console</p><p style={{ margin:0, color:'#888', fontSize:'11px' }}>Hope Rideshare Admin</p></div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:'8px', background:'#1E1E1E', borderRadius:'20px', padding:'6px 12px' }}>
              <div style={{ width:'8px', height:'8px', borderRadius:'50%', background:isOnline?'#4caf50':'#666' }} />
              <span style={{ color:isOnline?'#4caf50':'#888', fontSize:'12px', fontWeight:'700' }}>{isOnline?'ONLINE':'OFFLINE'}</span>
              <button onClick={() => setOnline(!isOnline)} style={{ background:isOnline?'#2e7d32':'#A2135D', border:'none', color:'#fff', borderRadius:'12px', padding:'4px 10px', fontSize:'11px', cursor:'pointer', fontWeight:'700' }}>{isOnline?'Go Offline':'Go Online'}</button>
            </div>
            <button onClick={signOut} style={{ background:'#2a2a2a', border:'none', color:'#999', borderRadius:'20px', padding:'7px 12px', fontSize:'12px', cursor:'pointer' }}>Out</button>
          </div>
        </div>
        <div style={{ display:'flex', gap:'8px', padding:'12px 16px', overflowX:'auto', background:'#0d0d0d', borderBottom:'1px solid #1a1a1a' }}>
          {['requests','active','earnings','map'].map(t => (
            <button key={t} style={S.tab(driverTab===t)} onClick={() => setDriverTab(t)}>
              {t==='requests'?`Requests${pendingList.length>0?` (${pendingList.length})`:''}`:t==='active'?'Active':t==='earnings'?'Earnings':'Map'}
            </button>
          ))}
        </div>
        <div style={{ padding:'16px', maxWidth:'480px', margin:'0 auto', display:'flex', flexDirection:'column', gap:'12px' }}>
          <div style={{ display:'flex', gap:'10px' }}>
            {[['Pending',stats.pending],["Today's",stats.today],['Done',stats.completed],['$',stats.earnings]].map(([label,val]) => (
              <div key={label} style={S.stat()}><p style={{ margin:0, fontWeight:'900', color:'#E0358D', fontSize:'18px' }}>{label==='$'?`$${stats.earnings.toFixed(0)}`:val}</p><p style={{ margin:'4px 0 0', fontSize:'10px', color:'#666' }}>{label}</p></div>
            ))}
          </div>

          {driverTab==='requests' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <h3 style={{ margin:0, color:'#fff', fontWeight:'800' }}>Incoming Requests</h3>
                <button onClick={() => { fetchPending(); fetchStats(); }} style={{ background:'#2a2a2a', border:'none', color:'#aaa', borderRadius:'8px', padding:'6px 10px', fontSize:'12px', cursor:'pointer' }}>Refresh</button>
              </div>
              {pendingList.length===0
                ? <div style={{ ...S.card, textAlign:'center' }}><p style={{ margin:0, color:'#666' }}>{isOnline?'No pending requests':'Go Online to receive ride requests'}</p></div>
                : pendingList.map(r => (
                  <div key={r.id} style={{ ...S.card, border:'1px solid #333' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', marginBottom:'8px' }}>
                      <p style={{ margin:0, fontWeight:'800', color:'#fff', fontSize:'15px' }}>{r.rider_name||'Rider'}</p>
                      <span style={{ color:'#E0358D', fontWeight:'900', fontSize:'16px' }}>${r.fare_total?.toFixed(2)}</span>
                    </div>
                    <p style={{ margin:'0 0 2px', color:'#ccc', fontSize:'13px' }}>From: {r.pickup_address}</p>
                    <p style={{ margin:'0 0 10px', color:'#aaa', fontSize:'13px' }}>To: {r.dropoff_address}</p>
                    {r.has_pet && <p style={{ margin:'0 0 10px', color:'#aaa', fontSize:'12px' }}>Has Pet</p>}
                    <div style={{ display:'flex', gap:'8px' }}>
                      <button style={{ ...S.pinkBtn, flex:1, padding:'11px' }} onClick={() => updateStatus(r.id,'accepted')}>Accept</button>
                      <button style={{ ...S.grayBtn, flex:1, padding:'11px' }} onClick={() => updateStatus(r.id,'cancelled')}>Decline</button>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {driverTab==='active' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <h3 style={{ margin:0, color:'#fff', fontWeight:'800' }}>Active Rides</h3>
              {activeList.length===0
                ? <div style={{ ...S.card, textAlign:'center' }}><p style={{ margin:0, color:'#666' }}>No active rides</p></div>
                : activeList.map(r => (
                  <div key={r.id} style={{ ...S.card, border:'2px solid #A2135D' }}>
                    <p style={{ margin:'0 0 6px', fontWeight:'800', color:'#E0358D' }}>Active — {r.rider_name}</p>
                    <p style={{ margin:'0 0 2px', color:'#ccc', fontSize:'13px' }}>From: {r.pickup_address}</p>
                    <p style={{ margin:'0 0 12px', color:'#aaa', fontSize:'13px' }}>To: {r.dropoff_address}</p>
                    <div style={{ display:'flex', gap:'8px' }}>
                      <button style={{ ...S.pinkBtn, flex:1, padding:'11px' }} onClick={() => updateStatus(r.id,'en_route')}>En Route</button>
                      <button style={{ ...S.pinkBtn, flex:1, padding:'11px', background:'#2e7d32' }} onClick={() => updateStatus(r.id,'completed')}>Complete</button>
                    </div>
                  </div>
                ))
              }
            </div>
          )}

          {driverTab==='earnings' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <h3 style={{ margin:0, color:'#fff', fontWeight:'800' }}>Earnings Summary</h3>
              <div style={{ ...S.card, textAlign:'center' }}>
                <p style={{ margin:'0 0 4px', color:'#888', fontSize:'12px', letterSpacing:'1px' }}>NET TAKE-HOME TODAY</p>
                <p style={{ margin:0, fontWeight:'900', fontSize:'42px', color:'#E0358D' }}>${(stats.earnings*0.80).toFixed(2)}</p>
                <p style={{ margin:'4px 0 0', color:'#555', fontSize:'13px' }}>After 20% platform fee</p>
              </div>
              <div style={S.card}>
                {[['Gross Fares',`$${stats.earnings.toFixed(2)}`],['Platform Fee (20%)',`-$${(stats.earnings*0.20).toFixed(2)}`],['You Keep',`$${(stats.earnings*0.80).toFixed(2)}`]].map(([k,v],i) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', paddingBottom:i<2?'8px':'0', borderBottom:i<2?'1px solid #2a2a2a':'none', marginBottom:i<2?'8px':'0' }}>
                    <span style={{ color:'#aaa', fontSize:'13px' }}>{k}</span>
                    <span style={{ color:i===2?'#E0358D':'#fff', fontWeight:i===2?'900':'600', fontSize:'13px' }}>{v}</span>
                  </div>
                ))}
              </div>
              <div style={S.card}>
                {[["Today's Rides",stats.today],['Completed',stats.completed],['Pending',stats.pending]].map(([k,v]) => (
                  <div key={k} style={{ display:'flex', justifyContent:'space-between', marginBottom:'6px' }}>
                    <span style={{ color:'#aaa', fontSize:'13px' }}>{k}</span>
                    <span style={{ color:'#fff', fontWeight:'700', fontSize:'13px' }}>{v}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {driverTab==='map' && (
            <div style={{ display:'flex', flexDirection:'column', gap:'12px' }}>
              <h3 style={{ margin:0, color:'#fff', fontWeight:'800' }}>Live Map — Chattanooga</h3>
              <div style={{ borderRadius:'16px', overflow:'hidden', border:'1px solid #333' }}>
                <iframe title="Map" width="100%" height="340" style={{ border:'none', display:'block' }}
                  src="https://www.openstreetmap.org/export/embed.html?bbox=-85.45%2C34.95%2C-85.15%2C35.15&layer=mapnik" allowFullScreen />
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return null;
}
