// Cloudflare Worker 주소
const API_BASE = "https://apt-realprice-api.s-hg1.workers.dev";

const LAWD_CODES = {
  "강남구":"11680", "강동구":"11740", "강북구":"11305", "강서구":"11500", "관악구":"11620",
  "광진구":"11215", "구로구":"11530", "금천구":"11545", "노원구":"11350", "도봉구":"11320",
  "동대문구":"11230", "동작구":"11590", "마포구":"11440", "서대문구":"11410", "서초구":"11650",
  "성동구":"11200", "성북구":"11290", "송파구":"11710", "양천구":"11470", "영등포구":"11560",
  "용산구":"11170", "은평구":"11380", "종로구":"11110", "중구":"11140", "중랑구":"11260"
};

const $ = (id) => document.getElementById(id);
let selectedRegion = "강남구";
let selectedApt = "";
let lastRows = [];
let requestSeq = 0;

function ymList(start, end){
  const arr = [];
  let [sy, sm] = start.split('-').map(Number);
  const [ey, em] = end.split('-').map(Number);
  while (sy < ey || (sy === ey && sm <= em)) {
    arr.push(`${sy}${String(sm).padStart(2,'0')}`);
    sm++; if (sm === 13) { sm = 1; sy++; }
  }
  return arr;
}
function setDefaultMonths(){
  const now = new Date();
  const end = new Date(now.getFullYear(), now.getMonth(), 1);
  const start = new Date(now.getFullYear(), now.getMonth()-5, 1);
  const fmt = d => `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`;
  $('startMonth').value = fmt(start); $('endMonth').value = fmt(end);
}
function moneyToNum(v){ return Number(String(v||'').replaceAll(',','').trim()) || 0; }
function formatEok(v){
  const manwon = moneyToNum(v); const eok = manwon / 10000;
  return eok >= 1 ? `${eok.toFixed(2).replace(/\.00$/,'')}억` : `${manwon.toLocaleString()}만원`;
}
function normalizeItem(item){
  return {
    date: `${item.dealYear || item.년}-${String(item.dealMonth || item.월).padStart(2,'0')}-${String(item.dealDay || item.일).padStart(2,'0')}`,
    dong: item.umdNm || item.법정동 || '',
    apt: item.aptNm || item.아파트 || '',
    area: item.excluUseAr || item.전용면적 || '',
    floor: item.floor || item.층 || '',
    amount: item.dealAmount || item.거래금액 || '',
    buildYear: item.buildYear || item.건축년도 || ''
  };
}
function resetResult(message){
  $('tbody').innerHTML = '';
  $('summary').classList.add('hidden');
  $('csvBtn').disabled = true;
  $('resultTitle').textContent = '검색 결과';
  $('status').textContent = message;
}
function render(rows){
  lastRows = rows.sort((a,b)=> b.date.localeCompare(a.date));
  $('tbody').innerHTML = lastRows.map(r => `<tr><td>${r.date}</td><td>${selectedRegion} ${r.dong}</td><td>${r.apt}</td><td>${r.area}</td><td>${r.floor}</td><td class="amount">${formatEok(r.amount)}</td><td>${r.buildYear}</td></tr>`).join('');
  $('csvBtn').disabled = !lastRows.length;
  if (!lastRows.length) { $('summary').classList.add('hidden'); return; }
  const prices = lastRows.map(r=>moneyToNum(r.amount)).filter(Boolean);
  const avg = prices.length ? Math.round(prices.reduce((a,b)=>a+b,0)/prices.length) : 0;
  const max = prices.length ? Math.max(...prices) : 0;
  const min = prices.length ? Math.min(...prices) : 0;
  $('summary').innerHTML = `
    <div class="box"><span>거래 건수</span><b>${lastRows.length.toLocaleString()}건</b></div>
    <div class="box"><span>평균 거래가</span><b>${formatEok(avg)}</b></div>
    <div class="box"><span>최고 거래가</span><b>${formatEok(max)}</b></div>
    <div class="box"><span>최저 거래가</span><b>${formatEok(min)}</b></div>`;
  $('summary').classList.remove('hidden');
}
function renderRegions(){
  $('regionButtons').innerHTML = Object.keys(LAWD_CODES).map(region =>
    `<button class="region-chip ${region === selectedRegion ? 'active' : ''}" data-region="${region}">${region}</button>`
  ).join('');
  document.querySelectorAll('.region-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedRegion = btn.dataset.region;
      selectedApt = "";
      $('aptFilter').value = "";
      $('selectedRegionText').textContent = `${selectedRegion} 선택됨`;
      resetResult(`${selectedRegion} 아파트 리스트에서 단지를 선택해 주세요.`);
      renderRegions();
      renderAptList();
      $('aptPanel').classList.remove('hidden');
    });
  });
}
function renderAptList(){
  const keyword = $('aptFilter').value.trim().toLowerCase();
  const source = APT_LIST[selectedRegion] || [];
  const list = source.filter(name => name.toLowerCase().includes(keyword));
  $('aptCountText').textContent = `${list.length.toLocaleString()}개 단지`;
  if (!list.length) {
    $('aptList').innerHTML = `<div class="empty">등록된 단지가 없습니다. apt-list.js에 단지를 추가해 주세요.</div>`;
    return;
  }
  $('aptList').innerHTML = list.map(name =>
    `<button class="apt-row ${name === selectedApt ? 'active' : ''}" data-apt="${name}"><span class="name">${name}</span><span class="go">실거래 조회</span></button>`
  ).join('');
  document.querySelectorAll('.apt-row').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedApt = btn.dataset.apt;
      renderAptList();
      searchSelectedApt();
    });
  });
}
async function searchSelectedApt(){
  const seq = ++requestSeq;
  const lawCd = LAWD_CODES[selectedRegion];
  if (!lawCd || !selectedApt) return;
  if (!$('startMonth').value || !$('endMonth').value) return alert('기간을 선택해 주세요.');

  $('status').textContent = `${selectedRegion} ${selectedApt} 조회 중입니다...`;
  $('tbody').innerHTML = '';
  $('summary').classList.add('hidden');
  $('csvBtn').disabled = true;

  try{
    const months = ymList($('startMonth').value, $('endMonth').value);
    const all = [];
    for (const ym of months) {
      const url = `${API_BASE}/apt-trade?lawCd=${lawCd}&dealYmd=${ym}`;
      const res = await fetch(url);
      if(!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const items = Array.isArray(json.items) ? json.items : [];
      all.push(...items.map(normalizeItem));
    }
    if (seq !== requestSeq) return;
    const target = selectedApt.toLowerCase().replaceAll(' ', '');
    const filtered = all.filter(r => (r.apt || '').toLowerCase().replaceAll(' ', '').includes(target));
    $('resultTitle').textContent = `${selectedRegion} ${selectedApt}`;
    $('status').textContent = filtered.length ? `${filtered.length.toLocaleString()}건 조회되었습니다.` : '선택한 기간에 거래가 없습니다.';
    render(filtered);
  } catch(e){
    console.error(e);
    $('status').textContent = '조회 실패: Worker 주소/API 키/CORS 설정을 확인하세요.';
  }
}
function downloadCSV(){
  const head = ['계약일','구/동','아파트','전용면적','층','거래금액','건축년도'];
  const lines = [head, ...lastRows.map(r=>[r.date, `${selectedRegion} ${r.dong}`, r.apt, r.area, r.floor, r.amount, r.buildYear])]
    .map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(','));
  const blob = new Blob(['\ufeff' + lines.join('\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${selectedRegion}_${selectedApt}_실거래가.csv`; a.click();
}
$('aptFilter').addEventListener('input', renderAptList);
$('startMonth').addEventListener('change', () => { if(selectedApt) searchSelectedApt(); });
$('endMonth').addEventListener('change', () => { if(selectedApt) searchSelectedApt(); });
$('csvBtn').addEventListener('click', downloadCSV);
setDefaultMonths();
renderRegions();
renderAptList();
resetResult(`${selectedRegion} 아파트 리스트에서 단지를 선택해 주세요.`);
