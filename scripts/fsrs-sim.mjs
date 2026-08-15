// Simulation of the proposed evidence model against the app's real FSRS-4.5 primitives.
const FSRS_W=[0.40,0.60,2.40,5.80,4.93,0.94,0.86,0.01,1.49,0.14,0.94,2.18,0.05,0.34,1.26,0.29,2.61];
const DECAY=-0.5, FACTOR=Math.pow(0.9,1/DECAY)-1;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const forgetting=(t,S)=>Math.pow(1+FACTOR*t/Math.max(0.01,S),DECAY);
const intervalForRetention=(S,R)=>(S/FACTOR)*(Math.pow(R,1/DECAY)-1);
const stabilityAfterLapse=(D,S,R)=>clamp(FSRS_W[11]*Math.pow(D,-FSRS_W[12])*(Math.pow(S+1,FSRS_W[13])-1)*Math.exp(FSRS_W[14]*(1-R)),0.1,S);
const nextDifficulty=(D,g)=>clamp(FSRS_W[7]*(FSRS_W[4]-FSRS_W[5])+(1-FSRS_W[7])*(D-FSRS_W[6]*(g-3)),1,10);

// ---- proposed: evidence weight per mistake category, graded by Newman stage ----
const EVIDENCE={
  'Concept gap':1.00,            // Transformation — no method to select
  'Missed the clever step':0.60, // Transformation — had the tools, missed the choice
  'Method error':0.33,           // Process skills — right plan, wrong procedure
  'Ran out of time':0.25,        // fluency: known, but not automatic
  'Misread question':0.15,       // Reading/Comprehension — not topic memory
  'Calculation error':0.12,      // Process skills (arithmetic)
  'Transcription slip':0.08,     // Encoding
  'Silly mistake':0.08,          // Encoding / noise
};

// A mistake is an OBSERVATION, not a rehearsal: it revises S and D but does not
// reset `last`, so the displayed memory % drops immediately instead of resetting to ~100%.
function applyMistake(rec,E){
  const t=rec.t, R=forgetting(t,rec.S);
  const Slapse=stabilityAfterLapse(rec.D,rec.S,R);
  return { S: rec.S - E*(rec.S-Slapse), D: rec.D + E*(nextDifficulty(rec.D,1)-rec.D), t };
}

const pct=x=>(x*100).toFixed(1)+'%';
const START={S:30,D:5,t:10};   // a well-learned topic, last reviewed 10 days ago

console.log(`Start: S=${START.S}d  D=${START.D}  last reviewed ${START.t}d ago  ->  memory ${pct(forgetting(START.t,START.S))}\n`);
console.log('How many of each mistake type before memory meaningfully drops');
console.log('(memory % shown after n mistakes of that type; "due in" at target R=0.90)\n');

const head='category'.padEnd(24)+'E'.padStart(6)+['n=1','n=2','n=3','n=4','n=5'].map(s=>s.padStart(9)).join('');
console.log(head); console.log('-'.repeat(head.length));
for(const [cat,E] of Object.entries(EVIDENCE)){
  let rec={...START}; const cells=[];
  for(let n=1;n<=5;n++){ rec=applyMistake(rec,E); cells.push(pct(forgetting(rec.t,rec.S)).padStart(9)); }
  console.log(cat.padEnd(24)+E.toFixed(2).padStart(6)+cells.join(''));
}

console.log('\n\nSame thing as stability (days) and next-review timing:\n');
const h2='category'.padEnd(24)+['S after 1','due in','S after 3','due in'].map(s=>s.padStart(11)).join('');
console.log(h2); console.log('-'.repeat(h2.length));
for(const [cat,E] of Object.entries(EVIDENCE)){
  let r1={...START}; r1=applyMistake(r1,E);
  let r3={...START}; for(let i=0;i<3;i++) r3=applyMistake(r3,E);
  const due=r=>{ const iv=intervalForRetention(r.S,0.90); const d=Math.round(iv-r.t);
                 return d<=0?`overdue ${-d}d`:`${d}d`; };
  console.log(cat.padEnd(24)+(r1.S.toFixed(1)+'d').padStart(11)+due(r1).padStart(11)
                            +(r3.S.toFixed(1)+'d').padStart(11)+due(r3).padStart(11));
}

// ---- proposed: past-paper question -> graded retrieval ----
console.log('\n\nPast-paper question -> rating, with blame-dilution for multi-topic questions');
console.log('confidence c = r + (1-r)/k : a high mark confirms every topic tagged,');
console.log('a low mark is ambiguous when k topics share the question.\n');
const ratingFor=r=> r===0?1 : r<0.4?2 : r<0.7?3 : r<0.95?4 : 5;
const h3='marks'.padEnd(12)+'ratio'.padStart(8)+'rating'.padStart(8)+['c (k=1)','c (k=2)','c (k=3)'].map(s=>s.padStart(10)).join('');
console.log(h3); console.log('-'.repeat(h3.length));
for(const [got,max] of [[0,5],[1,5],[2,5],[3,5],[4,5],[5,5]]){
  const r=got/max;
  console.log(`${got}/${max}`.padEnd(12)+r.toFixed(2).padStart(8)+String(ratingFor(r)).padStart(8)
    +[1,2,3].map(k=>(r+(1-r)/k).toFixed(2).padStart(10)).join(''));
}
