const state = { all: [], filtered: [], markers: new Map(), activeKey: null, favorites: new Set(JSON.parse(localStorage.getItem('hug-favorites') || '[]')) };
const $ = (selector) => document.querySelector(selector);
const isStaticDeployment = location.hostname.endsWith('github.io') || location.hostname.endsWith('pages.dev');
const map = new naver.maps.Map('map', {
  center: new naver.maps.LatLng(37.42, 126.82),
  zoom: 11,
  minZoom: 7,
  zoomControl: true,
  zoomControlOptions: { position: naver.maps.Position.RIGHT_CENTER },
});
const infoWindow = new naver.maps.InfoWindow({
  borderWidth: 0,
  backgroundColor: 'transparent',
  anchorSize: new naver.maps.Size(12, 12),
  pixelOffset: new naver.maps.Point(0, -8),
});

const won = (value) => {
  const eok = value / 100_000_000;
  if (eok >= 1) return `${Number(eok.toFixed(2))}억`;
  return `${Math.round(value / 10_000_000) / 10}천만`;
};
const markerLabel = (value) => value >= 100_000_000 ? `${Number((value / 100_000_000).toFixed(1))}억` : `${Math.round(value / 1_000_000)}백`;
const escapeHtml = (text = '') => String(text).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const getName = (item) => item.buildingName || item.address.match(/\s([^\s]+)\s+제?\d+층/)?.[1] || `${item.district} 주택`;
const itemKey = (item) => `${item.round}-${item.id}`;

function iconFor(item, active = false) {
  if (map.getZoom() <= 10 && !active) {
    return { content: `<div class="map-dot${item.evCharger ? ' has-charger' : ''}"></div>`, size: new naver.maps.Size(10, 10), anchor: new naver.maps.Point(5, 5) };
  }
  return {
    content: `<div class="price-marker${active ? ' active' : ''}${item.evCharger ? ' has-charger' : ''}"><span>${markerLabel(item.depositWon)}</span></div>`,
    size: new naver.maps.Size(62, 32),
    anchor: new naver.maps.Point(10, 30),
  };
}

function popupFor(item) {
  const charger = item.evCharger
    ? `<a class="charger-link" href="${escapeHtml(item.evCharger.mapUrl)}" target="_blank" rel="noreferrer">⚡ ${escapeHtml(item.evCharger.name)} · ${item.evCharger.distanceM}m</a>`
    : '';
  return `<div class="naver-popup"><h3 class="popup-title">${escapeHtml(getName(item))} ${escapeHtml(item.unit || '')}</h3>
    <p class="popup-address">${escapeHtml(item.address)}</p>
    <div class="popup-facts"><b>${item.areaPyeong}평</b><span>${item.areaM2}㎡</span><span>${won(item.depositWon)}</span><span>신청 ${item.applicants}명</span></div>
    ${charger}<a class="popup-link" href="${item.detailUrl}" target="_blank" rel="noreferrer">HUG 상세에서 신청하기 ↗</a></div>`;
}

function selectListing(item, pan = true) {
  const key = itemKey(item);
  state.activeKey = key;
  document.querySelectorAll('.listing-card').forEach((card) => card.classList.toggle('active', card.dataset.key === key));
  for (const [markerKey, marker] of state.markers) marker.setIcon(iconFor(marker.item, markerKey === key));
  const marker = state.markers.get(key);
  if (marker) {
    if (pan) {
      map.panTo(marker.getPosition());
      if (map.getZoom() < 15) map.setZoom(15);
    }
    infoWindow.setContent(popupFor(item));
    infoWindow.open(map, marker);
  }
}

function renderMarkers() {
  for (const marker of state.markers.values()) marker.setMap(null);
  state.markers.clear();
  state.filtered.filter((item) => item.lat && item.lng).forEach((item) => {
    const key = itemKey(item);
    const marker = new naver.maps.Marker({
      map,
      position: new naver.maps.LatLng(item.lat, item.lng),
      icon: iconFor(item),
    });
    marker.item = item;
    naver.maps.Event.addListener(marker, 'click', () => selectListing(item, false));
    state.markers.set(key, marker);
  });
}

function refreshMarkerIcons() {
  for (const [key, marker] of state.markers) marker.setIcon(iconFor(marker.item, key === state.activeKey));
}

