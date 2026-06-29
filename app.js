// Cloudflare Worker 주소
const API_BASE = "https://apt-realprice-api.s-hg1.workers.dev";

const LAWD_CODES = {
  "강남구":"11680", "강동구":"11740", "강북구":"11305", "강서구":"11500", "관악구":"11620",
  "광진구":"11215", "구로구":"11530", "금천구":"11545", "노원구":"11350", "도봉구":"11320",
  "동대문구":"11230", "동작구":"11590", "마포구":"11440", "서대문구":"11410", "서초구":"11650",
  "성동구":"11200", "성북구":"11290", "송파구":"11710", "양천구":"11470", "영등포구":"11560",
  "용산구":"11170", "은평구":"11380", "종로구":"11110", "중구":"11140", "중랑구":"11260"
};

// API 낭비 방지용 사전 리스트입니다. 필요한 단지는 여기에 계속 추가하면 됩니다.
const APT_LIST = {
  "강남구": ["은마", "래미안대치팰리스", "도곡렉슬", "타워팰리스", "개포래미안포레스트", "디에이치아너힐즈", "래미안블레스티지", "압구정현대", "개포자이프레지던스"],
  "강동구": ["고덕그라시움", "고덕아르테온", "고덕자이", "래미안힐스테이트고덕", "고덕센트럴아이파크", "둔촌주공", "올림픽파크포레온"],
  "강북구": ["SK북한산시티", "래미안트리베라", "꿈의숲롯데캐슬", "수유벽산", "미아동부센트레빌"],
  "강서구": ["마곡엠밸리", "우장산힐스테이트", "강서힐스테이트", "염창동아", "등촌주공"],
  "관악구": ["e편한세상서울대입구", "관악드림타운", "봉천두산", "벽산블루밍", "관악푸르지오"],
  "광진구": ["광장현대", "구의현대", "자양우성", "자양한강극동", "래미안프리미어팰리스"],
  "구로구": ["신도림동아", "신도림대림", "구로두산", "개봉한마을", "고척벽산베스트블루밍"],
  "금천구": ["롯데캐슬골드파크", "금천현대", "벽산타운", "남서울힐스테이트", "관악산벽산타운"],
  "노원구": ["상계주공", "중계그린", "중계청구", "월계시영", "하계장미"],
  "도봉구": ["창동주공", "북한산아이파크", "도봉한신", "쌍문한양", "방학신동아"],
  "동대문구": ["래미안크레시티", "청량리역롯데캐슬SKY-L65", "전농SK", "답십리래미안위브", "휘경SK뷰"],
  "동작구": ["아크로리버하임", "흑석한강센트레빌", "상도래미안", "사당우성", "이수힐스테이트"],
  "마포구": ["마포래미안푸르지오", "공덕삼성", "상암월드컵파크", "마포자이", "래미안마포리버웰"],
  "서대문구": ["DMC파크뷰자이", "홍제센트럴아이파크", "북아현두산", "e편한세상신촌", "홍은벽산"],
  "서초구": ["아크로리버파크", "래미안원베일리", "반포자이", "래미안퍼스티지", "서초그랑자이", "방배그랑자이", "신반포자이"],
  "성동구": ["서울숲리버뷰자이", "왕십리텐즈힐", "옥수파크힐스", "금호자이", "트리마제"],
  "성북구": ["길음뉴타운", "래미안길음센터피스", "돈암한신한진", "종암SK", "월곡두산위브"],
  "송파구": ["헬리오시티", "잠실엘스", "리센츠", "트리지움", "파크리오", "올림픽선수기자촌", "잠실주공5단지"],
  "양천구": ["목동신시가지", "목동힐스테이트", "신정이펜하우스", "목동센트럴아이파크위브", "신월시영"],
  "영등포구": ["여의도시범", "당산삼성래미안", "문래자이", "영등포푸르지오", "신길센트럴자이"],
  "용산구": ["한가람", "한강맨션", "이촌코오롱", "래미안첼리투스", "용산센트럴파크해링턴스퀘어"],
  "은평구": ["은평뉴타운", "녹번역e편한세상캐슬", "백련산힐스테이트", "DMC롯데캐슬더퍼스트", "불광롯데캐슬"],
  "종로구": ["경희궁자이", "창신쌍용", "무악현대", "인왕산아이파크", "종로센트레빌"],
  "중구": ["서울역센트럴자이", "남산타운", "청구e편한세상", "신당푸르지오", "롯데캐슬베네치아"],
  "중랑구": ["사가정센트럴아이파크", "신내데시앙", "면목두산", "중화한신", "상봉프레미어스엠코"]
};

const $ = (id) => document.getElementById(id);
let selectedRegion = "강남구";
let selectedApt = "";
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
  $('tbody').innerHTML = lastRows.map(r => `<tr><td>${r.date}</td><td>${selectedRegion} ${r.dong}</td><td>${r.apt}</td><td>${r.area}</td><td>${r.floor}</td><td class="amount">${formatEok(r.amount)}</td><td>${r.buildYear}</td></tr>`).join('');
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
      $('resultTitle').textContent = '검색 결과';
      $('status').textContent = `${selectedRegion}에서 아파트를 선택해 주세요.`;
      $('tbody').innerHTML = '';
      $('summary').classList.add('hidden');
      $('csvBtn').disabled = true;
      renderRegions();
      renderAptList();
    });
  });
}
function renderAptList(){
  const keyword = $('aptFilter').value.trim().toLowerCase();
  const list = (APT_LIST[selectedRegion] || []).filter(name => name.toLowerCase().includes(keyword));
  $('aptCountText').textContent = `${list.length.toLocaleString()}개 단지`;
  $('aptList').innerHTML = list.map(name =>
    `<button class="apt-chip ${name === selectedApt ? 'active' : ''}" data-apt="${name}">${name}</button>`
  ).join('');
  document.querySelectorAll('.apt-chip').forEach(btn => {
    btn.addEventListener('click', () => {
      selectedApt = btn.dataset.apt;
      renderAptList();
      searchSelectedApt();
    });
  });
}
async function searchSelectedApt(){
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
    const filtered = all.filter(r => r.apt && r.apt.toLowerCase().includes(selectedApt.toLowerCase()));
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
