
import { useState, useEffect, createContext, useContext, useReducer, useCallback, useRef } from "react";
import {
  BarChart, Bar, AreaChart, Area, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
} from "recharts";
import {
  Home, CreditCard, Target, BarChart2, Wallet, Bell, Settings,
  Plus, X, Trash2, Check, Moon, Sun, Search, Download,
  TrendingUp, TrendingDown, Repeat, ChevronDown, Menu,
  AlertTriangle, RefreshCw,
} from "lucide-react";

// ─────────────────────────────────────────────────────────
// CONSTANTS
// ─────────────────────────────────────────────────────────

const EXPENSE_CATS = [
  "Food & Groceries","Matatu/Transport","Boda Boda","Fuel",
  "Rent/Housing","Utilities (KPLC, Water)","Airtime & Data",
  "Entertainment","Health/Clinic","Clothing","Education",
  "NHIF","NSSF","Loan Repayment","Till Number Payment",
  "Savings Transfer","Other",
];
const INCOME_CATS = [
  "Salary","Business","Freelance","M-Pesa Received",
  "Side Hustle","Rental Income","Other Income",
];
const ACCOUNTS = [
  { value:"mpesa",  label:"M-Pesa" },
  { value:"cash",   label:"Cash" },
  { value:"bank",   label:"Bank Account" },
  { value:"airtel", label:"Airtel Money" },
  { value:"tkash",  label:"T-Kash" },
  { value:"kcb",    label:"KCB M-Pesa" },
  { value:"equity", label:"Equity Eazzy" },
];
const FALLBACK_RATE = 129;
const CHART_COLORS = ["#0A5C36","#F5A623","#22C55E","#EF4444","#6366F1","#EC4899","#14B8A6"];

// ─────────────────────────────────────────────────────────
// UTILITIES
// ─────────────────────────────────────────────────────────

const uid = () => Math.random().toString(36).slice(2,9) + Date.now().toString(36);

function getMonthKey(d) {
  const dt = new Date(d);
  return `${dt.getFullYear()}-${String(dt.getMonth()+1).padStart(2,"0")}`;
}
const thisMonth = () => getMonthKey(new Date());

function monthLabel(key) {
  const [y,m] = key.split("-");
  return new Date(+y, +m-1).toLocaleDateString("en-KE",{month:"short",year:"2-digit"});
}

function lastNMonths(n) {
  const out = [];
  for (let i = n-1; i >= 0; i--) {
    const d = new Date(); d.setMonth(d.getMonth()-i);
    out.push(getMonthKey(d));
  }
  return out;
}

function fmtDate(s) {
  return new Date(s).toLocaleDateString("en-KE",{day:"numeric",month:"short",year:"numeric"});
}

function daysUntil(s) {
  return Math.ceil((new Date(s) - new Date()) / 86400000);
}

function parseMpesa(sms) {
  const t = sms.trim();
  const amtM = t.match(/Ksh\s*([\d,]+\.?\d*)/i);
  const amount = amtM ? parseFloat(amtM[1].replace(/,/g,"")) : null;
  let description = "", type = "expense";
  if (/you have received/i.test(t)) {
    type = "income";
    const m = t.match(/received Ksh[\d,.]+ from ([A-Z][A-Z\s]+)/i);
    description = m ? `Received from ${m[1].trim()}` : "M-Pesa Received";
  } else if (/sent to/i.test(t)) {
    const m = t.match(/sent to ([A-Z][A-Z\s]+)/i);
    description = m ? `Sent to ${m[1].trim()}` : "M-Pesa Transfer";
  } else if (/paid to/i.test(t)) {
    const m = t.match(/paid to ([A-Z][A-Z\s]+)/i);
    description = m ? `Paid to ${m[1].trim()}` : "Bill Payment";
  } else if (/airtime/i.test(t)) {
    description = "Airtime Purchase";
  } else if (/buy goods|till/i.test(t)) {
    description = "Till Payment";
  }
  return { amount, description, type };
}

function kenyaTax(gross) {
  let paye = 0;
  if (gross <= 24000) paye = gross * 0.10;
  else if (gross <= 32333) paye = 2400 + (gross - 24000) * 0.25;
  else paye = 2400 + 2083.25 + (gross - 32333) * 0.30;
  paye = Math.max(0, paye - 2400);
  let nhif = 150;
  if (gross >= 100000) nhif = 1700; else if (gross >= 90000) nhif = 1600;
  else if (gross >= 80000) nhif = 1500; else if (gross >= 70000) nhif = 1400;
  else if (gross >= 60000) nhif = 1300; else if (gross >= 50000) nhif = 1200;
  else if (gross >= 45000) nhif = 1100; else if (gross >= 40000) nhif = 1000;
  else if (gross >= 35000) nhif = 950;  else if (gross >= 30000) nhif = 900;
  else if (gross >= 25000) nhif = 850;  else if (gross >= 20000) nhif = 750;
  else if (gross >= 15000) nhif = 600;  else if (gross >= 12000) nhif = 500;
  else if (gross >= 8000)  nhif = 400;  else if (gross >= 6000)  nhif = 300;
  const t1 = Math.min(gross,6000)*0.06;
  const t2 = Math.min(Math.max(gross-6000,0),12000)*0.06;
  const nssf = t1+t2;
  const total = paye+nhif+nssf;
  return { paye, nhif, nssf, total, net: gross-total };
}

function axisK(v) {
  if (v >= 1e6) return `${(v/1e6).toFixed(1)}M`;
  if (v >= 1e3) return `${(v/1e3).toFixed(0)}K`;
  return v;
}

// ─────────────────────────────────────────────────────────
// CONTEXTS
// ─────────────────────────────────────────────────────────

const ThemeCtx    = createContext(null);
const CurrencyCtx = createContext(null);
const AppCtx      = createContext(null);
const ToastCtx    = createContext(null);

const useTheme    = () => useContext(ThemeCtx);
const useCurrency = () => useContext(CurrencyCtx);
const useApp      = () => useContext(AppCtx);
const useToast    = () => useContext(ToastCtx);

// ─────────────────────────────────────────────────────────
// REDUCER
// ─────────────────────────────────────────────────────────

const init = { transactions:[], budgets:[], goals:[], bills:[], debts:[] };

function reducer(state, { type, payload }) {
  switch(type) {
    case "ADD_TX":    return {...state, transactions:[payload,...state.transactions]};
    case "DEL_TX":    return {...state, transactions:state.transactions.filter(t=>t.id!==payload)};
    case "ADD_BDG":   return {...state, budgets:[payload,...state.budgets]};
    case "DEL_BDG":   return {...state, budgets:state.budgets.filter(b=>b.id!==payload)};
    case "ADD_GOAL":  return {...state, goals:[payload,...state.goals]};
    case "DEL_GOAL":  return {...state, goals:state.goals.filter(g=>g.id!==payload)};
    case "CONTRIB":
      return {...state, goals:state.goals.map(g=>g.id===payload.id
        ?{...g,currentAmount:g.currentAmount+payload.amount,contributions:[...g.contributions,{date:new Date().toISOString(),amount:payload.amount}]}
        :g)};
    case "ADD_BILL":  return {...state, bills:[payload,...state.bills]};
    case "DEL_BILL":  return {...state, bills:state.bills.filter(b=>b.id!==payload)};
    case "TOGGLE_BILL": return {...state, bills:state.bills.map(b=>b.id===payload?{...b,isPaid:!b.isPaid}:b)};
    case "ADD_DEBT":  return {...state, debts:[payload,...state.debts]};
    case "DEL_DEBT":  return {...state, debts:state.debts.filter(d=>d.id!==payload)};
    case "PAY_DEBT":
      return {...state, debts:state.debts.map(d=>d.id===payload.id
        ?{...d,remainingAmount:Math.max(0,d.remainingAmount-payload.amount),payments:[...d.payments,{date:new Date().toISOString(),amount:payload.amount}]}
        :d)};
    case "CLEAR": return init;
    default: return state;
  }
}

// ─────────────────────────────────────────────────────────
// PROVIDERS
// ─────────────────────────────────────────────────────────

function ThemeProvider({children}) {
  const [theme, setTheme] = useState("light");
  const toggle = useCallback(()=>setTheme(t=>t==="light"?"dark":"light"),[]);
  return <ThemeCtx.Provider value={{theme,toggle}}>{children}</ThemeCtx.Provider>;
}