function renderList() {
  $('#resultCount').textContent = state.filtered.length.toLocaleString('ko-KR');
  if (!state.filtered.length) {
    $('#listingList').innerHTML = '<div class="empty">조건에 맞는 집이 없어요.<br>필터를 조금 넓혀보세요.</div>';
    return;
  }
  $('#listingList').innerHTML = state.filtered.map((item) => `<button class="listing-card${itemKey(item) === state.activeKey ? ' active' : ''}" data-key="${itemKey(item)}" type="button">
    <div class="card-head"><h2>${escapeHtml(getName(item))} <small>${escapeHtml(item.unit || '')}</small></h2><span>${item.evCharger ? `<b class="charger-badge">⚡ ${item.evCharger.distanceM}m</b>` : ''}<b class="round-badge">${item.round}차</b><span class="type-badge">${escapeHtml(item.housingType.replace('(주거용)', ''))}</span></span></div>
    <p class="address">${escapeHtml(item.address)}</p>
    <div class="facts"><span>전용면적<strong>${item.areaPyeong}평 <small>· ${item.areaM2}㎡</small></strong></span><span>보증금<strong>${won(item.depositWon)}</strong></span><span>현재 신청<strong>${item.applicants}명</strong></span></div>
  </button>`).join('');
  document.querySelectorAll('.listing-card').forEach((card) => card.addEventListener('click', () => {
    const item = state.filtered.find((entry) => itemKey(entry) === card.dataset.key);
    selectListing(item);
    if (innerWidth <= 760) {
      document.body.classList.add('map-view');
      document.querySelectorAll('.mobile-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.view === 'map'));
      setTimeout(() => map.refresh(), 20);
    }
  }));
}

function updateRoundInfo() {
  const selectedRound = Number($('#roundFilter').value) || Math.max(...state.all.map((item) => item.round));
  const item = state.all.find((listing) => listing.round === selectedRound);
  $('#applicationPeriod').textContent = item?.applicationPeriod || 'HUG 원문에서 확인';
  const match = item?.applicationPeriod?.match(/~\s*(\d{4})\.(\d{2})\.(\d{2})\.\s*(\d{2}):(\d{2})/);
  const deadline = match && new Date(`${match[1]}-${match[2]}-${match[3]}T${match[4]}:${match[5]}:00+09:00`);
  const days = deadline ? Math.ceil((deadline - new Date()) / 86_400_000) : null;
  $('#countdown').textContent = days === null ? '' : days > 0 ? `D-${days}` : days === 0 ? '오늘 마감' : '접수 마감';
}

function applyFilters() {
  const query = $('#searchInput').value.trim().toLowerCase();
  const round = Number($('#roundFilter').value);
  const city = $('#cityFilter').value;
  const district = $('#districtFilter').value;
  const [areaMin, areaMax] = ($('#areaFilter').value || '0-Infinity').split('-').map(Number);
  const [depositMin, depositMax] = ($('#depositFilter').value || '0-Infinity').split('-').map(Number);
  const chargerOnly = $('#chargerFilter').value === 'yes';
  state.filtered = state.all.filter((item) => {
    const haystack = `${item.city} ${item.district} ${item.address} ${item.buildingName || ''}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!round || item.round === round) && (!city || item.city === city) && (!district || item.district === district)
      && item.areaPyeong >= areaMin && item.areaPyeong < areaMax
      && item.depositWon >= depositMin && item.depositWon < depositMax
      && (!chargerOnly || item.evCharger);
  });
  const sort = $('#sortSelect').value;
  state.filtered.sort((a, b) => sort === 'areaDesc' ? b.areaM2 - a.areaM2
    : sort === 'depositAsc' ? a.depositWon - b.depositWon
      : sort === 'ratio' ? (a.depositWon / a.areaM2) - (b.depositWon / b.areaM2)
        : a.applicants - b.applicants);
  updateRoundInfo();
  renderList();
  renderMarkers();
}

function updateDistrictOptions() {
  const city = $('#cityFilter').value;
  const districts = [...new Set(state.all.filter((item) => !city || item.city === city).map((item) => item.district))].sort();
  $('#districtFilter').innerHTML = '<option value="">전체 시·군·구</option>' + districts.map((district) => `<option>${escapeHtml(district)}</option>`).join('');
}

function showToast(message) {
  const toast = $('#toast');
  toast.textContent = message;
  toast.classList.add('show');
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove('show'), 3500);
}

function fitMarkers() {
  const points = state.filtered.filter((item) => item.lat && item.lng);
  if (!points.length) return;
  const bounds = new naver.maps.LatLngBounds();
  points.forEach((item) => bounds.extend(new naver.maps.LatLng(item.lat, item.lng)));
  map.fitBounds(bounds, { top: 45, right: 45, bottom: 45, left: 45 });
}

async function loadData() {
  const response = await fetch(`./data.json?v=${Date.now()}`);
  if (!response.ok) throw new Error('data.json을 불러오지 못했습니다.');
  const data = await response.json();
  state.all = data.listings.map((item) => ({ ...item, round: Number(item.round) || 11 }));
  const rounds = [...new Set(state.all.map((item) => item.round))].sort((a, b) => b - a);
  $('#roundFilter').innerHTML += rounds.map((round) => `<option value="${round}">${round}차</option>`).join('');
  $('#roundFilter').value = String(rounds[0]);
  const cities = [...new Set(state.all.map((item) => item.city))].sort();
  $('#cityFilter').innerHTML += cities.map((city) => `<option>${escapeHtml(city)}</option>`).join('');
  updateDistrictOptions();
  const shortCity = (city) => city.replace('특별시', '').replace('광역시', '').replace('도', '');
  $('#regionSummary').innerHTML = cities.map((city) => `<span class="region-stat">${escapeHtml(shortCity(city))}<strong>${state.all.filter((item) => item.city === city).length}</strong></span>`).join('');
  $('#roundSummary').textContent = `2026 든든전세 · ${rounds.map((round) => `${round}차`).join(' · ')}`;
  if (data.meta.evCheckedAt) {
    $('#chargerFilter').disabled = false;
    $('#chargerFilter').options[0].textContent = '전체 매물';
  }
  const latestCount = state.all.filter((item) => item.round === rounds[0]).length;
  const applicantStatus = data.meta.applicantsChecked ? ` · 이번 갱신 ${data.meta.applicantsChecked}/${latestCount}` : '';
  $('#updatedAt').textContent = `${new Date(data.meta.fetchedAt).toLocaleString('ko-KR')} 기준${applicantStatus} · 좌표 ${data.meta.located}/${data.meta.total}`;
  $('#sourceLink').href = data.meta.source;
  applyFilters();
  fitMarkers();
}

['searchInput', 'roundFilter', 'districtFilter', 'areaFilter', 'depositFilter', 'chargerFilter', 'sortSelect'].forEach((id) => {
  $(`#${id}`).addEventListener(id === 'searchInput' ? 'input' : 'change', applyFilters);
});
$('#cityFilter').addEventListener('change', () => { updateDistrictOptions(); applyFilters(); });
$('#fitButton').addEventListener('click', fitMarkers);
naver.maps.Event.addListener(map, 'zoom_changed', refreshMarkerIcons);
if (isStaticDeployment) {
  $('#refreshButton').hidden = true;
  $('#refreshButton').setAttribute('aria-hidden', 'true');
}
$('#refreshButton').addEventListener('click', async () => {
  const button = $('#refreshButton');
  button.classList.add('loading');
  button.disabled = true;
  showToast('HUG 원문과 지도 좌표를 다시 확인하고 있습니다. 약 1분 걸립니다.');
  try {
    const response = await fetch('/api/refresh', { method: 'POST' });
    const result = await response.json();
    if (!response.ok) throw new Error(result.error);
    location.reload();
  } catch (error) {
    showToast(`새로고침 실패: ${error.message}`);
  } finally {
    button.classList.remove('loading');
    button.disabled = false;
  }
});

document.querySelectorAll('.mobile-tabs button').forEach((button) => button.addEventListener('click', () => {
  document.body.classList.toggle('map-view', button.dataset.view === 'map');
  document.querySelectorAll('.mobile-tabs button').forEach((item) => item.classList.toggle('active', item === button));
  if (button.dataset.view === 'map') setTimeout(() => map.refresh(), 20);
}));

$('#listingList').innerHTML = '<div class="empty">HUG 주택 목록을 정리하고 있습니다.</div>';
loadData().catch((error) => { $('#listingList').innerHTML = `<div class="empty">${escapeHtml(error.message)}<br>터미널에서 npm run refresh를 실행해주세요.</div>`; });
