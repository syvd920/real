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
function normalizeText(v){ return String(v || '').toLowerCase().replaceAll(' ', '').replace(/[()\[\]{}·\.\-_/]/g,''); }
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
      resetResult(`${selectedRegion} 아파트명을 검색하거나 리스트에서 단지를 선택해 주세요.`);
      renderRegions();
      renderAptList();
    });
  });
}
function renderAptList(){
  const keyword = $('aptFilter').value.trim();
  const source = APT_LIST[selectedRegion] || [];
  const list = source.filter(name => normalizeText(name).includes(normalizeText(keyword)));
  $('aptCountText').textContent = keyword ? `${list.length.toLocaleString()}개 검색됨` : `${source.length.toLocaleString()}개 단지`;
  if (!list.length) {
    $('aptList').innerHTML = `<div class="empty"><b>등록 리스트에 없습니다.</b><br>그래도 입력한 단지명으로 바로 조회할 수 있습니다.<br><button class="empty-search-btn" type="button">입력명 그대로 실거래 조회</button></div>`;
    const emptyBtn = document.querySelector('.empty-search-btn');
    if (emptyBtn) emptyBtn.addEventListener('click', () => searchSelectedApt());
    return;
  }
  $('aptList').innerHTML = list.map(name =>
    `<button class="apt-row ${name === selectedApt ? 'active' : ''}" data-apt="${name}"><span class="name">${name}</span><span class="go">실거래 조회</span></button>`
  ).join('');
  document.querySelectorAll('.apt-row').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedApt = btn.dataset.apt;
      $('aptFilter').value = selectedApt;
      renderAptList();
      searchSelectedApt(selectedApt);
    });
  });
}
async function fetchRegionMonths(lawCd, months){
  const all = [];
  for (const ym of months) {
    // 현재 세영님 Worker는 lawdCd 파라미터를 요구합니다.
    const url = `${API_BASE}/apt-trade?lawdCd=${lawCd}&dealYmd=${ym}`;
    const res = await fetch(url);
    if(!res.ok) throw new Error(await res.text());
    const json = await res.json();
    const items = Array.isArray(json.items) ? json.items : [];
    all.push(...items.map(normalizeItem));
  }
  return all;
}
async function searchSelectedApt(aptName){
  const seq = ++requestSeq;
  const lawCd = LAWD_CODES[selectedRegion];
  const query = (aptName || $('aptFilter').value || '').trim();
  if (!lawCd || !query) return alert('아파트명을 입력하거나 선택해 주세요.');
  if (!$('startMonth').value || !$('endMonth').value) return alert('기간을 선택해 주세요.');

  selectedApt = query;
  $('status').textContent = `${selectedRegion} ${query} 조회 중입니다...`;
  $('tbody').innerHTML = '';
  $('summary').classList.add('hidden');
  $('csvBtn').disabled = true;

  try{
    const months = ymList($('startMonth').value, $('endMonth').value);
    const all = await fetchRegionMonths(lawCd, months);
    if (seq !== requestSeq) return;
    const target = normalizeText(query);
    const filtered = all.filter(r => normalizeText(r.apt).includes(target));
    $('resultTitle').textContent = `${selectedRegion} ${query}`;
    $('status').textContent = filtered.length ? `${filtered.length.toLocaleString()}건 조회되었습니다.` : '선택한 기간에 거래가 없습니다.';
    render(filtered);
  } catch(e){
    console.error(e);
    $('status').textContent = `조회 실패: ${e.message || 'Worker/API 설정을 확인하세요.'}`;
  }
}
function downloadCSV(){
  const head = ['계약일','구/동','아파트','전용면적','층','거래금액','건축년도'];
  const lines = [head, ...lastRows.map(r=>[r.date, `${selectedRegion} ${r.dong}`, r.apt, r.area, r.floor, r.amount, r.buildYear])]
    .map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(','));
  const blob = new Blob(['\ufeff' + lines.join('\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = `${selectedRegion}_${selectedApt || '검색'}_실거래가.csv`;
  a.click();
}
$('aptFilter').addEventListener('input', renderAptList);
$('aptFilter').addEventListener('keydown', (e) => { if(e.key === 'Enter') searchSelectedApt(); });
$('directSearchBtn').addEventListener('click', () => searchSelectedApt());
$('startMonth').addEventListener('change', () => { if(selectedApt) searchSelectedApt(selectedApt); });
$('endMonth').addEventListener('change', () => { if(selectedApt) searchSelectedApt(selectedApt); });
$('csvBtn').addEventListener('click', downloadCSV);
setDefaultMonths();
renderRegions();
renderAptList();
resetResult(`${selectedRegion} 아파트명을 검색하거나 리스트에서 단지를 선택해 주세요.`);
