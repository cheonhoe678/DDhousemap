const state = { all: [], filtered: [], markers: new Map(), activeId: null, favorites: new Set(JSON.parse(localStorage.getItem('hug-favorites') || '[]')) };
const $ = (selector) => document.querySelector(selector);
const isStaticDeployment = location.hostname.endsWith('github.io') || location.hostname.endsWith('pages.dev');
const map = L.map('map', { zoomControl: false, minZoom: 7 }).setView([37.42, 126.82], 11);
L.control.zoom({ position: 'topright' }).addTo(map);
L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
  maxZoom: 19,
  attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
}).addTo(map);
const markerLayer = L.layerGroup().addTo(map);

const won = (value) => {
  const eok = value / 100_000_000;
  if (eok >= 1) return `${Number(eok.toFixed(2))}억`;
  return `${Math.round(value / 10_000_000) / 10}천만`;
};
const markerLabel = (value) => value >= 100_000_000 ? `${Number((value / 100_000_000).toFixed(1))}억` : `${Math.round(value / 1_000_000)}백`;
const escapeHtml = (text = '') => String(text).replace(/[&<>'"]/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[char]));
const getName = (item) => item.buildingName || item.address.match(/\s([^\s]+)\s+제?\d+층/)?.[1] || `${item.district} 주택`;

function iconFor(item, active = false) {
  if (map.getZoom() <= 10 && !active) {
    return L.divIcon({ className: '', html: '<div class="map-dot"></div>', iconSize: [10, 10], iconAnchor: [5, 5] });
  }
  return L.divIcon({
    className: '',
    html: `<div class="price-marker${active ? ' active' : ''}"><span>${markerLabel(item.depositWon)}</span></div>`,
    iconSize: [62, 32], iconAnchor: [10, 30], popupAnchor: [20, -28],
  });
}

function popupFor(item) {
  return `<h3 class="popup-title">${escapeHtml(getName(item))} ${escapeHtml(item.unit || '')}</h3>
    <p class="popup-address">${escapeHtml(item.address)}</p>
    <div class="popup-facts"><b>${item.areaPyeong}평</b><span>${item.areaM2}㎡</span><span>${won(item.depositWon)}</span><span>신청 ${item.applicants}명</span></div>
    <a class="popup-link" href="${item.detailUrl}" target="_blank" rel="noreferrer">HUG 상세에서 신청하기 ↗</a>`;
}

function selectListing(item, pan = true) {
  state.activeId = item.id;
  document.querySelectorAll('.listing-card').forEach((card) => card.classList.toggle('active', card.dataset.id === item.id));
  for (const [id, marker] of state.markers) marker.setIcon(iconFor(marker.options.item, id === item.id));
  const marker = state.markers.get(item.id);
  if (marker) {
    if (pan) map.setView(marker.getLatLng(), Math.max(map.getZoom(), 15), { animate: true });
    marker.openPopup();
  }
}

function renderMarkers() {
  markerLayer.clearLayers();
  state.markers.clear();
  state.filtered.filter((item) => item.lat && item.lng).forEach((item) => {
    const marker = L.marker([item.lat, item.lng], { icon: iconFor(item), item }).bindPopup(popupFor(item));
    marker.on('click', () => {
      state.activeId = item.id;
      document.querySelectorAll('.listing-card').forEach((card) => card.classList.toggle('active', card.dataset.id === item.id));
    });
    marker.addTo(markerLayer);
    state.markers.set(item.id, marker);
  });
}

function refreshMarkerIcons() {
  for (const [id, marker] of state.markers) marker.setIcon(iconFor(marker.options.item, id === state.activeId));
}

function renderList() {
  $('#resultCount').textContent = state.filtered.length.toLocaleString('ko-KR');
  if (!state.filtered.length) {
    $('#listingList').innerHTML = '<div class="empty">조건에 맞는 집이 없어요.<br>필터를 조금 넓혀보세요.</div>';
    return;
  }
  $('#listingList').innerHTML = state.filtered.map((item) => `<button class="listing-card${item.id === state.activeId ? ' active' : ''}" data-id="${item.id}" type="button">
    <div class="card-head"><h2>${escapeHtml(getName(item))} <small>${escapeHtml(item.unit || '')}</small></h2><span class="type-badge">${escapeHtml(item.housingType.replace('(주거용)', ''))}</span></div>
    <p class="address">${escapeHtml(item.address)}</p>
    <div class="facts"><span>전용면적<strong>${item.areaPyeong}평 <small>· ${item.areaM2}㎡</small></strong></span><span>보증금<strong>${won(item.depositWon)}</strong></span><span>현재 신청<strong>${item.applicants}명</strong></span></div>
  </button>`).join('');
  document.querySelectorAll('.listing-card').forEach((card) => card.addEventListener('click', () => {
    const item = state.filtered.find((entry) => entry.id === card.dataset.id);
    selectListing(item);
    if (innerWidth <= 760) {
      document.body.classList.add('map-view');
      document.querySelectorAll('.mobile-tabs button').forEach((button) => button.classList.toggle('active', button.dataset.view === 'map'));
      setTimeout(() => map.invalidateSize(), 20);
    }
  }));
}

function applyFilters() {
  const query = $('#searchInput').value.trim().toLowerCase();
  const city = $('#cityFilter').value;
  const district = $('#districtFilter').value;
  const [areaMin, areaMax] = ($('#areaFilter').value || '0-Infinity').split('-').map(Number);
  const [depositMin, depositMax] = ($('#depositFilter').value || '0-Infinity').split('-').map(Number);
  state.filtered = state.all.filter((item) => {
    const haystack = `${item.city} ${item.district} ${item.address} ${item.buildingName || ''}`.toLowerCase();
    return (!query || haystack.includes(query)) && (!city || item.city === city) && (!district || item.district === district)
      && item.areaPyeong >= areaMin && item.areaPyeong < areaMax
      && item.depositWon >= depositMin && item.depositWon < depositMax;
  });
  const sort = $('#sortSelect').value;
  state.filtered.sort((a, b) => sort === 'areaDesc' ? b.areaM2 - a.areaM2
    : sort === 'depositAsc' ? a.depositWon - b.depositWon
      : sort === 'ratio' ? (a.depositWon / a.areaM2) - (b.depositWon / b.areaM2)
        : a.applicants - b.applicants);
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
  const points = state.filtered.filter((item) => item.lat && item.lng).map((item) => [item.lat, item.lng]);
  if (points.length) map.fitBounds(points, { padding: [45, 45], maxZoom: 15 });
}

async function loadData() {
  const response = await fetch(`./data.json?v=${Date.now()}`);
  if (!response.ok) throw new Error('data.json을 불러오지 못했습니다.');
  const data = await response.json();
  state.all = data.listings;
  const cities = [...new Set(state.all.map((item) => item.city))].sort();
  $('#cityFilter').innerHTML += cities.map((city) => `<option>${escapeHtml(city)}</option>`).join('');
  updateDistrictOptions();
  const shortCity = (city) => city.replace('특별시', '').replace('광역시', '').replace('도', '');
  $('#regionSummary').innerHTML = cities.map((city) => `<span class="region-stat">${escapeHtml(shortCity(city))}<strong>${state.all.filter((item) => item.city === city).length}</strong></span>`).join('');
  $('#updatedAt').textContent = `${new Date(data.meta.fetchedAt).toLocaleString('ko-KR')} 기준 · 좌표 ${data.meta.located}/${data.meta.total}`;
  $('#sourceLink').href = data.meta.source;
  applyFilters();
  fitMarkers();
}

['searchInput', 'districtFilter', 'areaFilter', 'depositFilter', 'sortSelect'].forEach((id) => {
  $(`#${id}`).addEventListener(id === 'searchInput' ? 'input' : 'change', applyFilters);
});
$('#cityFilter').addEventListener('change', () => { updateDistrictOptions(); applyFilters(); });
$('#fitButton').addEventListener('click', fitMarkers);
map.on('zoomend', refreshMarkerIcons);
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
  if (button.dataset.view === 'map') setTimeout(() => map.invalidateSize(), 20);
}));

const deadline = new Date('2026-08-07T17:00:00+09:00');
const days = Math.ceil((deadline - new Date()) / 86_400_000);
$('#countdown').textContent = days > 0 ? `D-${days}` : days === 0 ? '오늘 마감' : '접수 마감';

$('#listingList').innerHTML = '<div class="empty">HUG 주택 목록을 정리하고 있습니다.</div>';
loadData().catch((error) => { $('#listingList').innerHTML = `<div class="empty">${escapeHtml(error.message)}<br>터미널에서 npm run refresh를 실행해주세요.</div>`; });
