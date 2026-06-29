// Cloudflare Worker 배포 후 주소로 교체하세요.
const API_BASE = "https://YOUR-WORKER.yourname.workers.dev";

const LAWD_CODES = {
  "강남구":"11680", "강동구":"11740", "강북구":"11305", "강서구":"11500", "관악구":"11620",
  "광진구":"11215", "구로구":"11530", "금천구":"11545", "노원구":"11350", "도봉구":"11320",
  "동대문구":"11230", "동작구":"11590", "마포구":"11440", "서대문구":"11410", "서초구":"11650",
  "성동구":"11200", "성북구":"11290", "송파구":"11710", "양천구":"11470", "영등포구":"11560",
  "용산구":"11170", "은평구":"11380", "종로구":"11110", "중구":"11140", "중랑구":"11260"
};

const $ = (id) => document.getElementById(id);
let lastRows = [];

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
function render(rows){
  lastRows = rows.sort((a,b)=> b.date.localeCompare(a.date));
  $('tbody').innerHTML = lastRows.map(r => `<tr><td>${r.date}</td><td>${$('regionInput').value} ${r.dong}</td><td>${r.apt}</td><td>${r.area}</td><td>${r.floor}</td><td class="amount">${formatEok(r.amount)}</td><td>${r.buildYear}</td></tr>`).join('');
  $('csvBtn').disabled = !lastRows.length;
  if (!lastRows.length) { $('summary').classList.add('hidden'); return; }
  const prices = lastRows.map(r=>moneyToNum(r.amount)).filter(Boolean);
  const avg = Math.round(prices.reduce((a,b)=>a+b,0)/prices.length);
  const max = Math.max(...prices), min = Math.min(...prices);
  $('summary').innerHTML = `
    <div class="box"><span>거래 건수</span><b>${lastRows.length.toLocaleString()}건</b></div>
    <div class="box"><span>평균 거래가</span><b>${formatEok(avg)}</b></div>
    <div class="box"><span>최고 거래가</span><b>${formatEok(max)}</b></div>
    <div class="box"><span>최저 거래가</span><b>${formatEok(min)}</b></div>`;
  $('summary').classList.remove('hidden');
}
async function search(){
  const region = $('regionInput').value.trim();
  const aptKeyword = $('aptInput').value.trim().toLowerCase();
  const lawdCd = LAWD_CODES[region];
  if (!lawdCd) return alert('현재는 서울 구 이름 기준입니다. app.js에 법정동코드를 추가해 주세요.');
  if (!$('startMonth').value || !$('endMonth').value) return alert('기간을 선택해 주세요.');
  $('searchBtn').disabled = true; $('status').textContent = '조회 중입니다...'; $('tbody').innerHTML = '';
  try{
    const months = ymList($('startMonth').value, $('endMonth').value);
    const all = [];
    for (const ym of months) {
      const url = `${API_BASE}/apt-trade?lawdCd=${lawdCd}&dealYmd=${ym}`;
      const res = await fetch(url);
      if(!res.ok) throw new Error(await res.text());
      const json = await res.json();
      const items = Array.isArray(json.items) ? json.items : [];
      all.push(...items.map(normalizeItem));
    }
    const filtered = aptKeyword ? all.filter(r => r.apt.toLowerCase().includes(aptKeyword)) : all;
    $('status').textContent = filtered.length ? `${filtered.length.toLocaleString()}건 조회되었습니다.` : '조건에 맞는 거래가 없습니다.';
    render(filtered);
  } catch(e){
    console.error(e); $('status').textContent = '조회 실패: Worker 주소/API 키/CORS 설정을 확인하세요.';
  } finally { $('searchBtn').disabled = false; }
}
function downloadCSV(){
  const head = ['계약일','구/동','아파트','전용면적','층','거래금액','건축년도'];
  const lines = [head, ...lastRows.map(r=>[r.date, `${$('regionInput').value} ${r.dong}`, r.apt, r.area, r.floor, r.amount, r.buildYear])]
    .map(row => row.map(v => `"${String(v).replaceAll('"','""')}"`).join(','));
  const blob = new Blob(['\ufeff' + lines.join('\n')], {type:'text/csv;charset=utf-8'});
  const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = '아파트_실거래가.csv'; a.click();
}
$('searchBtn').addEventListener('click', search);
$('csvBtn').addEventListener('click', downloadCSV);
setDefaultMonths();