function CurrencyProvider({children}) {
  const [currency, setCurrencyState] = useState("KES");
  const [rate, setRate] = useState(FALLBACK_RATE);
  const [updatedAt, setUpdatedAt] = useState(null);
  const [offline, setOffline] = useState(true);

  useEffect(()=>{
    (async()=>{
      try {
        const r = await fetch("https://open.er-api.com/v6/latest/USD");
        const d = await r.json();
        if(d.rates?.KES){ setRate(d.rates.KES); setUpdatedAt(new Date()); setOffline(false); }
      } catch {}
    })();
  },[]);

  const setCurrency = useCallback(c=>setCurrencyState(c),[]);

  const fmt = useCallback((kes)=>{
    if(currency==="USD") return `$${(kes/rate).toLocaleString("en-US",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
    return `KES ${Number(kes).toLocaleString("en-KE",{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  },[currency,rate]);

  const toKES  = useCallback((v)=> currency==="USD" ? v*rate : v, [currency,rate]);
  const toDisp = useCallback((v)=> currency==="USD" ? v/rate : v, [currency,rate]);

  const minutesAgo = updatedAt ? Math.floor((Date.now()-updatedAt)/60000) : null;

  return (
    <CurrencyCtx.Provider value={{currency,setCurrency,rate,offline,minutesAgo,fmt,toKES,toDisp}}>
      {children}
    </CurrencyCtx.Provider>
  );
}

function ToastProvider({children}) {
  const [toasts,setToasts] = useState([]);
  const add = useCallback((msg, kind="ok")=>{
    const id=uid();
    setToasts(p=>[...p,{id,msg,kind}]);
    setTimeout(()=>setToasts(p=>p.filter(t=>t.id!==id)),3000);
  },[]);
  const bg = {ok:"#0A5C36",err:"#EF4444",info:"#F5A623"};
  return (
    <ToastCtx.Provider value={add}>
      {children}
      <div style={{position:"fixed",bottom:90,right:16,zIndex:9999,display:"flex",flexDirection:"column",gap:8}}>
        {toasts.map(t=>(
          <div key={t.id} style={{
            padding:"10px 16px",borderRadius:10,
            backgroundColor:bg[t.kind]||bg.ok,
            color:"#fff",fontSize:13,fontFamily:"DM Sans,sans-serif",
            boxShadow:"0 4px 16px rgba(0,0,0,0.25)",
            animation:"toastIn 0.25s ease",maxWidth:280,
          }}>{t.msg}</div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// ─────────────────────────────────────────────────────────
// BASE UI COMPONENTS
// ─────────────────────────────────────────────────────────

function Card({children,style={}}) {
  const {theme} = useTheme();
  return (
    <div style={{
      backgroundColor:theme==="dark"?"rgba(26,46,32,0.85)":"rgba(255,255,255,0.9)",
      backdropFilter:"blur(12px)",borderRadius:16,padding:20,
      boxShadow:theme==="dark"?"0 4px 24px rgba(0,0,0,0.4)":"0 2px 20px rgba(10,92,54,0.07)",
      border:`1px solid ${theme==="dark"?"rgba(255,255,255,0.06)":"rgba(10,92,54,0.09)"}`,
      ...style,
    }}>{children}</div>
  );
}

function Btn({children,onClick,v="primary",size="md",style={},disabled=false}) {
  const pad  = size==="sm"?"6px 13px":size==="lg"?"13px 26px":"10px 18px";
  const fs   = size==="sm"?13:size==="lg"?15:14;
  const vars = {
    primary:{background:"#0A5C36",color:"#fff",border:"none"},
    accent: {background:"#F5A623",color:"#fff",border:"none"},
    danger: {background:"#EF4444",color:"#fff",border:"none"},
    ghost:  {background:"transparent",color:"#0A5C36",border:"1.5px solid #0A5C36"},
  };
  return (
    <button onClick={disabled?undefined:onClick} disabled={disabled} style={{
      ...vars[v]||vars.primary, padding:pad, fontSize:fs,
      borderRadius:10,cursor:disabled?"not-allowed":"pointer",
      fontFamily:"DM Sans,sans-serif",fontWeight:600,opacity:disabled?0.6:1,
      display:"inline-flex",alignItems:"center",gap:6,transition:"opacity 0.15s",
      ...style,
    }}>{children}</button>
  );
}

function Fld({label,value,onChange,type="text",placeholder="",helper="",required=false,style={}}) {
  const {theme} = useTheme();
  const inputStyle = {
    width:"100%",padding:"10px 14px",borderRadius:10,
    border:`1.5px solid ${theme==="dark"?"rgba(255,255,255,0.12)":"#E5E7EB"}`,
    backgroundColor:theme==="dark"?"rgba(255,255,255,0.05)":"#FAFAFA",
    color:theme==="dark"?"#F9FAFB":"#111827",
    fontSize:14,fontFamily:"DM Sans,sans-serif",outline:"none",boxSizing:"border-box",
  };
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4,...style}}>
      {label&&<label style={{fontSize:13,fontWeight:600,color:theme==="dark"?"#9CA3AF":"#374151"}}>{label}{required?" *":""}</label>}
      {type==="textarea"
        ? <textarea value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder}
            style={{...inputStyle,height:100,resize:"vertical"}} />
        : <input type={type} value={value} onChange={e=>onChange(e.target.value)} placeholder={placeholder} style={inputStyle}/>
      }
      {helper&&<span style={{fontSize:12,color:"#9CA3AF"}}>{helper}</span>}
    </div>
  );
}

function Sel({label,value,onChange,opts,style={}}) {
  const {theme} = useTheme();
  return (
    <div style={{display:"flex",flexDirection:"column",gap:4,...style}}>
      {label&&<label style={{fontSize:13,fontWeight:600,color:theme==="dark"?"#9CA3AF":"#374151"}}>{label}</label>}
      <select value={value} onChange={e=>onChange(e.target.value)} style={{
        padding:"10px 14px",borderRadius:10,
        border:`1.5px solid ${theme==="dark"?"rgba(255,255,255,0.12)":"#E5E7EB"}`,
        backgroundColor:theme==="dark"?"rgba(255,255,255,0.05)":"#FAFAFA",
        color:theme==="dark"?"#F9FAFB":"#111827",
        fontSize:14,fontFamily:"DM Sans,sans-serif",cursor:"pointer",
      }}>
        {opts.map(o=><option key={o.value||o} value={o.value||o}>{o.label||o}</option>)}
      </select>
    </div>
  );
}

function Modal({title,children,isOpen,onClose}) {
  const {theme} = useTheme();
  if(!isOpen) return null;
  return (
    <div style={{
      position:"fixed",inset:0,zIndex:1000,
      background:"rgba(0,0,0,0.55)",
      display:"flex",alignItems:"center",justifyContent:"center",padding:16,
    }} onClick={onClose}>
      <div style={{
        backgroundColor:theme==="dark"?"#1A2E20":"#fff",
        borderRadius:20,padding:"24px 24px 28px",
        width:"100%",maxWidth:480,maxHeight:"88vh",overflowY:"auto",
        boxShadow:"0 24px 64px rgba(0,0,0,0.35)",
      }} onClick={e=>e.stopPropagation()}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:20}}>
          <h3 style={{margin:0,fontFamily:"DM Serif Display,serif",fontSize:20,color:theme==="dark"?"#F9FAFB":"#111827"}}>{title}</h3>
          <button onClick={onClose} style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF",padding:4,display:"flex"}}>
            <X size={20}/>
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function Progress({value,max}) {
  const pct = max>0?Math.min((value/max)*100,100):0;
  const color = pct<70?"#22C55E":pct<90?"#F5A623":"#EF4444";
  return (
    <div style={{height:8,background:"rgba(0,0,0,0.08)",borderRadius:4,overflow:"hidden"}}>
      <div style={{height:"100%",width:`${pct}%`,background:color,borderRadius:4,transition:"width 0.6s ease"}}/>
    </div>
  );
}

function Chip({children,color="#0A5C36"}) {
  return <span style={{display:"inline-block",padding:"2px 9px",borderRadius:20,fontSize:11,fontWeight:700,background:color+"20",color,fontFamily:"DM Sans"}}>{children}</span>;
}

function Empty({icon:Icon,title,desc,action,onAction}) {
  const {theme} = useTheme();
  return (
    <div style={{textAlign:"center",padding:"48px 16px"}}>
      <div style={{width:60,height:60,borderRadius:"50%",background:"#0A5C3614",margin:"0 auto 14px",display:"flex",alignItems:"center",justifyContent:"center"}}>
        <Icon size={26} color="#0A5C36"/>
      </div>
      <h3 style={{margin:"0 0 6px",fontFamily:"DM Serif Display,serif",fontSize:17,color:theme==="dark"?"#F9FAFB":"#111827"}}>{title}</h3>
      <p style={{margin:"0 0 18px",fontSize:13,color:"#9CA3AF"}}>{desc}</p>
      {action&&<Btn onClick={onAction}><Plus size={15}/>{action}</Btn>}
    </div>
  );
}

function Donut({pct,size=90}) {
  const {theme} = useTheme();
  const r=38, c=2*Math.PI*r;
  const offset = c*(1-Math.min(pct/100,1));
  const color = pct>=100?"#22C55E":"#0A5C36";
  return (
    <svg width={size} height={size} viewBox="0 0 100 100">
      <circle cx="50" cy="50" r={r} fill="none" stroke={theme==="dark"?"rgba(255,255,255,0.07)":"#E5E7EB"} strokeWidth="13"/>
      <circle cx="50" cy="50" r={r} fill="none" stroke={color} strokeWidth="13"
        strokeDasharray={c} strokeDashoffset={offset}
        strokeLinecap="round" transform="rotate(-90 50 50)"
        style={{transition:"stroke-dashoffset 0.7s ease"}}/>
      <text x="50" y="50" textAnchor="middle" dominantBaseline="middle"
        fontSize="15" fontWeight="700" fill={theme==="dark"?"#F9FAFB":"#111827"} fontFamily="DM Sans">
        {Math.round(pct)}%
      </text>
    </svg>
  );
}

// Amount input with inline conversion helper
function AmtInput({label,value,onChange,required}) {
  const {currency,rate,toKES} = useCurrency();
  const num = parseFloat(value)||0;
  let helper = "";
  if(num>0) {
    if(currency==="KES") helper=`≈ USD ${(num/rate).toFixed(2)}`;
    else helper=`≈ KES ${(num*rate).toLocaleString("en-KE",{minimumFractionDigits:2})}`;
  }
  return <Fld label={`${label} (${currency})`} value={value} onChange={onChange}
    type="number" placeholder="0.00" helper={helper} required={required}/>;
}

// Confirm dialog
function Confirm({msg,onYes,onNo}) {
  const {theme} = useTheme();
  return (
    <div style={{position:"fixed",inset:0,zIndex:1100,background:"rgba(0,0,0,0.6)",display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
      <div style={{backgroundColor:theme==="dark"?"#1A2E20":"#fff",borderRadius:16,padding:24,maxWidth:340,width:"100%",boxShadow:"0 20px 48px rgba(0,0,0,0.3)"}}>
        <p style={{margin:"0 0 20px",fontSize:15,fontFamily:"DM Sans",color:theme==="dark"?"#F9FAFB":"#111827",textAlign:"center"}}>{msg}</p>
        <div style={{display:"flex",gap:10,justifyContent:"center"}}>
          <Btn v="ghost" onClick={onNo}>Cancel</Btn>
          <Btn v="danger" onClick={onYes}>Confirm</Btn>
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// DASHBOARD
// ─────────────────────────────────────────────────────────

function Dashboard({setTab}) {
  const {transactions,budgets,bills} = useApp();
  const {fmt} = useCurrency();
  const {theme} = useTheme();

  const cur = thisMonth();
  const prev = getMonthKey(new Date(new Date().setMonth(new Date().getMonth()-1)));

  const inc  = transactions.filter(t=>t.type==="income"  && getMonthKey(t.date)===cur).reduce((s,t)=>s+t.amount,0);
  const exp  = transactions.filter(t=>t.type==="expense" && getMonthKey(t.date)===cur).reduce((s,t)=>s+t.amount,0);
  const net  = inc-exp;
  const rate = inc>0?((net/inc)*100).toFixed(1):"0.0";

  const prevExp = transactions.filter(t=>t.type==="expense" && getMonthKey(t.date)===prev).reduce((s,t)=>s+t.amount,0);
  const chg     = prevExp>0 ? ((exp-prevExp)/prevExp*100).toFixed(0) : null;
  const insight = chg!==null
    ? chg>0 ? `⚠️ Expenses up ${chg}% vs last month. Worth reviewing!`
             : `✅ Expenses down ${Math.abs(chg)}% vs last month — solid discipline!`
    : "📊 Add transactions to unlock spending insights.";

  const statCard = (label,amount,Icon,color,sub) => (
    <Card>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
        <div>
          <p style={{margin:0,fontSize:11,fontWeight:700,color:"#9CA3AF",textTransform:"uppercase",letterSpacing:"0.06em"}}>{label}</p>
          <p style={{margin:"6px 0 0",fontSize:20,fontWeight:800,fontFamily:"DM Serif Display,serif",color:theme==="dark"?"#F9FAFB":"#111827"}}>{amount}</p>
          {sub&&<p style={{margin:"3px 0 0",fontSize:12,color:"#9CA3AF"}}>{sub}</p>}
        </div>
        <div style={{width:42,height:42,borderRadius:12,background:color+"20",display:"flex",alignItems:"center",justifyContent:"center"}}>
          <Icon size={20} color={color}/>
        </div>
      </div>
    </Card>
  );

  const recent  = transactions.slice(0,5);
  const upcoming= [...bills].filter(b=>!b.isPaid).sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate)).slice(0,3);
  const active  = budgets.slice(0,4);

  const txLine = (t) => (
    <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
      padding:"10px 0",borderBottom:`1px solid ${theme==="dark"?"rgba(255,255,255,0.05)":"#F3F4F6"}`}}>
      <div style={{display:"flex",alignItems:"center",gap:10}}>
        <div style={{width:36,height:36,borderRadius:"50%",display:"flex",alignItems:"center",justifyContent:"center",
          background:t.type==="income"?"#22C55E20":"#EF444420"}}>
          {t.type==="income"?<TrendingUp size={16} color="#22C55E"/>:<TrendingDown size={16} color="#EF4444"/>}
        </div>
        <div>
          <p style={{margin:0,fontSize:13,fontWeight:600,color:theme==="dark"?"#F9FAFB":"#111827"}}>{t.description||t.category}</p>
          <p style={{margin:"1px 0 0",fontSize:11,color:"#9CA3AF"}}>{fmtDate(t.date)} · {t.category}</p>
        </div>
      </div>
      <span style={{fontWeight:700,fontSize:14,color:t.type==="income"?"#22C55E":"#EF4444"}}>
        {t.type==="income"?"+":"-"}{fmt(t.amount)}
      </span>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:12}}>
        {statCard("Income",    fmt(inc),  TrendingUp,   "#22C55E")}
        {statCard("Expenses",  fmt(exp),  TrendingDown, "#EF4444")}
        {statCard("Net Savings",fmt(Math.abs(net)), Wallet,"#0A5C36", net<0?"Deficit":"Surplus")}
        {statCard("Savings Rate",`${rate}%`,BarChart2,"#F5A623")}
      </div>

      <Card style={{borderLeft:"4px solid #0A5C36"}}>
        <p style={{margin:0,fontSize:13,lineHeight:1.6,color:theme==="dark"?"#D1FAE5":"#065F46"}}>{insight}</p>
      </Card>

      <Card style={{padding:0,overflow:"hidden"}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"16px 20px 12px"}}>
          <h3 style={{margin:0,fontFamily:"DM Serif Display,serif",fontSize:15,color:theme==="dark"?"#F9FAFB":"#111827"}}>Recent Transactions</h3>
          <button onClick={()=>setTab("transactions")} style={{background:"none",border:"none",color:"#0A5C36",fontSize:12,fontWeight:700,cursor:"pointer"}}>View all →</button>
        </div>
        <div style={{padding:"0 20px 8px"}}>
          {recent.length===0
            ? <Empty icon={Repeat} title="No transactions" desc="Add your first income or expense" action="Add" onAction={()=>setTab("transactions")}/>
            : recent.map(txLine)}
        </div>
      </Card>

      {upcoming.length>0&&(
        <Card>
          <h3 style={{margin:"0 0 14px",fontFamily:"DM Serif Display,serif",fontSize:15,color:theme==="dark"?"#F9FAFB":"#111827"}}>Upcoming Bills</h3>
          {upcoming.map(b=>{
            const d=daysUntil(b.dueDate);
            return (
              <div key={b.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",
                padding:"9px 0",borderBottom:`1px solid ${theme==="dark"?"rgba(255,255,255,0.05)":"#F3F4F6"}`}}>
                <div>
                  <p style={{margin:0,fontSize:13,fontWeight:600,color:theme==="dark"?"#F9FAFB":"#111827"}}>{b.name}</p>
                  <p style={{margin:"2px 0 0",fontSize:11,color:d<=3?"#EF4444":"#9CA3AF"}}>
                    {d<0?`${Math.abs(d)}d overdue`:d===0?"Due today!":`Due in ${d}d`}
                  </p>
                </div>
                <span style={{fontWeight:700,fontSize:13,color:theme==="dark"?"#F9FAFB":"#111827"}}>{fmt(b.amount)}</span>
              </div>
            );
          })}
        </Card>
      )}

      {active.length>0&&(
        <Card>
          <h3 style={{margin:"0 0 14px",fontFamily:"DM Serif Display,serif",fontSize:15,color:theme==="dark"?"#F9FAFB":"#111827"}}>Budget Snapshot</h3>
          {active.map(b=>{
            const spent = transactions.filter(t=>t.type==="expense"&&t.category===b.category&&getMonthKey(t.date)===cur).reduce((s,t)=>s+t.amount,0);
            return (
              <div key={b.id} style={{marginBottom:14}}>
                <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                  <span style={{fontSize:13,fontWeight:600,color:theme==="dark"?"#F9FAFB":"#111827"}}>{b.name}</span>
                  <span style={{fontSize:12,color:"#9CA3AF"}}>{fmt(spent)} / {fmt(b.limit)}</span>
                </div>
                <Progress value={spent} max={b.limit}/>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// TRANSACTIONS
// ─────────────────────────────────────────────────────────

function Transactions() {
  const {transactions,dispatch} = useApp();
  const {currency,rate,toKES,fmt} = useCurrency();
  const toast = useToast();
  const {theme} = useTheme();

  const [showAdd,setShowAdd] = useState(false);
  const [showSMS,setShowSMS] = useState(false);
  const [sms,setSms] = useState("");
  const [search,setSearch] = useState("");
  const [fType,setFType] = useState("all");
  const [form,setForm] = useState({type:"expense",amount:"",category:EXPENSE_CATS[0],description:"",date:new Date().toISOString().slice(0,10),isRecurring:false,freq:"monthly",account:"mpesa"});
  const upd = (k,v) => setForm(f=>({...f,[k]:v}));

  const cats = form.type==="income" ? INCOME_CATS : EXPENSE_CATS;

  const filtered = transactions.filter(t=>{
    if(fType!=="all"&&t.type!==fType) return false;
    if(search){
      const q=search.toLowerCase();
      if(!t.description?.toLowerCase().includes(q)&&!t.category.toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const handleAdd = () => {
    const n=parseFloat(form.amount);
    if(!n||n<=0){toast("Enter a valid amount","err"); return;}
    dispatch({type:"ADD_TX",payload:{id:uid(),...form,amount:toKES(n)}});
    toast("Transaction added!");
    setShowAdd(false);
    setForm({type:"expense",amount:"",category:EXPENSE_CATS[0],description:"",date:new Date().toISOString().slice(0,10),isRecurring:false,freq:"monthly",account:"mpesa"});
  };

  const handleSMS = () => {
    const {amount,description,type} = parseMpesa(sms);
    if(!amount){toast("Couldn't parse amount","err"); return;}
    const disp = currency==="USD"?(amount/rate).toFixed(2):String(amount);
    upd("amount",disp); upd("description",description); upd("type",type);
    upd("category",type==="income"?"M-Pesa Received":"Till Number Payment");
    setShowSMS(false); setSms(""); setShowAdd(true);
    toast("SMS parsed — review & confirm 👇","info");
  };

  const handleCSV = () => {
    const rows=[["Date","Type","Category","Description","Amount KES","Account"]];
    filtered.forEach(t=>rows.push([fmtDate(t.date),t.type,t.category,t.description||"",t.amount,t.account]));
    const csv=rows.map(r=>r.map(c=>`"${c}"`).join(",")).join("\n");
    const a=document.createElement("a");
    a.href="data:text/csv;charset=utf-8,"+encodeURIComponent(csv);
    a.download="pesatrack_transactions.csv"; a.click();
    toast("CSV exported!");
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <div style={{flex:1,position:"relative",minWidth:160}}>
          <Search size={15} style={{position:"absolute",left:12,top:"50%",transform:"translateY(-50%)",color:"#9CA3AF"}}/>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search..."
            style={{width:"100%",padding:"10px 14px 10px 34px",borderRadius:10,border:`1.5px solid ${theme==="dark"?"rgba(255,255,255,0.12)":"#E5E7EB"}`,background:theme==="dark"?"rgba(255,255,255,0.05)":"#FAFAFA",color:theme==="dark"?"#F9FAFB":"#111827",fontSize:13,fontFamily:"DM Sans",outline:"none",boxSizing:"border-box"}}/>
        </div>
        <select value={fType} onChange={e=>setFType(e.target.value)} style={{padding:"10px 12px",borderRadius:10,border:`1.5px solid ${theme==="dark"?"rgba(255,255,255,0.12)":"#E5E7EB"}`,background:theme==="dark"?"rgba(255,255,255,0.05)":"#FAFAFA",color:theme==="dark"?"#F9FAFB":"#111827",fontSize:13,fontFamily:"DM Sans",cursor:"pointer"}}>
          <option value="all">All</option><option value="income">Income</option><option value="expense">Expense</option>
        </select>
        <Btn v="ghost" size="sm" onClick={handleCSV}><Download size={13}/>CSV</Btn>
        <Btn v="ghost" size="sm" onClick={()=>setShowSMS(true)}>📱 SMS</Btn>
        <Btn size="sm" onClick={()=>setShowAdd(true)}><Plus size={15}/>Add</Btn>
      </div>

      <Card style={{padding:0,overflow:"hidden"}}>
        {filtered.length===0
          ? <Empty icon={Repeat} title="No transactions" desc="Add income or expense to get started" action="Add Transaction" onAction={()=>setShowAdd(true)}/>
          : filtered.map(t=>(
            <div key={t.id} style={{display:"flex",justifyContent:"space-between",alignItems:"center",padding:"13px 18px",borderBottom:`1px solid ${theme==="dark"?"rgba(255,255,255,0.05)":"#F3F4F6"}`}}>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <div style={{width:38,height:38,borderRadius:"50%",background:t.type==="income"?"#22C55E20":"#EF444420",display:"flex",alignItems:"center",justifyContent:"center"}}>
                  {t.type==="income"?<TrendingUp size={16} color="#22C55E"/>:<TrendingDown size={16} color="#EF4444"/>}
                </div>
                <div>
                  <p style={{margin:0,fontSize:13,fontWeight:600,color:theme==="dark"?"#F9FAFB":"#111827"}}>{t.description||t.category}</p>
                  <p style={{margin:"1px 0 0",fontSize:11,color:"#9CA3AF"}}>{fmtDate(t.date)} · {t.category} · {ACCOUNTS.find(a=>a.value===t.account)?.label||t.account}</p>
                </div>
              </div>
              <div style={{display:"flex",alignItems:"center",gap:10}}>
                <span style={{fontWeight:700,fontSize:14,color:t.type==="income"?"#22C55E":"#EF4444"}}>
                  {t.type==="income"?"+":"-"}{fmt(t.amount)}
                </span>
                <button onClick={()=>{dispatch({type:"DEL_TX",payload:t.id});toast("Deleted","info");}} style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF",display:"flex",padding:3}}>
                  <Trash2 size={14}/>
                </button>
              </div>
            </div>
          ))
        }
      </Card>

      {/* Add Transaction */}
      <Modal title="Add Transaction" isOpen={showAdd} onClose={()=>setShowAdd(false)}>
        <div style={{display:"flex",gap:8,marginBottom:16}}>
          {["expense","income"].map(tp=>(
            <button key={tp} onClick={()=>{upd("type",tp);upd("category",(tp==="income"?INCOME_CATS:EXPENSE_CATS)[0]);}}
              style={{flex:1,padding:"9px",borderRadius:10,border:"2px solid",borderColor:form.type===tp?"#0A5C36":"#E5E7EB",background:form.type===tp?"#0A5C36":"transparent",color:form.type===tp?"#fff":"#9CA3AF",fontWeight:700,cursor:"pointer",fontFamily:"DM Sans",textTransform:"capitalize",fontSize:14}}>
              {tp}
            </button>
          ))}
        </div>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <AmtInput label="Amount" value={form.amount} onChange={v=>upd("amount",v)} required/>
          <Sel label="Category" value={form.category} onChange={v=>upd("category",v)} opts={cats}/>
          <Sel label="Account" value={form.account} onChange={v=>upd("account",v)} opts={ACCOUNTS}/>
          <Fld label="Description" value={form.description} onChange={v=>upd("description",v)} placeholder="Optional note"/>
          <Fld label="Date" type="date" value={form.date} onChange={v=>upd("date",v)}/>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:14,cursor:"pointer",color:theme==="dark"?"#F9FAFB":"#374151"}}>
            <input type="checkbox" checked={form.isRecurring} onChange={e=>upd("isRecurring",e.target.checked)}/>
            Recurring
          </label>
          {form.isRecurring&&(
            <Sel label="Frequency" value={form.freq} onChange={v=>upd("freq",v)}
              opts={["daily","weekly","monthly","yearly"].map(v=>({value:v,label:v.charAt(0).toUpperCase()+v.slice(1)}))}/>
          )}
          <Btn onClick={handleAdd} style={{width:"100%",justifyContent:"center",marginTop:6}}>Add Transaction</Btn>
        </div>
      </Modal>

      {/* M-Pesa SMS Parser */}
      <Modal title="📱 Parse M-Pesa SMS" isOpen={showSMS} onClose={()=>setShowSMS(false)}>
        <p style={{margin:"0 0 12px",fontSize:13,color:"#9CA3AF"}}>Paste an M-Pesa confirmation SMS and we'll pre-fill the transaction form.</p>
        <Fld type="textarea" value={sms} onChange={setSms} placeholder="e.g. You have received Ksh 5,000.00 from JOHN DOE..."/>
        <Btn onClick={handleSMS} style={{width:"100%",justifyContent:"center",marginTop:12}}>Parse & Fill Form</Btn>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// BUDGETS
// ─────────────────────────────────────────────────────────

function Budgets() {
  const {transactions,budgets,dispatch} = useApp();
  const {fmt,toKES} = useCurrency();
  const toast=useToast(); const {theme}=useTheme();
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({name:"",limit:"",category:EXPENSE_CATS[0],period:"monthly"});
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));
  const cur=thisMonth();

  const withSpent = budgets.map(b=>{
    const spent=transactions.filter(t=>t.type==="expense"&&t.category===b.category&&getMonthKey(t.date)===cur).reduce((s,t)=>s+t.amount,0);
    return {...b,spent};
  });

  const handleAdd=()=>{
    if(!form.name||!form.limit){toast("Fill all fields","err");return;}
    dispatch({type:"ADD_BDG",payload:{id:uid(),...form,limit:toKES(parseFloat(form.limit)),spent:0}});
    toast("Budget created!"); setShowAdd(false);
    setForm({name:"",limit:"",category:EXPENSE_CATS[0],period:"monthly"});
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2 style={{margin:0,fontFamily:"DM Serif Display,serif",fontSize:22,color:theme==="dark"?"#F9FAFB":"#111827"}}>Budgets</h2>
        <Btn size="sm" onClick={()=>setShowAdd(true)}><Plus size={15}/>New Budget</Btn>
      </div>
      {withSpent.length===0
        ?<Card><Empty icon={Wallet} title="No budgets yet" desc="Set spending limits by category" action="Create Budget" onAction={()=>setShowAdd(true)}/></Card>
        :withSpent.map(b=>{
          const pct=b.limit>0?(b.spent/b.limit)*100:0;
          const col=pct<70?"#22C55E":pct<90?"#F5A623":"#EF4444";
          return (
            <Card key={b.id}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:10}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:5}}>
                    <h3 style={{margin:0,fontFamily:"DM Serif Display,serif",fontSize:16,color:theme==="dark"?"#F9FAFB":"#111827"}}>{b.name}</h3>
                    {pct>100&&<Chip color="#EF4444">Over budget</Chip>}
                  </div>
                  <div style={{display:"flex",gap:6}}><Chip>{b.category}</Chip><Chip color="#F5A623">{b.period}</Chip></div>
                </div>
                <button onClick={()=>{dispatch({type:"DEL_BDG",payload:b.id});toast("Deleted","info");}} style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF",display:"flex"}}>
                  <Trash2 size={15}/>
                </button>
              </div>
              <Progress value={b.spent} max={b.limit}/>
              <div style={{display:"flex",justifyContent:"space-between",marginTop:7}}>
                <span style={{fontSize:12,color:"#9CA3AF"}}>{fmt(b.spent)} spent</span>
                <span style={{fontSize:12,fontWeight:700,color:col}}>{pct.toFixed(0)}% of {fmt(b.limit)}</span>
              </div>
            </Card>
          );
        })
      }
      <Modal title="Create Budget" isOpen={showAdd} onClose={()=>setShowAdd(false)}>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Fld label="Budget Name" value={form.name} onChange={v=>upd("name",v)} placeholder="e.g. Food Budget" required/>
          <AmtInput label="Limit" value={form.limit} onChange={v=>upd("limit",v)} required/>
          <Sel label="Category" value={form.category} onChange={v=>upd("category",v)} opts={EXPENSE_CATS}/>
          <Sel label="Period" value={form.period} onChange={v=>upd("period",v)} opts={[{value:"weekly",label:"Weekly"},{value:"monthly",label:"Monthly"},{value:"yearly",label:"Yearly"}]}/>
          <Btn onClick={handleAdd} style={{width:"100%",justifyContent:"center",marginTop:6}}>Create</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// BILLS
// ─────────────────────────────────────────────────────────

function Bills() {
  const {bills,dispatch}=useApp();
  const {fmt,toKES}=useCurrency();
  const toast=useToast(); const {theme}=useTheme();
  const [showAdd,setShowAdd]=useState(false);
  const [form,setForm]=useState({name:"",amount:"",dueDate:"",category:"Utilities (KPLC, Water)",isRecurring:false,freq:"monthly"});
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));

  const sorted=[...bills].sort((a,b)=>new Date(a.dueDate)-new Date(b.dueDate));
  const unpaid=bills.filter(b=>!b.isPaid).reduce((s,b)=>s+b.amount,0);

  const handleAdd=()=>{
    if(!form.name||!form.amount||!form.dueDate){toast("Fill all required fields","err");return;}
    dispatch({type:"ADD_BILL",payload:{id:uid(),...form,amount:toKES(parseFloat(form.amount)),isPaid:false}});
    toast("Bill added!"); setShowAdd(false);
    setForm({name:"",amount:"",dueDate:"",category:"Utilities (KPLC, Water)",isRecurring:false,freq:"monthly"});
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:14}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2 style={{margin:0,fontFamily:"DM Serif Display,serif",fontSize:22,color:theme==="dark"?"#F9FAFB":"#111827"}}>Bills</h2>
        <Btn size="sm" onClick={()=>setShowAdd(true)}><Plus size={15}/>Add Bill</Btn>
      </div>
      {unpaid>0&&(
        <Card style={{borderLeft:"4px solid #EF4444",background:theme==="dark"?"rgba(239,68,68,0.1)":"#FEF2F2"}}>
          <p style={{margin:0,fontSize:14,fontWeight:700,color:"#EF4444"}}>Total Unpaid: {fmt(unpaid)}</p>
        </Card>
      )}
      {sorted.length===0
        ?<Card><Empty icon={Bell} title="No bills" desc="Track recurring bills & get reminders" action="Add Bill" onAction={()=>setShowAdd(true)}/></Card>
        :sorted.map(b=>{
          const d=daysUntil(b.dueDate);
          const overdue=d<0&&!b.isPaid;
          const accent=b.isPaid?"#22C55E":overdue?"#EF4444":"#F5A623";
          return (
            <Card key={b.id} style={{borderLeft:`4px solid ${accent}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <h3 style={{margin:0,fontSize:15,fontWeight:700,color:theme==="dark"?"#F9FAFB":"#111827"}}>{b.name}</h3>
                    {b.isPaid&&<Chip color="#22C55E">Paid ✓</Chip>}
                    {overdue&&<Chip color="#EF4444">Overdue</Chip>}
                  </div>
                  <p style={{margin:0,fontSize:12,color:"#9CA3AF"}}>
                    {b.category} · Due {fmtDate(b.dueDate)}
                    {!b.isPaid&&` · ${d<0?`${Math.abs(d)}d overdue`:d===0?"Today!":d+"d left"}`}
                  </p>
                </div>
                <div style={{display:"flex",alignItems:"center",gap:8}}>
                  <span style={{fontWeight:700,fontSize:14,color:theme==="dark"?"#F9FAFB":"#111827"}}>{fmt(b.amount)}</span>
                  <button onClick={()=>{dispatch({type:"TOGGLE_BILL",payload:b.id});toast(b.isPaid?"Marked unpaid":"Marked paid ✓");}}
                    style={{width:30,height:30,borderRadius:"50%",border:`2px solid ${b.isPaid?"#22C55E":"#E5E7EB"}`,background:b.isPaid?"#22C55E":"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center"}}>
                    {b.isPaid&&<Check size={14} color="#fff"/>}
                  </button>
                  <button onClick={()=>{dispatch({type:"DEL_BILL",payload:b.id});toast("Deleted","info");}} style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF",display:"flex"}}>
                    <Trash2 size={14}/>
                  </button>
                </div>
              </div>
            </Card>
          );
        })
      }
      <Modal title="Add Bill" isOpen={showAdd} onClose={()=>setShowAdd(false)}>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Fld label="Bill Name" value={form.name} onChange={v=>upd("name",v)} placeholder="e.g. KPLC Electricity" required/>
          <AmtInput label="Amount" value={form.amount} onChange={v=>upd("amount",v)} required/>
          <Fld label="Due Date" type="date" value={form.dueDate} onChange={v=>upd("dueDate",v)} required/>
          <Sel label="Category" value={form.category} onChange={v=>upd("category",v)} opts={EXPENSE_CATS}/>
          <label style={{display:"flex",alignItems:"center",gap:8,fontSize:14,cursor:"pointer",color:theme==="dark"?"#F9FAFB":"#374151"}}>
            <input type="checkbox" checked={form.isRecurring} onChange={e=>upd("isRecurring",e.target.checked)}/> Recurring
          </label>
          {form.isRecurring&&<Sel label="Frequency" value={form.freq} onChange={v=>upd("freq",v)} opts={["weekly","monthly","yearly"].map(v=>({value:v,label:v.charAt(0).toUpperCase()+v.slice(1)}))}/>}
          <Btn onClick={handleAdd} style={{width:"100%",justifyContent:"center",marginTop:6}}>Add Bill</Btn>
        </div>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// GOALS
// ─────────────────────────────────────────────────────────

function Goals() {
  const {goals,dispatch}=useApp();
  const {fmt,toKES}=useCurrency();
  const toast=useToast(); const {theme}=useTheme();
  const [showAdd,setShowAdd]=useState(false);
  const [contribGoal,setContribGoal]=useState(null);
  const [contrib,setContrib]=useState("");
  const [form,setForm]=useState({name:"",targetAmount:"",deadline:""});
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));

  const handleAdd=()=>{
    if(!form.name||!form.targetAmount||!form.deadline){toast("Fill all fields","err");return;}
    dispatch({type:"ADD_GOAL",payload:{id:uid(),...form,targetAmount:toKES(parseFloat(form.targetAmount)),currentAmount:0,contributions:[]}});
    toast("Goal created!"); setShowAdd(false);
    setForm({name:"",targetAmount:"",deadline:""});
  };

  const handleContrib=()=>{
    const amt=toKES(parseFloat(contrib));
    if(!amt||amt<=0){toast("Enter a valid amount","err");return;}
    dispatch({type:"CONTRIB",payload:{id:contribGoal.id,amount:amt}});
    if(contribGoal.currentAmount+amt>=contribGoal.targetAmount) toast("🎉 Goal achieved!","info");
    else toast(`Contribution added to ${contribGoal.name}!`);
    setContribGoal(null); setContrib("");
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2 style={{margin:0,fontFamily:"DM Serif Display,serif",fontSize:22,color:theme==="dark"?"#F9FAFB":"#111827"}}>Savings Goals</h2>
        <Btn size="sm" onClick={()=>setShowAdd(true)}><Plus size={15}/>New Goal</Btn>
      </div>
      {goals.length===0
        ?<Card><Empty icon={Target} title="No goals yet" desc="Set a savings goal and start building your future" action="Create Goal" onAction={()=>setShowAdd(true)}/></Card>
        :goals.map(g=>{
          const pct=g.targetAmount>0?(g.currentAmount/g.targetAmount)*100:0;
          const d=daysUntil(g.deadline);
          const done=g.currentAmount>=g.targetAmount;
          return (
            <Card key={g.id}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"flex-start"}}>
                <div style={{flex:1}}>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:4}}>
                    <h3 style={{margin:0,fontFamily:"DM Serif Display,serif",fontSize:16,color:theme==="dark"?"#F9FAFB":"#111827"}}>{g.name}</h3>
                    {done&&<Chip color="#22C55E">🎉 Achieved</Chip>}
                  </div>
                  <p style={{margin:"0 0 12px",fontSize:12,color:"#9CA3AF"}}>
                    {fmt(g.currentAmount)} of {fmt(g.targetAmount)} · {d>0?`${d}d remaining`:"Deadline passed"}
                  </p>
                  <Progress value={g.currentAmount} max={g.targetAmount}/>
                </div>
                <div style={{marginLeft:16}}><Donut pct={pct} size={80}/></div>
              </div>
              <div style={{display:"flex",gap:8,marginTop:12}}>
                {!done&&<Btn size="sm" onClick={()=>setContribGoal(g)}><Plus size={13}/>Contribute</Btn>}
                <Btn size="sm" v="ghost" onClick={()=>{dispatch({type:"DEL_GOAL",payload:g.id});toast("Deleted","info");}}><Trash2 size={13}/></Btn>
              </div>
            </Card>
          );
        })
      }
      <Modal title="New Savings Goal" isOpen={showAdd} onClose={()=>setShowAdd(false)}>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Fld label="Goal Name" value={form.name} onChange={v=>upd("name",v)} placeholder="e.g. Emergency Fund" required/>
          <AmtInput label="Target Amount" value={form.targetAmount} onChange={v=>upd("targetAmount",v)} required/>
          <Fld label="Deadline" type="date" value={form.deadline} onChange={v=>upd("deadline",v)} required/>
          <Btn onClick={handleAdd} style={{width:"100%",justifyContent:"center",marginTop:6}}>Create Goal</Btn>
        </div>
      </Modal>
      <Modal title={`Contribute to ${contribGoal?.name}`} isOpen={!!contribGoal} onClose={()=>setContribGoal(null)}>
        <p style={{margin:"0 0 12px",fontSize:13,color:"#9CA3AF"}}>Remaining: {contribGoal&&fmt(Math.max(0,contribGoal.targetAmount-contribGoal.currentAmount))}</p>
        <AmtInput label="Amount" value={contrib} onChange={setContrib} required/>
        <Btn onClick={handleContrib} style={{width:"100%",justifyContent:"center",marginTop:12}}>Add Contribution</Btn>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// DEBTS
// ─────────────────────────────────────────────────────────

function Debts() {
  const {debts,dispatch}=useApp();
  const {fmt,toKES}=useCurrency();
  const toast=useToast(); const {theme}=useTheme();
  const [showAdd,setShowAdd]=useState(false);
  const [payDebt,setPayDebt]=useState(null);
  const [payment,setPayment]=useState("");
  const [form,setForm]=useState({name:"",lender:"",principalAmount:"",remainingAmount:"",interestRate:"",dueDate:""});
  const upd=(k,v)=>setForm(f=>({...f,[k]:v}));

  const totalDebt=debts.reduce((s,d)=>s+d.remainingAmount,0);

  const handleAdd=()=>{
    if(!form.name||!form.principalAmount){toast("Fill required fields","err");return;}
    const principal=toKES(parseFloat(form.principalAmount));
    const remaining=form.remainingAmount?toKES(parseFloat(form.remainingAmount)):principal;
    dispatch({type:"ADD_DEBT",payload:{id:uid(),...form,principalAmount:principal,remainingAmount:remaining,interestRate:parseFloat(form.interestRate)||0,payments:[]}});
    toast("Debt added!"); setShowAdd(false);
    setForm({name:"",lender:"",principalAmount:"",remainingAmount:"",interestRate:"",dueDate:""});
  };

  const handlePay=()=>{
    const amt=toKES(parseFloat(payment));
    if(!amt||amt<=0){toast("Enter valid amount","err");return;}
    dispatch({type:"PAY_DEBT",payload:{id:payDebt.id,amount:amt}});
    if(payDebt.remainingAmount-amt<=0) toast("🎉 Debt cleared!","info");
    else toast("Payment logged!");
    setPayDebt(null); setPayment("");
  };

  return (
    <div style={{display:"flex",flexDirection:"column",gap:16}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2 style={{margin:0,fontFamily:"DM Serif Display,serif",fontSize:22,color:theme==="dark"?"#F9FAFB":"#111827"}}>Debt Tracker</h2>
        <Btn size="sm" onClick={()=>setShowAdd(true)}><Plus size={15}/>Add Debt</Btn>
      </div>
      {totalDebt>0&&(
        <Card style={{borderLeft:"4px solid #EF4444"}}>
          <p style={{margin:"0 0 3px",fontSize:12,color:"#9CA3AF",fontWeight:600,textTransform:"uppercase",letterSpacing:"0.05em"}}>Total Remaining</p>
          <p style={{margin:0,fontSize:24,fontWeight:800,fontFamily:"DM Serif Display,serif",color:"#EF4444"}}>{fmt(totalDebt)}</p>
        </Card>
      )}
      {debts.length===0
        ?<Card><Empty icon={CreditCard} title="No debts tracked" desc="Log loans and track repayments" action="Add Debt" onAction={()=>setShowAdd(true)}/></Card>
        :debts.map(d=>{
          const pct=d.principalAmount>0?((d.principalAmount-d.remainingAmount)/d.principalAmount)*100:0;
          const cleared=d.remainingAmount<=0;
          const monthlyInt=(d.remainingAmount*(d.interestRate/100))/12;
          return (
            <Card key={d.id} style={{borderLeft:`4px solid ${cleared?"#22C55E":"#EF4444"}`}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginBottom:3}}>
                    <h3 style={{margin:0,fontSize:15,fontWeight:700,color:theme==="dark"?"#F9FAFB":"#111827"}}>{d.name}</h3>
                    {cleared&&<Chip color="#22C55E">Cleared ✓</Chip>}
                  </div>
                  <p style={{margin:0,fontSize:12,color:"#9CA3AF"}}>
                    {d.lender||"Unknown"} · {d.interestRate}% p.a.{d.dueDate?` · Due ${fmtDate(d.dueDate)}`:""}
                  </p>
                </div>
                <button onClick={()=>{dispatch({type:"DEL_DEBT",payload:d.id});toast("Removed","info");}} style={{background:"none",border:"none",cursor:"pointer",color:"#9CA3AF",display:"flex"}}>
                  <Trash2 size={14}/>
                </button>
              </div>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:8}}>
                <span style={{fontSize:13,color:"#9CA3AF"}}>Remaining</span>
                <span style={{fontWeight:700,color:cleared?"#22C55E":"#EF4444",fontSize:14}}>{cleared?"CLEARED":fmt(d.remainingAmount)}</span>
              </div>
              {d.interestRate>0&&!cleared&&<p style={{margin:"0 0 8px",fontSize:12,color:"#9CA3AF"}}>Est. monthly interest: {fmt(monthlyInt)}</p>}
              <Progress value={d.principalAmount-d.remainingAmount} max={d.principalAmount}/>
              <p style={{margin:"5px 0 10px",fontSize:11,color:"#9CA3AF"}}>{pct.toFixed(0)}% repaid · {fmt(d.principalAmount)} total</p>
              {!cleared&&<Btn size="sm" onClick={()=>setPayDebt(d)}>Log Payment</Btn>}
            </Card>
          );
        })
      }
      <Modal title="Add Debt" isOpen={showAdd} onClose={()=>setShowAdd(false)}>
        <div style={{display:"flex",flexDirection:"column",gap:12}}>
          <Fld label="Loan Name" value={form.name} onChange={v=>upd("name",v)} placeholder="e.g. KCB Loan" required/>
          <Fld label="Lender" value={form.lender} onChange={v=>upd("lender",v)} placeholder="e.g. KCB Bank"/>
          <AmtInput label="Principal Amount" value={form.principalAmount} onChange={v=>upd("principalAmount",v)} required/>
          <AmtInput label="Remaining Balance (if different)" value={form.remainingAmount} onChange={v=>upd("remainingAmount",v)}/>
          <Fld label="Interest Rate (% per year)" type="number" value={form.interestRate} onChange={v=>upd("interestRate",v)} placeholder="e.g. 14"/>
          <Fld label="Due Date (optional)" type="date" value={form.dueDate} onChange={v=>upd("dueDate",v)}/>
          <Btn onClick={handleAdd} style={{width:"100%",justifyContent:"center",marginTop:6}}>Add Debt</Btn>
        </div>
      </Modal>
      <Modal title={`Log Payment — ${payDebt?.name}`} isOpen={!!payDebt} onClose={()=>setPayDebt(null)}>
        <p style={{margin:"0 0 12px",fontSize:13,color:"#9CA3AF"}}>Remaining: {payDebt&&fmt(payDebt.remainingAmount)}</p>
        <AmtInput label="Payment Amount" value={payment} onChange={setPayment} required/>
        <Btn onClick={handlePay} style={{width:"100%",justifyContent:"center",marginTop:12}}>Log Payment</Btn>
      </Modal>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ANALYTICS
// ─────────────────────────────────────────────────────────

function Analytics() {
  const {transactions}=useApp();
  const {fmt}=useCurrency();
  const {theme}=useTheme();
  const [range,setRange]=useState(6);

  const months=lastNMonths(range);
  const textC=theme==="dark"?"#6B7280":"#9CA3AF";
  const gridC=theme==="dark"?"rgba(255,255,255,0.05)":"#F3F4F6";
  const cardBg=theme==="dark"?"#1A2E20":"#fff";

  const monthly=months.map(m=>{
    const inc=transactions.filter(t=>t.type==="income" &&getMonthKey(t.date)===m).reduce((s,t)=>s+t.amount,0);
    const exp=transactions.filter(t=>t.type==="expense"&&getMonthKey(t.date)===m).reduce((s,t)=>s+t.amount,0);
    return {month:monthLabel(m),income:Math.round(inc),expenses:Math.round(exp),savings:Math.round(inc-exp)};
  });

  const cur=thisMonth();
  const catData=(()=>{
    const map={};
    transactions.filter(t=>t.type==="expense"&&getMonthKey(t.date)===cur).forEach(t=>{map[t.category]=(map[t.category]||0)+t.amount;});
    return Object.entries(map).map(([name,value])=>({name,value:Math.round(value)})).sort((a,b)=>b.value-a.value).slice(0,7);
  })();

  const accData=(()=>{
    const map={};
    transactions.filter(t=>t.type==="expense").forEach(t=>{map[t.account]=(map[t.account]||0)+t.amount;});
    return Object.entries(map).map(([k,v])=>({name:ACCOUNTS.find(a=>a.value===k)?.label||k,value:Math.round(v)}));
  })();

  const last=monthly[monthly.length-1];
  const prev=monthly[monthly.length-2];
  const insight=prev&&prev.expenses>0
    ? (() => { const c=((last.expenses-prev.expenses)/prev.expenses*100).toFixed(0); return c>0?`📈 Expenses up ${c}% vs last period.`:`✅ Expenses down ${Math.abs(c)}% vs last period!`; })()
    : "Add more transactions to unlock insights.";

  const tip={contentStyle:{backgroundColor:cardBg,borderRadius:10,border:"none",boxShadow:"0 4px 16px rgba(0,0,0,0.15)",fontFamily:"DM Sans",fontSize:12}};

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <h2 style={{margin:0,fontFamily:"DM Serif Display,serif",fontSize:22,color:theme==="dark"?"#F9FAFB":"#111827"}}>Analytics</h2>
        <select value={range} onChange={e=>setRange(+e.target.value)} style={{padding:"8px 12px",borderRadius:8,border:`1.5px solid ${theme==="dark"?"rgba(255,255,255,0.12)":"#E5E7EB"}`,background:theme==="dark"?"rgba(255,255,255,0.05)":"#FAFAFA",color:theme==="dark"?"#F9FAFB":"#111827",fontSize:13,fontFamily:"DM Sans",cursor:"pointer"}}>
          <option value={1}>1 Month</option><option value={3}>3 Months</option><option value={6}>6 Months</option><option value={12}>1 Year</option>
        </select>
      </div>
      <Card style={{borderLeft:"4px solid #0A5C36"}}>
        <p style={{margin:0,fontSize:13,color:theme==="dark"?"#D1FAE5":"#065F46",lineHeight:1.6}}>{insight}</p>
      </Card>
      <Card>
        <h3 style={{margin:"0 0 14px",fontFamily:"DM Serif Display,serif",fontSize:15,color:theme==="dark"?"#F9FAFB":"#111827"}}>Income vs Expenses</h3>
        <ResponsiveContainer width="100%" height={210}>
          <BarChart data={monthly}>
            <CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
            <XAxis dataKey="month" tick={{fontSize:11,fill:textC}}/>
            <YAxis tickFormatter={axisK} tick={{fontSize:11,fill:textC}} width={40}/>
            <Tooltip formatter={v=>fmt(v)} {...tip}/>
            <Legend wrapperStyle={{fontSize:12,fontFamily:"DM Sans"}}/>
            <Bar dataKey="income"   fill="#22C55E" radius={[4,4,0,0]} name="Income"/>
            <Bar dataKey="expenses" fill="#EF4444" radius={[4,4,0,0]} name="Expenses"/>
          </BarChart>
        </ResponsiveContainer>
      </Card>
      <Card>
        <h3 style={{margin:"0 0 14px",fontFamily:"DM Serif Display,serif",fontSize:15,color:theme==="dark"?"#F9FAFB":"#111827"}}>Savings Trend</h3>
        <ResponsiveContainer width="100%" height={190}>
          <AreaChart data={monthly}>
            <defs>
              <linearGradient id="sg" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%"  stopColor="#0A5C36" stopOpacity={0.3}/>
                <stop offset="95%" stopColor="#0A5C36" stopOpacity={0}/>
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke={gridC}/>
            <XAxis dataKey="month" tick={{fontSize:11,fill:textC}}/>
            <YAxis tickFormatter={axisK} tick={{fontSize:11,fill:textC}} width={40}/>
            <Tooltip formatter={v=>fmt(v)} {...tip}/>
            <Area type="monotone" dataKey="savings" stroke="#0A5C36" strokeWidth={2.5} fill="url(#sg)" name="Net Savings"/>
          </AreaChart>
        </ResponsiveContainer>
      </Card>
      {catData.length>0&&(
        <Card>
          <h3 style={{margin:"0 0 14px",fontFamily:"DM Serif Display,serif",fontSize:15,color:theme==="dark"?"#F9FAFB":"#111827"}}>Category Breakdown (This Month)</h3>
          <div style={{display:"flex",gap:16,alignItems:"center",flexWrap:"wrap"}}>
            <ResponsiveContainer width={150} height={150}>
              <PieChart>
                <Pie data={catData} cx="50%" cy="50%" innerRadius={40} outerRadius={68} dataKey="value" paddingAngle={3}>
                  {catData.map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]}/>)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{flex:1,minWidth:140}}>
              {catData.map((c,i)=>(
                <div key={c.name} style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:7}}>
                  <div style={{display:"flex",alignItems:"center",gap:6}}>
                    <div style={{width:9,height:9,borderRadius:2,background:CHART_COLORS[i%CHART_COLORS.length]}}/>
                    <span style={{fontSize:12,color:theme==="dark"?"#D1FAE5":"#374151"}}>{c.name}</span>
                  </div>
                  <span style={{fontSize:12,fontWeight:700,color:theme==="dark"?"#F9FAFB":"#111827"}}>{fmt(c.value)}</span>
                </div>
              ))}
            </div>
          </div>
        </Card>
      )}
      {accData.length>0&&(
        <Card>
          <h3 style={{margin:"0 0 14px",fontFamily:"DM Serif Display,serif",fontSize:15,color:theme==="dark"?"#F9FAFB":"#111827"}}>Spending by Account</h3>
          <ResponsiveContainer width="100%" height={180}>
            <PieChart>
              <Pie data={accData} cx="50%" cy="50%" outerRadius={70} dataKey="value" label={({name,percent})=>`${name} ${(percent*100).toFixed(0)}%`} labelLine={false}>
                {accData.map((_,i)=><Cell key={i} fill={CHART_COLORS[i%CHART_COLORS.length]}/>)}
              </Pie>
              <Tooltip formatter={v=>fmt(v)} {...tip}/>
            </PieChart>
          </ResponsiveContainer>
        </Card>
      )}
      {transactions.length===0&&<Card><Empty icon={BarChart2} title="No data yet" desc="Add transactions to see your analytics"/></Card>}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// SETTINGS
// ─────────────────────────────────────────────────────────

function SettingsPage() {
  const {currency,setCurrency,rate,offline,minutesAgo}=useCurrency();
  const {theme,toggle}=useTheme();
  const {dispatch}=useApp();
  const toast=useToast();
  const [salary,setSalary]=useState("");
  const [tax,setTax]=useState(null);
  const [confirm,setConfirm]=useState(false);

  const calcTax=()=>{
    const g=parseFloat(salary);
    if(!g||g<=0){toast("Enter a valid salary","err");return;}
    setTax(kenyaTax(g));
  };

  const taxRow=(label,val,color)=>(
    <div style={{display:"flex",justifyContent:"space-between",padding:"9px 0",borderBottom:`1px solid ${theme==="dark"?"rgba(255,255,255,0.05)":"#F3F4F6"}`}}>
      <span style={{fontSize:13,color:"#9CA3AF"}}>{label}</span>
      <span style={{fontSize:13,fontWeight:700,color:color||(theme==="dark"?"#F9FAFB":"#111827")}}>KES {Number(val).toLocaleString("en-KE",{minimumFractionDigits:2})}</span>
    </div>
  );

  return (
    <div style={{display:"flex",flexDirection:"column",gap:18}}>
      {confirm&&<Confirm msg="Clear all app data? This cannot be undone." onYes={()=>{dispatch({type:"CLEAR"});toast("All data cleared","info");setConfirm(false);}} onNo={()=>setConfirm(false)}/>}
      <h2 style={{margin:0,fontFamily:"DM Serif Display,serif",fontSize:22,color:theme==="dark"?"#F9FAFB":"#111827"}}>Settings</h2>

      {/* Currency */}
      <Card>
        <h3 style={{margin:"0 0 14px",fontFamily:"DM Serif Display,serif",fontSize:16,color:theme==="dark"?"#F9FAFB":"#111827"}}>Currency</h3>
        <div style={{display:"flex",gap:10,marginBottom:12}}>
          {[["KES","🇰🇪"],["USD","🇺🇸"]].map(([c,flag])=>(
            <button key={c} onClick={()=>{setCurrency(c);toast(`Switched to ${c}`);}}
              style={{flex:1,padding:"11px",borderRadius:10,border:"2px solid",borderColor:currency===c?"#0A5C36":"#E5E7EB",background:currency===c?"#0A5C36":"transparent",color:currency===c?"#fff":"#9CA3AF",fontWeight:700,cursor:"pointer",fontFamily:"DM Sans",fontSize:14}}>
              {flag} {c}
            </button>
          ))}
        </div>
        <div style={{display:"flex",alignItems:"center",gap:8,padding:"10px 14px",borderRadius:10,background:theme==="dark"?"rgba(255,255,255,0.04)":"#F8FAF9"}}>
          <RefreshCw size={14} color={offline?"#9CA3AF":"#22C55E"}/>
          <span style={{fontSize:12,color:"#9CA3AF"}}>
            1 USD = KES {rate.toFixed(2)} · {offline?"Offline rate (fallback)":minutesAgo!==null?`Updated ${minutesAgo}m ago`:"Just updated"}
          </span>
        </div>
      </Card>

      {/* Theme */}
      <Card>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center"}}>
          <div>
            <h3 style={{margin:"0 0 4px",fontFamily:"DM Serif Display,serif",fontSize:16,color:theme==="dark"?"#F9FAFB":"#111827"}}>Appearance</h3>
            <p style={{margin:0,fontSize:13,color:"#9CA3AF"}}>{theme==="dark"?"Dark mode 🌙":"Light mode ☀️"}</p>
          </div>
          <button onClick={toggle} style={{
            width:52,height:28,borderRadius:14,
            background:theme==="dark"?"#0A5C36":"#E5E7EB",
            border:"none",cursor:"pointer",position:"relative",transition:"background 0.25s",
          }}>
            <div style={{
              width:22,height:22,borderRadius:"50%",background:"#fff",
              position:"absolute",top:3,left:theme==="dark"?27:3,
              transition:"left 0.25s",
              display:"flex",alignItems:"center",justifyContent:"center",
            }}>
              {theme==="dark"?<Moon size={12} color="#0A5C36"/>:<Sun size={12} color="#F5A623"/>}
            </div>
          </button>
        </div>
      </Card>

      {/* Tax calculator */}
      <Card>
        <h3 style={{margin:"0 0 4px",fontFamily:"DM Serif Display,serif",fontSize:16,color:theme==="dark"?"#F9FAFB":"#111827"}}>🇰🇪 Kenya Tax Estimator</h3>
        <p style={{margin:"0 0 16px",fontSize:13,color:"#9CA3AF"}}>2024 PAYE · NHIF · NSSF (New Act)</p>
        <div style={{display:"flex",gap:8}}>
          <input type="number" value={salary} onChange={e=>setSalary(e.target.value)} placeholder="Gross monthly salary (KES)"
            style={{flex:1,padding:"10px 14px",borderRadius:10,border:`1.5px solid ${theme==="dark"?"rgba(255,255,255,0.12)":"#E5E7EB"}`,background:theme==="dark"?"rgba(255,255,255,0.05)":"#FAFAFA",color:theme==="dark"?"#F9FAFB":"#111827",fontSize:14,fontFamily:"DM Sans",outline:"none"}}/>
          <Btn onClick={calcTax}>Calculate</Btn>
        </div>
        {tax&&(
          <div style={{marginTop:16,background:theme==="dark"?"rgba(255,255,255,0.03)":"#F8FAF9",borderRadius:12,padding:16}}>
            {taxRow("Gross Salary",parseFloat(salary))}
            {taxRow("PAYE Tax",tax.paye,"#EF4444")}
            {taxRow("NHIF",tax.nhif,"#EF4444")}
            {taxRow("NSSF",tax.nssf,"#EF4444")}
            {taxRow("Total Deductions",tax.total,"#EF4444")}
            <div style={{display:"flex",justifyContent:"space-between",paddingTop:12}}>
              <span style={{fontSize:15,fontWeight:700,color:theme==="dark"?"#F9FAFB":"#111827"}}>Net Take-Home</span>
              <span style={{fontSize:20,fontWeight:800,color:"#22C55E",fontFamily:"DM Serif Display,serif"}}>
                KES {tax.net.toLocaleString("en-KE",{minimumFractionDigits:2})}
              </span>
            </div>
          </div>
        )}
      </Card>

      {/* Data */}
      <Card>
        <h3 style={{margin:"0 0 8px",fontFamily:"DM Serif Display,serif",fontSize:16,color:theme==="dark"?"#F9FAFB":"#111827"}}>Data</h3>
        <p style={{margin:"0 0 14px",fontSize:13,color:"#9CA3AF"}}>In production, all data persists in localStorage. This preview resets on refresh.</p>
        <Btn v="danger" size="sm" onClick={()=>setConfirm(true)}><Trash2 size={13}/>Clear All Data</Btn>
      </Card>
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// NAVIGATION
// ─────────────────────────────────────────────────────────

const TABS = [
  {id:"dashboard",   label:"Home",         Icon:Home},
  {id:"transactions",label:"Transactions", Icon:Repeat},
  {id:"budgets",     label:"Budgets",      Icon:Wallet},
  {id:"bills",       label:"Bills",        Icon:Bell},
  {id:"goals",       label:"Goals",        Icon:Target},
  {id:"debts",       label:"Debts",        Icon:CreditCard},
  {id:"analytics",   label:"Analytics",    Icon:BarChart2},
  {id:"settings",    label:"Settings",     Icon:Settings},
];

function Header({tab,setTab}) {
  const {currency,setCurrency,rate,offline,minutesAgo}=useCurrency();
  const {theme,toggle}=useTheme();
  return (
    <div style={{
      position:"sticky",top:0,zIndex:200,
      background:theme==="dark"?"rgba(15,26,20,0.96)":"rgba(248,250,249,0.96)",
      backdropFilter:"blur(16px)",
      borderBottom:`1px solid ${theme==="dark"?"rgba(255,255,255,0.06)":"rgba(10,92,54,0.1)"}`,
      padding:"11px 18px",
    }}>
      <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",maxWidth:920,margin:"0 auto"}}>
        <div style={{display:"flex",alignItems:"center",gap:9}}>
          <div style={{width:34,height:34,borderRadius:10,background:"#0A5C36",display:"flex",alignItems:"center",justifyContent:"center"}}>
            <Wallet size={18} color="#F5A623"/>
          </div>
          <div>
            <div style={{fontFamily:"DM Serif Display,serif",fontSize:17,color:theme==="dark"?"#F9FAFB":"#111827",lineHeight:1.1,fontWeight:400}}>PesaTrack</div>
            <div style={{fontSize:10,color:"#9CA3AF",lineHeight:1}}>
              1 USD = KES {rate.toFixed(1)}{offline?" · Offline":minutesAgo!==null?` · ${minutesAgo}m ago`:""}
            </div>
          </div>
        </div>
        <div style={{display:"flex",alignItems:"center",gap:7}}>
          <div style={{display:"flex",background:theme==="dark"?"rgba(255,255,255,0.07)":"#E9ECE9",borderRadius:8,padding:2}}>
            {[["KES","🇰🇪"],["USD","🇺🇸"]].map(([c,f])=>(
              <button key={c} onClick={()=>setCurrency(c)}
                style={{padding:"4px 9px",borderRadius:6,border:"none",cursor:"pointer",fontSize:11,fontWeight:700,fontFamily:"DM Sans",transition:"all 0.15s",background:currency===c?"#0A5C36":"transparent",color:currency===c?"#fff":"#9CA3AF"}}>
                {f} {c}
              </button>
            ))}
          </div>
          <button onClick={toggle} style={{width:34,height:34,borderRadius:8,border:"none",cursor:"pointer",background:theme==="dark"?"rgba(255,255,255,0.07)":"#E9ECE9",display:"flex",alignItems:"center",justifyContent:"center"}}>
            {theme==="dark"?<Sun size={15} color="#F5A623"/>:<Moon size={15} color="#0A5C36"/>}
          </button>
        </div>
      </div>
    </div>
  );
}

function Sidebar({tab,setTab}) {
  const {theme}=useTheme();
  return (
    <div style={{width:210,flexShrink:0,padding:"16px 10px",background:theme==="dark"?"#0F1A14":"#F0F4F1",borderRight:`1px solid ${theme==="dark"?"rgba(255,255,255,0.06)":"rgba(10,92,54,0.1)"}`,overflowY:"auto"}}>
      {TABS.map(({id,label,Icon})=>{
        const active=tab===id;
        return (
          <button key={id} onClick={()=>setTab(id)} style={{
            width:"100%",display:"flex",alignItems:"center",gap:10,
            padding:"10px 13px",borderRadius:10,border:"none",cursor:"pointer",
            marginBottom:3,background:active?"#0A5C3618":"transparent",
            transition:"background 0.15s",
          }}>
            <Icon size={17} color={active?"#0A5C36":"#9CA3AF"}/>
            <span style={{fontSize:13,fontWeight:active?700:500,color:active?"#0A5C36":theme==="dark"?"#9CA3AF":"#6B7280",fontFamily:"DM Sans"}}>{label}</span>
          </button>
        );
      })}
    </div>
  );
}

function BottomNav({tab,setTab}) {
  const {theme}=useTheme();
  const show=TABS.slice(0,6);
  return (
    <div style={{
      position:"fixed",bottom:0,left:0,right:0,zIndex:300,
      background:theme==="dark"?"rgba(15,26,20,0.97)":"rgba(255,255,255,0.97)",
      backdropFilter:"blur(16px)",
      borderTop:`1px solid ${theme==="dark"?"rgba(255,255,255,0.06)":"rgba(10,92,54,0.1)"}`,
      display:"flex",
    }}>
      {show.map(({id,label,Icon})=>{
        const active=tab===id;
        return (
          <button key={id} onClick={()=>setTab(id)} style={{
            flex:1,display:"flex",flexDirection:"column",alignItems:"center",
            gap:2,padding:"9px 4px 7px",border:"none",cursor:"pointer",background:"none",
          }}>
            <Icon size={19} color={active?"#0A5C36":"#9CA3AF"}/>
            <span style={{fontSize:9,fontWeight:active?700:500,color:active?"#0A5C36":"#9CA3AF",fontFamily:"DM Sans"}}>{label}</span>
            {active&&<div style={{width:4,height:4,borderRadius:2,background:"#0A5C36"}}/>}
          </button>
        );
      })}
      {/* More (Analytics + Settings) */}
      {[{id:"analytics",Icon:BarChart2},{id:"settings",Icon:Settings}].map(({id,Icon})=>{
        const active=tab===id;
        return (
          <button key={id} onClick={()=>setTab(id)} style={{
            flex:0.7,display:"flex",flexDirection:"column",alignItems:"center",
            gap:2,padding:"9px 4px 7px",border:"none",cursor:"pointer",background:"none",
          }}>
            <Icon size={19} color={active?"#0A5C36":"#9CA3AF"}/>
            {active&&<div style={{width:4,height:4,borderRadius:2,background:"#0A5C36"}}/>}
          </button>
        );
      })}
    </div>
  );
}

// ─────────────────────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────────────────────

function Inner() {
  const {theme}=useTheme();
  const [tab,setTab]=useState("dashboard");
  const [desktop,setDesktop]=useState(window.innerWidth>=768);

  useEffect(()=>{
    const h=()=>setDesktop(window.innerWidth>=768);
    window.addEventListener("resize",h);
    return ()=>window.removeEventListener("resize",h);
  },[]);

  const pages={
    dashboard:   <Dashboard setTab={setTab}/>,
    transactions:<Transactions/>,
    budgets:     <Budgets/>,
    bills:       <Bills/>,
    goals:       <Goals/>,
    debts:       <Debts/>,
    analytics:   <Analytics/>,
    settings:    <SettingsPage/>,
  };

  return (
    <div style={{
      minHeight:"100vh",
      background:theme==="dark"?"#0F1A14":"#F0F4F1",
      fontFamily:"DM Sans,sans-serif",
      backgroundImage:theme==="dark"
        ?"radial-gradient(ellipse at 15% 15%,rgba(10,92,54,0.18) 0%,transparent 55%),radial-gradient(ellipse at 85% 85%,rgba(245,166,35,0.06) 0%,transparent 55%)"
        :"radial-gradient(ellipse at 15% 10%,rgba(10,92,54,0.07) 0%,transparent 55%),radial-gradient(ellipse at 85% 90%,rgba(245,166,35,0.05) 0%,transparent 55%)",
      display:"flex",flexDirection:"column",
    }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Serif+Display:ital@0;1&family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&display=swap');
        *{box-sizing:border-box;}
        body{margin:0;}
        @keyframes toastIn{from{opacity:0;transform:translateY(6px);}to{opacity:1;transform:translateY(0);}}
        ::-webkit-scrollbar{width:4px;}
        ::-webkit-scrollbar-track{background:transparent;}
        ::-webkit-scrollbar-thumb{background:rgba(10,92,54,0.25);border-radius:2px;}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none;}
        input[type=number]::-webkit-outer-spin-button{-webkit-appearance:none;}
      `}</style>
      <Header tab={tab} setTab={setTab}/>
      <div style={{display:"flex",flex:1,overflow:"hidden"}}>
        {desktop&&<Sidebar tab={tab} setTab={setTab}/>}
        <main style={{flex:1,overflowY:"auto",padding:desktop?"22px 28px":`14px 14px ${desktop?16:96}px`}}>
          <div style={{maxWidth:780,margin:"0 auto"}} key={tab}>
            {pages[tab]}
          </div>
        </main>
      </div>
      {!desktop&&<BottomNav tab={tab} setTab={setTab}/>}
    </div>
  );
}

export default function PesaTrack() {
  const [state,dispatch]=useReducer(reducer,init);
  return (
    <ThemeProvider>
      <CurrencyProvider>
        <AppCtx.Provider value={{...state,dispatch}}>
          <ToastProvider>
            <Inner/>
          </ToastProvider>
        </AppCtx.Provider>
      </CurrencyProvider>
    </ThemeProvider>
  );
}
