// App-shell interaction regressions in an isolated DOM; no browser or business data.
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { createServer as createVite } from 'vite';

const dom = new JSDOM('<!doctype html><html><body></body></html>', {
  url: 'http://127.0.0.1:5173/', pretendToBeVisual: true,
});
const previous = new Map();
function install(name, value) {
  previous.set(name, Object.getOwnPropertyDescriptor(globalThis, name));
  Object.defineProperty(globalThis, name, { configurable: true, writable: true, value });
}
for (const name of ['window', 'document', 'navigator', 'location', 'localStorage', 'HTMLElement', 'HTMLInputElement', 'HTMLTextAreaElement', 'HTMLSelectElement', 'Element', 'Node', 'Event', 'MouseEvent', 'KeyboardEvent', 'File', 'FileReader', 'FormData', 'MutationObserver']) {
  install(name, name === 'window' ? dom.window : dom.window[name]);
}
install('getComputedStyle', dom.window.getComputedStyle.bind(dom.window));
install('IS_REACT_ACT_ENVIRONMENT', true);
let scrollY = 0, nextFrame = 0;
const frames = new Map();
Object.defineProperty(dom.window, 'scrollY', { configurable: true, get: () => scrollY });
dom.window.scrollTo = (x, y) => { scrollY = Number(typeof x === 'object' ? x.top || 0 : y || 0); };
dom.window.requestAnimationFrame = callback => { const id = ++nextFrame; frames.set(id, callback); return id; };
dom.window.cancelAnimationFrame = id => frames.delete(id);
install('requestAnimationFrame', dom.window.requestAnimationFrame);
install('cancelAnimationFrame', dom.window.cancelAnimationFrame);
dom.window.HTMLElement.prototype.scrollIntoView = function () {};

let width = 1440, reduceMotion = false;
const mediaQueries = new Map();
function mediaMatches(query) {
  if (query === '(prefers-reduced-motion: reduce)') return reduceMotion;
  const maximum = /max-width:\s*(\d+)px/.exec(query);
  const minimum = /min-width:\s*(\d+)px/.exec(query);
  assert.ok(maximum || minimum, `Unexpected shell media query: ${query}`);
  return (!maximum || width <= Number(maximum[1])) && (!minimum || width >= Number(minimum[1]));
}
dom.window.matchMedia = query => {
  if (!mediaQueries.has(query)) {
    const listeners = new Set();
    const media = {
      media: query,
      get matches() { return mediaMatches(query); },
      addEventListener(type, listener) { assert.equal(type, 'change'); listeners.add(listener); },
      removeEventListener(type, listener) { assert.equal(type, 'change'); listeners.delete(listener); },
      listeners,
    };
    mediaQueries.set(query, media);
  }
  return mediaQueries.get(query);
};
Object.defineProperty(dom.window, 'innerWidth', { configurable: true, get: () => width });

// Explicit synthetic geometry exercises grouping logic, not browser layout.
let quickWidth = 1200, measuredRouteWidth = 120;
const resizeObservers = new Set();
class NavigationResizeObserver {
  constructor(callback) { this.callback = callback; this.elements = new Set(); resizeObservers.add(this); }
  observe(element) { this.elements.add(element); }
  unobserve(element) { this.elements.delete(element); }
  disconnect() { this.elements.clear(); resizeObservers.delete(this); }
}
install('ResizeObserver', NavigationResizeObserver);
dom.window.ResizeObserver = NavigationResizeObserver;
const originalBounds = dom.window.HTMLElement.prototype.getBoundingClientRect;
const originalClientWidth = Object.getOwnPropertyDescriptor(dom.window.HTMLElement.prototype, 'clientWidth');
dom.window.HTMLElement.prototype.getBoundingClientRect = function () {
  let measured;
  if (this.matches('.quick-navigation, .quick-navigation-rail')) measured = quickWidth;
  else if (this.matches('[data-measure-page]')) measured = measuredRouteWidth;
  else if (this.matches('[data-measure-more]')) measured = 126;
  if (measured === undefined) return originalBounds.call(this);
  return { x: 0, y: 110, left: 0, top: 110, right: measured, bottom: 166, width: measured, height: 56, toJSON() { return this; } };
};
Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', { configurable: true, get() { return this.matches('.quick-navigation, .quick-navigation-rail') ? quickWidth : 0; } });

const nativeFetch = globalThis.fetch;
const requests = [];
let role = 'landlord';
let fixtureUserId = 'shell-fixture-user';
const firstPropertyId = 'shell-fixture-property', secondPropertyId = 'shell-fixture-property-2';
const standardProperties = [
  { id: firstPropertyId, name: 'Nhà trọ thử nghiệm', address: 'Địa chỉ minh họa' },
  { id: secondPropertyId, name: 'Nhà trọ thứ hai', address: 'Địa chỉ minh họa thứ hai' },
];
let fixtureProperties = standardProperties;
let fixtureRevision = 0;
let collections = [];
let allowPropertyCreation = false;
const propertyCreates = [];
globalThis.fetch = async (url, options = {}) => {
  const path = String(url), method = options.method || 'GET';
  requests.push({ path, method });
  if (method !== 'GET') {
    assert.ok(allowPropertyCreation && method === 'POST' && path === '/api/properties', 'Only the explicit in-memory property-creation scenario permits a mocked write');
    const values = JSON.parse(options.body);
    propertyCreates.push(values);
    const created = { ...values, id: 'created-from-header' };
    fixtureProperties = [...fixtureProperties, created];
    return new Response(JSON.stringify(created), { status: 201, headers: { 'Content-Type': 'application/json' } });
  }
  let result;
  if (path === '/api/bootstrap') {
    const data = Object.fromEntries(collections.map(name => [name, []]));
    data.properties = structuredClone(fixtureProperties);
    data.rooms = [
      { id: 'shell-room-1', propertyId: 'shell-fixture-property', code: 'A101', status: 'vacant', floor: 1, area: 20, price: 1000000, capacity: 2 },
      { id: 'shell-room-2', propertyId: 'shell-fixture-property-2', code: 'B201', status: 'vacant', floor: 2, area: 22, price: 1200000, capacity: 2 },
    ];
    result = { user: { id: fixtureUserId, name: 'Người dùng mẫu', email: 'shell@example.test', role }, data };
  } else if (path === '/api/meter/updates') result = { revision: fixtureRevision.toString(16).padStart(64, '0') };
  else if (path === '/api/ai/history?feature=B01') result = { entries: [] };
  else if (path === '/api/ai/status') result = { available: false, modelInstalled: false, message: 'Trạng thái AI giả lập cho kiểm thử điều hướng.' };
  else assert.fail(`Unexpected shell API request: ${path}`);
  return new Response(JSON.stringify(result), { status: 200, headers: { 'Content-Type': 'application/json' } });
};

const vite = await createVite({ server: { middlewareMode: true, hmr: false }, appType: 'custom' });
const { createElement: h } = await import('react');
const { render, screen, fireEvent, waitFor, cleanup, act, within } = await import('@testing-library/react');
collections = (await vite.ssrLoadModule('/src/frontend/types.ts')).collections;
const { default: App } = await vite.ssrLoadModule('/src/frontend/App.tsx');
let checks = 0;
function pass(message) { checks++; console.log(`PASS ${message}`); }
const shell = () => document.querySelector('.app-shell');
const sidebar = () => document.getElementById('workspace-navigation');
const desktopToggle = () => document.querySelector('.desktop-sidebar-toggle');
const searchInput = () => screen.getByRole('textbox', { name: 'Tìm trang trong Trozy' });
const isCompact = () => shell().classList.contains('sidebar-compact');
const chromeIsHidden = () => document.querySelector('.workspace-chrome').classList.contains('chrome-hidden');
const quickNavigation = (hidden = false) => within(screen.getByRole('navigation', { name: 'Chức năng thường dùng', hidden }));
const secondaryNavigation = (hidden = false) => within(screen.getByRole('navigation', { name: 'Điều hướng bổ sung', hidden }));
const propertyCombobox = () => screen.getByRole('combobox', { name: 'Chọn cơ sở nhà trọ' });
const propertyListbox = () => screen.queryByRole('listbox', { name: 'Cơ sở nhà trọ' });
const describedText = element => (element.getAttribute('aria-describedby') || '').split(/\s+/).filter(Boolean).map(id => {
  const description = document.getElementById(id);
  assert.ok(description, `Missing accessible description ${id}`);
  return description.textContent;
}).join(' ');
function chooseProperty(id) {
  if (propertyCombobox().getAttribute('aria-expanded') !== 'true') {
    fireEvent.pointerDown(propertyCombobox()); fireEvent.click(propertyCombobox());
  }
  const option = propertyListbox()?.querySelector(`[data-property-id="${id}"]`);
  assert.ok(option, `Missing selectable property ${id}`);
  fireEvent.pointerDown(option); fireEvent.click(option);
}
const ownerQuickLabels = ['Tổng quan', 'Phòng trọ', 'Điện & nước', 'Hóa đơn', 'Lịch sử thanh toán', 'Hợp đồng', 'Người thuê', 'Bảo trì & sự cố'];
const secondaryGroups = [
  { label: 'Quản lý cơ sở', items: ['Cơ sở nhà trọ', 'Dịch vụ & phụ phí', 'Tài sản & thiết bị', 'Phương tiện', 'Tiện ích chung', 'Bàn giao phòng'] },
  { label: 'Tài chính & báo cáo', items: ['Sổ thu chi', 'Tiền cọc', 'Báo cáo', 'Tiêu thụ điện nước'] },
  { label: 'Trao đổi & tài liệu', items: ['Thông báo', 'Yêu cầu hỗ trợ', 'Tài liệu & nội quy'] },
];
const ownerOnlyLabels = ['Cơ sở nhà trọ', 'Người thuê', 'Dịch vụ & phụ phí', 'Sổ thu chi', 'Báo cáo', 'Cài đặt'];
async function resize(nextWidth) {
  await act(async () => {
    const previousMatches = new Map([...mediaQueries].map(([query, media]) => [query, media.matches]));
    width = nextWidth;
    for (const [query, media] of mediaQueries) {
      if (previousMatches.get(query) !== media.matches) {
        const event = { type: 'change', matches: media.matches, media: query };
        for (const listener of [...media.listeners]) listener(event);
      }
    }
    dom.window.dispatchEvent(new dom.window.Event('resize'));
  });
}
async function resizeQuick(nextWidth) {
  await act(async () => {
    quickWidth = nextWidth;
    for (const observer of [...resizeObservers]) {
      const entries = [...observer.elements].filter(element => element.isConnected).map(target => ({ target, contentRect: target.getBoundingClientRect() }));
      if (entries.length) observer.callback(entries, observer);
    }
    // Flush authored animation-frame work, if measurement batches it.
    for (let batch = 0; frames.size && batch < 4; batch++) {
      const pending = [...frames.values()]; frames.clear();
      for (const callback of pending) callback(Date.now());
    }
  });
}
async function mount() {
  const view = render(h(App));
  await screen.findByRole('heading', { level: 1 });
  await waitFor(() => assert.ok(shell()));
  return view;
}
function openDrawer() {
  const trigger = screen.getByRole('button', { name: 'Mở menu' });
  act(() => { trigger.focus(); fireEvent.click(trigger); });
  return trigger;
}
function key(target, key, options = {}) {
  return fireEvent.keyDown(target, { key, ...options });
}
const focus = element => act(() => element.focus());
const blur = element => act(() => element.blur());
async function scroll(y) {
  await act(async () => {
    scrollY = y;
    fireEvent.scroll(dom.window);
    const pending = [...frames.values()]; frames.clear();
    for (const callback of pending) callback(Date.now());
  });
}
function openGroup(label, hidden = false) {
  const toggle = secondaryNavigation(hidden).getByRole('button', { name: label, exact: true, hidden });
  if (toggle.getAttribute('aria-expanded') !== 'true') fireEvent.click(toggle);
  return toggle;
}
function assertRoutePartition(userRole) {
  const quick = quickNavigation(), secondary = secondaryNavigation();
  const expectedQuick = ownerQuickLabels.filter(label => userRole === 'landlord' || !ownerOnlyLabels.includes(label));
  const reachable = new Set();
  for (const label of expectedQuick) {
    assert.ok(quick.getByRole('button', { name: label, exact: true }));
    assert.equal(secondary.queryByRole('button', { name: label, exact: true }), null, `Quick route ${label} duplicated in sidebar`);
    reachable.add(label);
  }
  assert.equal(quick.getAllByRole('button').length, expectedQuick.length);
  for (const group of secondaryGroups) {
    const toggle = openGroup(group.label);
    assert.equal(toggle.getAttribute('aria-expanded'), 'true');
    assert.ok(toggle.getAttribute('aria-controls'), `Group ${group.label} needs a controlled panel`);
    for (const label of group.items.filter(label => userRole === 'landlord' || !ownerOnlyLabels.includes(label))) {
      assert.ok(secondary.getByRole('button', { name: label, exact: true }));
      assert.equal(quick.queryByRole('button', { name: label, exact: true }), null);
      reachable.add(label);
    }
    for (const other of secondaryGroups.filter(other => other.label !== group.label)) {
      assert.equal(secondary.getByRole('button', { name: other.label, exact: true }).getAttribute('aria-expanded'), 'false');
      for (const label of other.items) assert.equal(secondary.queryByRole('button', { name: label, exact: true }), null);
    }
  }
  for (const label of userRole === 'landlord' ? ['Trợ lý Trozy', 'Cài đặt'] : ['Trợ lý Trozy']) {
    assert.ok(secondary.getByRole('button', { name: label, exact: true })); reachable.add(label);
  }
  assert.equal(reachable.size, userRole === 'landlord' ? 23 : 17);
  return reachable;
}

try {
  // Automatic layout follows effective CSS width without persisting an incidental resize.
  let view = await mount();
  assert.ok(document.querySelector('.brand-word').textContent.startsWith('Trozy.'), 'The product wordmark starts with an uppercase T');
  assert.equal(document.querySelector('.rose-overview-intro'), null, 'Dashboard opens directly on date, actions and actual data');
  assert.ok(document.querySelector('time.rose-dashboard-date'));
  assert.equal(isCompact(), false);
  assert.equal(sidebar().hasAttribute('inert'), false);
  await resize(1000); assert.equal(isCompact(), true);
  await resize(390); assert.equal(isCompact(), false);
  assert.equal(sidebar().getAttribute('aria-hidden'), 'true');
  assert.equal(sidebar().hasAttribute('inert'), true);
  await resize(320); assert.equal(sidebar().getAttribute('aria-hidden'), 'true');
  await resize(1440); assert.equal(isCompact(), false);
  assert.equal(sidebar().hasAttribute('aria-hidden'), false);
  assert.equal(sidebar().hasAttribute('inert'), false);
  assert.equal(localStorage.getItem('trozy.sidebar'), null);
  pass('1440 → 1000 → 390 → 320 → 1440 switches expanded, rail and drawer modes without saving resize state');

  // Explicit choices override automatic rail mode and survive a fresh App mount.
  fireEvent.click(desktopToggle());
  assert.equal(isCompact(), true);
  assert.equal(localStorage.getItem('trozy.sidebar'), 'compact');
  await resize(1000); assert.equal(isCompact(), true);
  await resize(390); assert.equal(isCompact(), false);
  await resize(1440); assert.equal(isCompact(), true);
  view.unmount(); view = await mount();
  assert.equal(isCompact(), true);
  assert.equal(desktopToggle().getAttribute('aria-expanded'), 'false');
  const navigation = quickNavigation();
  for (const label of ['Tổng quan', 'Phòng trọ', 'Điện & nước', 'Hóa đơn']) {
    const button = navigation.getByRole('button', { name: label, exact: true });
    assert.equal(button.getAttribute('aria-label'), label);
  }
  const compactAssistant = secondaryNavigation().getByRole('button', { name: 'Trợ lý Trozy', exact: true });
  assert.equal(compactAssistant.getAttribute('aria-label'), 'Trợ lý Trozy');
  assert.equal(compactAssistant.title, 'Trợ lý Trozy');
  assert.equal(navigation.getByRole('button', { name: 'Tổng quan', exact: true }).getAttribute('aria-current'), 'page');
  fireEvent.click(desktopToggle());
  assert.equal(localStorage.getItem('trozy.sidebar'), 'expanded');
  await resize(1000); assert.equal(isCompact(), false);
  view.unmount(); view = await mount(); assert.equal(isCompact(), false);
  pass('User sidebar choices survive remount and width changes; compact navigation retains accessible names and current-page state');

  // Frequently used routes and secondary groups partition every permitted destination.
  assertRoutePartition('landlord');
  const documentsToggle = secondaryNavigation().getByRole('button', { name: 'Trao đổi & tài liệu', exact: true });
  fireEvent.click(documentsToggle);
  assert.equal(documentsToggle.getAttribute('aria-expanded'), 'false');
  assert.equal(secondaryNavigation().queryByRole('button', { name: 'Tài liệu & nội quy', exact: true }), null);
  await act(async () => { location.hash = '#reports'; dom.window.dispatchEvent(new dom.window.Event('hashchange')); });
  await screen.findByRole('heading', { name: 'Báo cáo tổng hợp', level: 1 });
  assert.equal(secondaryNavigation().getByRole('button', { name: 'Tài chính & báo cáo', exact: true }).getAttribute('aria-expanded'), 'true');
  assert.equal(secondaryNavigation().getByRole('button', { name: 'Báo cáo', exact: true }).getAttribute('aria-current'), 'page');
  fireEvent.click(quickNavigation().getByRole('button', { name: 'Tổng quan', exact: true }));
  await waitFor(() => assert.equal(location.hash, '#dashboard'));
  assert.equal(quickNavigation().getByRole('button', { name: 'Tổng quan', exact: true }).getAttribute('aria-current'), 'page');
  fireEvent.click(desktopToggle());
  assert.equal(isCompact(), true);
  openGroup('Quản lý cơ sở');
  assert.equal(isCompact(), false, 'Opening a group from the compact rail expands its readable sidebar');
  assert.equal(secondaryNavigation().getByRole('button', { name: 'Quản lý cơ sở', exact: true }).getAttribute('aria-expanded'), 'true');
  assert.ok(secondaryNavigation().getByRole('button', { name: 'Cơ sở nhà trọ', exact: true }));
  pass('Quick routes and single-open secondary groups cover all 23 owner pages once; secondary hash routes open their group and primary navigation preserves active state');

  fireEvent.click(screen.getByRole('button', { name: /Cần một chút hỗ trợ\? Trao đổi với Trợ lý Trozy/ }));
  await screen.findByRole('heading', { name: 'Trợ lý Trozy', level: 1 });
  assert.equal(location.hash, '#assistant');
  assert.ok(document.getElementById('main-content').contains(screen.getByRole('heading', { name: 'Trợ lý Trozy', level: 1 })));
  assert.equal(screen.queryByRole('button', { name: 'Tạo yêu cầu', exact: true }), null);
  fireEvent.click(quickNavigation().getByRole('button', { name: 'Tổng quan', exact: true }));
  await screen.findByRole('heading', { name: 'Tổng quan', level: 1 });
  pass('Landlord sidebar help opens the real Trozy assistant instead of ticket creation');

  // The compact trigger shows the property name; addresses appear in the open list.
  const propertyPicker = propertyCombobox();
  assert.ok(propertyPicker.closest('.topbar'));
  assert.equal(sidebar().contains(propertyPicker), false);
  assert.equal(document.querySelector('.workspace-switch'), null);
  assert.equal(document.querySelector('.scopebar'), null);
  assert.equal(propertyPicker.getAttribute('aria-haspopup'), 'listbox');
  assert.equal(propertyPicker.getAttribute('aria-expanded'), 'false');
  assert.ok(propertyPicker.textContent.includes('Nhà trọ thử nghiệm'));
  assert.equal(propertyPicker.querySelector('small'), null);
  assert.ok(describedText(propertyPicker).includes('Nhà trọ thử nghiệm'));
  assert.equal(propertyPicker.textContent.includes('Địa chỉ minh họa'), false);
  assert.equal(document.querySelector('.workspace-selected-address'), null);
  assert.equal(propertyPicker.textContent.includes('Tất cả cơ sở'), false);
  fireEvent.click(propertyPicker);
  let propertyOptions = within(propertyListbox()).getAllByRole('option');
  assert.equal(propertyOptions.length, 2);
  assert.equal(propertyPicker.getAttribute('aria-controls'), propertyListbox().id);
  assert.equal(propertyOptions[0].getAttribute('aria-selected'), 'true');
  for (const [index, property] of standardProperties.entries()) {
    assert.ok(propertyOptions[index].textContent.includes(property.name));
    assert.ok(propertyOptions[index].querySelector('small')?.textContent.includes(property.address));
    assert.ok(describedText(propertyOptions[index]).includes(property.address), 'Each property address must be associated with its option for assistive technology');
  }
  key(propertyOptions[0], 'Escape');
  assert.equal(propertyListbox(), null);
  assert.equal(document.activeElement, propertyPicker);
  fireEvent.click(quickNavigation().getByRole('button', { name: 'Phòng trọ', exact: true }));
  await screen.findByRole('heading', { name: 'Quản lý phòng trọ', level: 1 });
  assert.ok(screen.getByRole('button', { name: 'Xem phòng A101', exact: true }));
  assert.equal(screen.queryByRole('button', { name: 'Xem phòng B201', exact: true }), null);
  chooseProperty(secondPropertyId);
  assert.ok(propertyPicker.textContent.includes('Nhà trọ thứ hai'));
  assert.ok(describedText(propertyPicker).includes('Nhà trọ thứ hai'));
  assert.equal(propertyPicker.textContent.includes('Địa chỉ minh họa thứ hai'), false);
  assert.equal(propertyListbox(), null);
  assert.equal(screen.queryByRole('button', { name: 'Xem phòng A101', exact: true }), null);
  assert.ok(screen.getByRole('button', { name: 'Xem phòng B201', exact: true }));
  assert.equal(localStorage.getItem('trozy.workspace.' + fixtureUserId), secondPropertyId);
  chooseProperty(firstPropertyId);
  assert.ok(screen.getByRole('button', { name: 'Xem phòng A101', exact: true }));
  assert.equal(screen.queryByRole('button', { name: 'Xem phòng B201', exact: true }), null);
  fireEvent.click(quickNavigation().getByRole('button', { name: 'Tổng quan', exact: true }));
  pass('The workspace starts on one property with a compact name-only trigger, displays addresses only in the open list and scopes actual rooms');

  // Keyboard and pointer dismissal preserve the current selection and header context.
  await scroll(0); blur(document.activeElement);
  focus(propertyPicker); key(propertyPicker, 'ArrowDown');
  assert.ok(propertyListbox());
  propertyOptions = within(propertyListbox()).getAllByRole('option');
  assert.ok(propertyOptions.includes(document.activeElement));
  key(document.activeElement, 'End'); assert.equal(document.activeElement, propertyOptions.at(-1));
  key(document.activeElement, 'Home'); assert.equal(document.activeElement, propertyOptions[0]);
  key(document.activeElement, 'ArrowDown'); assert.equal(document.activeElement, propertyOptions[1]);
  key(document.activeElement, 'ArrowUp'); assert.equal(document.activeElement, propertyOptions[0]);
  key(document.activeElement, 'Escape');
  assert.equal(propertyListbox(), null); assert.equal(document.activeElement, propertyPicker);
  assert.ok(propertyPicker.textContent.includes('Nhà trọ thử nghiệm'));
  key(propertyPicker, 'End');
  propertyOptions = within(propertyListbox()).getAllByRole('option');
  assert.equal(document.activeElement, propertyOptions.at(-1));
  fireEvent.click(document.activeElement);
  assert.ok(propertyPicker.textContent.includes('Nhà trọ thứ hai'));
  assert.equal(propertyListbox(), null);
  key(propertyPicker, 'ArrowDown');
  assert.ok(propertyListbox());
  assert.equal(key(document.activeElement, 'Tab'), false);
  assert.ok(propertyListbox());
  assert.equal(document.activeElement, screen.getByRole('button', { name: 'Quản lý danh sách cơ sở', exact: true }));
  focus(screen.getByRole('button', { name: 'Thêm cơ sở mới', exact: true }));
  assert.equal(key(document.activeElement, 'Tab', { shiftKey: true }), true, 'Shift+Tab between footer actions preserves native navigation');
  assert.ok(propertyListbox());
  focus(screen.getByRole('button', { name: 'Quản lý danh sách cơ sở', exact: true }));
  key(document.activeElement, 'Tab', { shiftKey: true });
  assert.ok(within(propertyListbox()).getAllByRole('option').includes(document.activeElement));
  key(document.activeElement, 'Escape');
  assert.equal(document.activeElement, propertyPicker);
  blur(document.activeElement); fireEvent.pointerDown(propertyPicker); fireEvent.click(propertyPicker);
  await scroll(240); assert.equal(chromeIsHidden(), false, 'A pointer-open property picker locks its header in view');
  fireEvent.pointerDown(document.getElementById('main-content'));
  assert.equal(propertyListbox(), null);
  blur(document.activeElement); await scroll(310); assert.equal(chromeIsHidden(), true);
  await scroll(0); fireEvent.click(propertyPicker);
  focus(document.getElementById('main-content'));
  assert.equal(propertyListbox(), null, 'Focus leaving the picker dismisses its popup');
  chooseProperty(firstPropertyId);
  blur(document.activeElement);
  pass('Property choices support arrows/Home/End, Escape and normal Tab, preserve focus and selection, dismiss outside, and lock the header while open');

  // Remaining routes move into a dropdown, driven by container size rather than viewport guesses.
  const moreButton = () => screen.queryByRole('button', { name: /^Thêm chức năng/ });
  const overflowMenu = () => screen.queryByRole('menu', { name: 'Chức năng khác' });
  const directRoutes = () => quickNavigation().queryAllByRole('button').filter(button => ownerQuickLabels.includes(button.getAttribute('aria-label')));
  assert.equal(moreButton(), null);
  await resizeQuick(620);
  const mediumRoutes = directRoutes().map(button => button.getAttribute('aria-label'));
  assert.ok(mediumRoutes.length > 1 && mediumRoutes.length < ownerQuickLabels.length);
  assert.deepEqual(mediumRoutes, ownerQuickLabels.slice(0, mediumRoutes.length));
  assert.equal(moreButton().getAttribute('aria-haspopup'), 'menu');
  assert.equal(moreButton().getAttribute('aria-expanded'), 'false');
  assert.match(moreButton().textContent, new RegExp(`Thêm\\s*\\(${ownerQuickLabels.length - mediumRoutes.length}\\)`));
  fireEvent.click(moreButton());
  let menu = overflowMenu(); assert.ok(menu);
  assert.equal(moreButton().getAttribute('aria-controls'), menu.id);
  assert.deepEqual(within(menu).getAllByRole('menuitem').map(item => item.getAttribute('aria-label')), ownerQuickLabels.slice(mediumRoutes.length));
  assert.equal(screen.queryByRole('button', { name: 'Cuộn thanh chức năng sang phải' }), null);
  await resizeQuick(280);
  assert.equal(overflowMenu(), null, 'A changed container safely dismisses its old popup');
  assert.ok(directRoutes().length < mediumRoutes.length);
  assert.ok(directRoutes().length >= 1, 'The leading route remains available at narrow widths');
  await resizeQuick(1200);
  assert.equal(moreButton(), null); assert.equal(directRoutes().length, ownerQuickLabels.length);
  pass('Measured container width groups trailing primary routes under Thêm with an exact count, without a scrolling rail or lost destinations');

  // The overflow popup is a real keyboard menu and locks the auto-hiding header while open.
  await resizeQuick(620);
  let more = moreButton();
  focus(more); key(more, 'ArrowDown');
  await waitFor(() => assert.ok(overflowMenu()));
  menu = overflowMenu();
  let items = within(menu).getAllByRole('menuitem');
  assert.equal(document.activeElement, items[0]);
  key(items[0], 'ArrowDown'); assert.equal(document.activeElement, items[1]);
  key(items[1], 'End'); assert.equal(document.activeElement, items.at(-1));
  key(items.at(-1), 'ArrowDown'); assert.equal(document.activeElement, items[0]);
  key(items[0], 'ArrowUp'); assert.equal(document.activeElement, items.at(-1));
  key(items.at(-1), 'Home'); assert.equal(document.activeElement, items[0]);
  key(items[0], 'Escape'); assert.equal(overflowMenu(), null); assert.equal(document.activeElement, more);
  key(more, 'ArrowUp');
  await waitFor(() => assert.ok(overflowMenu()));
  items = within(overflowMenu()).getAllByRole('menuitem');
  assert.equal(document.activeElement, items.at(-1));
  assert.equal(key(items.at(-1), 'Tab'), true, 'Tab closes without trapping normal browser movement');
  assert.equal(overflowMenu(), null);
  key(more, 'ArrowDown');
  await waitFor(() => assert.ok(overflowMenu()));
  await resizeQuick(280);
  assert.equal(overflowMenu(), null);
  assert.ok(document.activeElement.isConnected);
  assert.ok(document.activeElement.closest('.quick-navigation'), 'Reflow returns menu focus to a connected visible navigation control');
  await resizeQuick(620); more = moreButton();
  blur(document.activeElement);
  fireEvent.pointerDown(document.getElementById('main-content'));
  fireEvent.click(more);
  await scroll(240); assert.equal(chromeIsHidden(), false, 'An open overflow popup locks the auto-hiding header');
  fireEvent.pointerDown(document.getElementById('main-content'));
  assert.equal(overflowMenu(), null, 'Outside pointer interaction dismisses the popup');
  blur(document.activeElement);
  await scroll(310); assert.equal(chromeIsHidden(), true, 'Closing the popup releases its visibility lock');
  await scroll(0);
  fireEvent.click(more);
  chooseProperty(secondPropertyId);
  assert.equal(overflowMenu(), null, 'Global property changes dismiss stale overflow context');
  chooseProperty(firstPropertyId);
  fireEvent.click(more);
  const overflowDestination = within(overflowMenu()).getByRole('menuitem', { name: 'Hợp đồng', exact: true });
  fireEvent.click(overflowDestination);
  await waitFor(() => assert.equal(location.hash, '#contracts'));
  assert.equal(overflowMenu(), null);
  assert.equal(moreButton().classList.contains('active'), true, 'A selected overflow route marks its trigger active');
  fireEvent.click(moreButton());
  assert.equal(within(overflowMenu()).getByRole('menuitem', { name: 'Hợp đồng', exact: true }).getAttribute('aria-current'), 'page');
  key(within(overflowMenu()).getByRole('menuitem', { name: 'Hợp đồng', exact: true }), 'Escape');
  await resizeQuick(1200);
  fireEvent.click(quickNavigation().getByRole('button', { name: 'Tổng quan', exact: true }));
  await scroll(0); // Complete the route's real focus-transfer frame before the next interaction.
  blur(document.activeElement);
  pass('Thêm supports arrow/Home/End/Escape/Tab keys, outside dismissal, active routes, property reset and header visibility locking');

  // The shortcut must neither hijack text entry nor interfere with other shortcuts.
  const search = searchInput();
  focus(document.body); blur(search);
  assert.equal(key(document.body, '/'), false);
  assert.equal(document.activeElement, search);
  assert.ok(screen.getByRole('region', { name: 'Kết quả tìm trang' }));
  key(search, 'Escape'); assert.notEqual(document.activeElement, search);
  assert.equal(screen.queryByRole('region', { name: 'Kết quả tìm trang' }), null);
  for (const element of [document.createElement('input'), document.createElement('textarea'), document.createElement('select'), document.createElement('div')]) {
    if (element.tagName === 'DIV') { element.setAttribute('contenteditable', 'true'); element.tabIndex = 0; }
    document.body.append(element); focus(element);
    assert.equal(key(element, '/'), true);
    assert.equal(document.activeElement, element);
    element.remove();
  }
  for (const modifier of ['ctrlKey', 'metaKey', 'altKey']) {
    blur(search); assert.equal(key(document.body, '/', { [modifier]: true }), true);
    assert.notEqual(document.activeElement, search);
  }
  focus(search);
  fireEvent.change(search, { target: { value: 'không-có-trang-này' } });
  assert.ok(screen.getByText('Chưa tìm thấy trang phù hợp. Thử từ khóa khác.'));
  key(search, 'Escape');
  pass('Slash focuses search, Escape dismisses it, text entry and modified shortcuts remain available, and empty search explains the result');

  // Moving between the input and results must not discard keyboard focus.
  fireEvent.change(search, { target: { value: 'Phòng trọ' } });
  focus(search);
  const searchResult = within(screen.getByRole('region', { name: 'Kết quả tìm trang' })).getByRole('button', { name: 'Phòng trọ', exact: true });
  key(search, 'Tab'); focus(searchResult);
  await act(async () => { await new Promise(resolve => setTimeout(resolve, 180)); });
  assert.equal(document.activeElement, searchResult);
  assert.ok(searchResult.isConnected, 'Search results must survive Tab focus beyond the old blur timeout');
  await scroll(220); assert.equal(chromeIsHidden(), false);
  fireEvent.click(searchResult);
  await scroll(0);
  assert.equal(location.hash, '#rooms');
  assert.equal(document.activeElement, document.getElementById('main-content'));
  assert.equal(screen.queryByRole('region', { name: 'Kết quả tìm trang' }), null);
  await scroll(240); assert.equal(chromeIsHidden(), true, 'Selecting a result must release the header focus lock');
  key(document.body, '/');
  fireEvent.change(search, { target: { value: 'Hóa đơn' } });
  key(search, 'Tab');
  focus(within(screen.getByRole('region', { name: 'Kết quả tìm trang' })).getByRole('button', { name: 'Hóa đơn', exact: true }));
  key(document.activeElement, 'Escape');
  assert.equal(screen.queryByRole('region', { name: 'Kết quả tìm trang' }), null);
  await scroll(300); assert.equal(chromeIsHidden(), true);
  fireEvent.click(quickNavigation().getByRole('button', { name: 'Tổng quan', exact: true }));
  pass('Keyboard search keeps focused results available, Escape works from results, and selection focuses page content without pinning the header');

  // The actual App wires scroll visibility to search, keyboard focus and navigation state.
  await scroll(0); assert.equal(chromeIsHidden(), false);
  await scroll(180); assert.equal(chromeIsHidden(), true);
  await scroll(150); assert.equal(chromeIsHidden(), false);
  await scroll(220); assert.equal(chromeIsHidden(), true);
  key(document.body, '/');
  assert.equal(document.activeElement, search);
  assert.equal(chromeIsHidden(), false);
  await scroll(300); assert.equal(chromeIsHidden(), false, 'Search locks the header in view');
  key(search, 'Escape');
  await scroll(350); assert.equal(chromeIsHidden(), true);
  chooseProperty(secondPropertyId);
  assert.equal(chromeIsHidden(), false, 'Changing property reveals its navigation context');
  await scroll(410); assert.equal(chromeIsHidden(), true);
  fireEvent.click(quickNavigation().getByRole('button', { name: 'Phòng trọ', exact: true }));
  assert.equal(chromeIsHidden(), false, 'Changing page reveals its navigation context');
  await scroll(470); assert.equal(chromeIsHidden(), true);
  const focusedQuickRoute = quickNavigation().getByRole('button', { name: 'Phòng trọ', exact: true });
  key(focusedQuickRoute, 'Tab'); focus(focusedQuickRoute);
  assert.equal(chromeIsHidden(), false);
  await scroll(530); assert.equal(chromeIsHidden(), false, 'Keyboard focus keeps the focused header controls visible');
  blur(focusedQuickRoute);
  await scroll(590); assert.equal(chromeIsHidden(), true);
  chooseProperty(firstPropertyId);
  fireEvent.click(quickNavigation().getByRole('button', { name: 'Tổng quan', exact: true }));
  await scroll(0);
  pass('App header hides downward and reveals upward, while search, keyboard focus, property changes and page navigation keep controls available');

  // Drawer is a modal surface: focus wraps, background is inert, and close restores state.
  await resize(390);
  document.body.style.overflow = 'clip';
  let trigger = openDrawer();
  let drawer = screen.getByRole('dialog', { name: 'Menu Trozy' });
  assert.equal(drawer.getAttribute('aria-modal'), 'true');
  assert.equal(trigger.getAttribute('aria-expanded'), 'true');
  assert.equal(document.activeElement, drawer.querySelector('.sidebar-close'));
  assert.equal(document.body.style.overflow, 'hidden');
  await scroll(240); assert.equal(chromeIsHidden(), false, 'An open drawer locks its header in view');
  assert.equal(document.querySelector('.main-shell').hasAttribute('inert'), true);
  assert.equal(document.querySelector('.assistant-fab').hasAttribute('inert'), true);
  // CSS hides .sidebar-bottom in drawer mode; jsdom cannot discover that layout.
  // Model the controls visible to a mobile user, including the help link last.
  const controls = drawer.querySelectorAll('.sidebar-brand a[href], .sidebar-brand button:not(:disabled), .sidebar-nav button:not(:disabled), .help-link');
  const first = controls[0], last = controls[controls.length - 1];
  const hiddenCollapse = drawer.querySelector('.sidebar-bottom button');
  assert.ok(hiddenCollapse);
  assert.equal(last, drawer.querySelector('.help-link'));
  assert.notEqual(last, hiddenCollapse, 'The CSS-hidden sidebar collapse control must not become the focus-trap endpoint');
  focus(last); assert.equal(key(last, 'Tab'), false); assert.equal(document.activeElement, first);
  focus(first); assert.equal(key(first, 'Tab', { shiftKey: true }), false); assert.equal(document.activeElement, last);
  assert.notEqual(document.activeElement, hiddenCollapse);
  assert.equal(key(last, '/'), true); assert.notEqual(document.activeElement, searchInput());
  key(last, 'Escape');
  assert.equal(screen.queryByRole('dialog', { name: 'Menu Trozy' }), null);
  assert.equal(document.body.style.overflow, 'clip');
  assert.equal(document.activeElement, trigger);
  assert.equal(document.querySelector('.main-shell').hasAttribute('inert'), false);
  assert.equal(document.querySelector('.assistant-fab').hasAttribute('inert'), false);
  assert.equal(sidebar().hasAttribute('inert'), true);
  trigger = openDrawer();
  fireEvent.click(document.querySelector('.sidebar-overlay'));
  assert.equal(document.activeElement, trigger); assert.equal(document.body.style.overflow, 'clip');
  pass('Mobile drawer traps focus, makes background inert, disables search shortcut, and restores focus and body scrolling after Escape or overlay close');

  trigger = openDrawer();
  openGroup('Trao đổi & tài liệu');
  fireEvent.click(secondaryNavigation().getByRole('button', { name: 'Tài liệu & nội quy', exact: true }));
  await waitFor(() => assert.equal(location.hash, '#documents'));
  assert.equal(screen.queryByRole('dialog', { name: 'Menu Trozy' }), null);
  assert.equal(document.activeElement, trigger);
  assert.equal(document.body.style.overflow, 'clip');
  trigger = openDrawer();
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Menu Trozy' })).getByRole('link', { name: 'Trozy — Trang tổng quan' }));
  await waitFor(() => assert.equal(location.hash, '#dashboard'));
  assert.equal(screen.queryByRole('dialog', { name: 'Menu Trozy' }), null);
  assert.equal(document.activeElement, trigger);
  assert.equal(document.body.style.overflow, 'clip');
  assert.equal(quickNavigation().getByRole('button', { name: 'Tổng quan', exact: true }).getAttribute('aria-current'), 'page');
  trigger = openDrawer();
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Menu Trozy' })).getByRole('button', { name: /Cần một chút hỗ trợ\? Trao đổi với Trợ lý Trozy/ }));
  await screen.findByRole('heading', { name: 'Trợ lý Trozy', level: 1 });
  assert.equal(location.hash, '#assistant');
  assert.equal(screen.queryByRole('dialog', { name: 'Menu Trozy' }), null);
  assert.equal(document.activeElement, trigger);
  assert.equal(document.body.style.overflow, 'clip');
  pass('Landlord help in the mobile drawer opens the assistant, closes the drawer and restores the menu trigger');
  openDrawer(); await resize(1440);
  assert.equal(screen.queryByRole('dialog', { name: 'Menu Trozy' }), null);
  assert.equal(sidebar().hasAttribute('inert'), false);
  assert.equal(document.querySelector('.main-shell').hasAttribute('inert'), false);
  assert.equal(document.body.style.overflow, 'clip');
  assert.equal(document.activeElement, desktopToggle(), 'Desktop resize must return focus to a visible desktop control');
  await resize(390);
  assert.equal(sidebar().hasAttribute('inert'), true);
  assert.equal(screen.getByRole('button', { name: 'Mở menu' }).getAttribute('aria-expanded'), 'false');
  openDrawer(); view.unmount();
  assert.equal(document.body.style.overflow, 'clip');
  assert.ok([...mediaQueries.values()].every(media => media.listeners.size === 0));
  assert.equal(frames.size, 0, 'Unmount cancels pending animation frames');
  document.body.style.overflow = '';
  pass('Navigation and logo clicks close the drawer; desktop resize focuses its visible toggle, returning to mobile keeps the drawer closed, and unmount releases locks and listeners');

  // Tenant navigation is checked against the same real shell without touching tenant data.
  await resize(1440); location.hash = ''; role = 'tenant';
  const beforeTenant = requests.length;
  view = await mount();
  const tenantNavigation = quickNavigation();
  assert.ok(tenantNavigation.getByRole('button', { name: 'Phòng trọ', exact: true }));
  assertRoutePartition('tenant');
  for (const label of ownerOnlyLabels) {
    assert.equal(tenantNavigation.queryByRole('button', { name: label, exact: true }), null);
    assert.equal(secondaryNavigation().queryByRole('button', { name: label, exact: true }), null);
  }
  assert.equal(requests.slice(beforeTenant).some(request => request.path === '/api/meter/updates'), false);
  await resizeQuick(280);
  fireEvent.click(screen.getByRole('button', { name: /^Thêm chức năng/ }));
  const tenantOverflow = screen.getByRole('menu', { name: 'Chức năng khác' });
  assert.equal(within(tenantOverflow).queryByRole('menuitem', { name: 'Người thuê', exact: true }), null);
  const tenantReachable = new Set([...quickNavigation().getAllByRole('button').filter(button => ownerQuickLabels.includes(button.getAttribute('aria-label'))), ...within(tenantOverflow).getAllByRole('menuitem')].map(item => item.getAttribute('aria-label')));
  assert.equal(tenantReachable.size, 7);
  for (const label of ownerQuickLabels.filter(label => !ownerOnlyLabels.includes(label))) assert.ok(tenantReachable.has(label));
  assert.equal(screen.queryByRole('button', { name: 'Thêm cơ sở', exact: true }), null);
  fireEvent.click(propertyCombobox());
  assert.equal(screen.queryByRole('button', { name: 'Quản lý danh sách cơ sở', exact: true }), null);
  assert.equal(screen.queryByRole('button', { name: 'Thêm cơ sở mới', exact: true }), null);
  key(propertyCombobox(), 'Escape');
  fireEvent.click(screen.getByRole('button', { name: /Cần một chút hỗ trợ\? Gửi yêu cầu đến chủ trọ/ }));
  await screen.findByRole('heading', { name: 'Yêu cầu hỗ trợ', level: 1 });
  assert.equal(location.hash, '#tickets');
  assert.ok(screen.getByRole('button', { name: 'Tạo yêu cầu', exact: true }));
  await resize(390);
  const tenantMenuTrigger = openDrawer();
  fireEvent.click(within(screen.getByRole('dialog', { name: 'Menu Trozy' })).getByRole('button', { name: /Cần một chút hỗ trợ\? Gửi yêu cầu đến chủ trọ/ }));
  assert.equal(location.hash, '#tickets');
  assert.equal(screen.queryByRole('dialog', { name: 'Menu Trozy' }), null);
  assert.equal(document.activeElement, tenantMenuTrigger);
  assert.ok(screen.getByRole('button', { name: 'Tạo yêu cầu', exact: true }));
  pass('Tenant help continues to support requests with its create action on desktop and mobile, closing the mobile drawer');
  view.unmount();
  assert.equal(screen.queryByRole('menu', { name: 'Chức năng khác' }), null);
  assert.equal(resizeObservers.size, 0, 'Unmount disconnects every layout observer');
  pass('Tenant navigation covers its 17 permitted routes across both regions, excludes owner pages and never starts owner meter polling');

  // A saved workspace belongs to the signed-in account and must remain selectable.
  await resizeQuick(1200); role = 'landlord'; location.hash = '#rooms';
  fixtureUserId = 'workspace-preference-owner';
  localStorage.setItem('trozy.workspace.' + fixtureUserId, secondPropertyId);
  view = await mount();
  assert.ok(propertyCombobox().textContent.includes('Nhà trọ thứ hai'));
  assert.ok(screen.getByRole('button', { name: 'Xem phòng B201', exact: true }));
  assert.equal(screen.queryByRole('button', { name: 'Xem phòng A101', exact: true }), null);
  chooseProperty(firstPropertyId);
  view.unmount(); view = await mount();
  assert.ok(propertyCombobox().textContent.includes('Nhà trọ thử nghiệm'));
  chooseProperty(secondPropertyId);
  view.unmount();
  fixtureUserId = 'workspace-preference-other';
  view = await mount();
  assert.ok(propertyCombobox().textContent.includes('Nhà trọ thử nghiệm'), 'Another account must not inherit the prior account selection');
  assert.equal(localStorage.getItem('trozy.workspace.workspace-preference-owner'), secondPropertyId);
  view.unmount();

  fixtureUserId = 'workspace-preference-owner';
  fixtureProperties = standardProperties.map(property => ({ ...property, archived: property.id === secondPropertyId }));
  view = await mount();
  assert.ok(propertyCombobox().textContent.includes('Nhà trọ thử nghiệm'), 'Archived saved choices fall back to an active property');
  fireEvent.click(propertyCombobox());
  assert.equal(within(propertyListbox()).getAllByRole('option').length, 1);
  assert.equal(propertyListbox().textContent.includes('Nhà trọ thứ hai'), false);
  key(document.activeElement, 'Escape');
  view.unmount();
  fixtureProperties = standardProperties;
  localStorage.setItem('trozy.workspace.' + fixtureUserId, 'deleted-or-unpermitted-property');
  view = await mount();
  assert.ok(propertyCombobox().textContent.includes('Nhà trọ thử nghiệm'), 'Missing or unpermitted saved choices cannot broaden the workspace');
  assert.equal(screen.queryByRole('button', { name: 'Xem phòng B201', exact: true }), null);
  pass('Property preference survives reload per account, while archived, missing or unpermitted saved selections fall back to the first active property');

  // Exercise a real App refresh without remounting: a restored archived choice
  // must not resurrect the former selection after the fallback was accepted.
  chooseProperty(secondPropertyId);
  fixtureProperties = standardProperties.map(property => ({ ...property, archived: property.id === secondPropertyId }));
  fixtureRevision++;
  await act(async () => { fireEvent(document, new dom.window.Event('visibilitychange')); });
  await waitFor(() => assert.equal(propertyCombobox().getAttribute('data-property-id'), firstPropertyId));
  assert.equal(screen.queryByRole('button', { name: 'Xem phòng B201', exact: true }), null);
  fixtureProperties = standardProperties; fixtureRevision++;
  await act(async () => { fireEvent(document, new dom.window.Event('visibilitychange')); });
  fireEvent.click(propertyCombobox());
  await waitFor(() => assert.equal(within(propertyListbox()).getAllByRole('option').length, 2));
  assert.equal(propertyCombobox().getAttribute('data-property-id'), firstPropertyId);
  assert.equal(localStorage.getItem('trozy.workspace.' + fixtureUserId), firstPropertyId);
  view.unmount();
  pass('A refreshed archived selection normalizes to its valid fallback and does not return automatically when the old property becomes available');

  fixtureProperties = [];
  view = await mount();
  assert.equal(propertyCombobox().disabled, true);
  assert.ok(propertyCombobox().textContent.includes('Chưa có cơ sở'));
  assert.equal(screen.queryByRole('button', { name: 'Xem phòng A101', exact: true }), null);
  assert.equal(screen.queryByRole('button', { name: 'Xem phòng B201', exact: true }), null);
  assert.ok(within(document.getElementById('main-content')).getByRole('button', { name: 'Quản lý cơ sở', exact: true }));
  view.unmount();
  fixtureProperties = standardProperties.map(property => ({ ...property, archived: true }));
  view = await mount();
  assert.equal(propertyCombobox().disabled, true);
  assert.equal(screen.queryByRole('button', { name: 'Xem phòng A101', exact: true }), null);
  assert.equal(screen.queryByRole('button', { name: 'Xem phòng B201', exact: true }), null);
  view.unmount(); fixtureProperties = standardProperties;
  pass('No active property disables the selector and keeps operational rooms empty instead of broadening to every property');

  assert.ok(requests.every(request => request.method === 'GET'));
  fixtureProperties = standardProperties; role = 'landlord'; fixtureUserId = 'property-manager-entry-owner'; location.hash = '#dashboard';
  view = await mount();
  fireEvent.click(propertyCombobox());
  fireEvent.click(screen.getByRole('button', { name: 'Quản lý danh sách cơ sở', exact: true }));
  assert.equal(propertyListbox(), null);
  let propertyDialog = screen.getByRole('dialog', { name: 'Danh sách cơ sở của bạn', exact: true });
  assert.ok(within(propertyDialog).getByRole('button', { name: 'Chỉnh sửa cơ sở Nhà trọ thử nghiệm', exact: true }));
  assert.ok(within(propertyDialog).getByRole('button', { name: 'Xóa cơ sở Nhà trọ thử nghiệm', exact: true }));
  fireEvent.click(within(propertyDialog).getAllByRole('button', { name: 'Đóng', exact: true }).at(-1));
  await scroll(0);
  assert.equal(document.activeElement, screen.getByRole('button', { name: 'Thêm cơ sở', exact: true }));
  fireEvent.click(propertyCombobox());
  fireEvent.click(screen.getByRole('button', { name: 'Thêm cơ sở mới', exact: true }));
  propertyDialog = screen.getByRole('dialog', { name: 'Thêm cơ sở nhà trọ', exact: true });
  assert.ok(within(propertyDialog).getByLabelText(/^Tên cơ sở/));
  fireEvent.click(within(propertyDialog).getByRole('button', { name: 'Hủy', exact: true }));
  assert.equal(screen.queryByRole('dialog', { name: 'Thêm cơ sở nhà trọ', exact: true }), null);
  assert.equal(propertyCreates.length, 0);
  view.unmount();
  pass('Workspace footer opens property management and creation, cancellation makes no request, and close restores a connected header control');

  // A creation response and bootstrap refresh must select the newly returned ID,
  // even though the callback that opened the dialog had no such property yet.
  fixtureProperties = []; fixtureUserId = 'new-property-owner'; allowPropertyCreation = true;
  view = await mount();
  assert.equal(propertyCombobox().disabled, true);
  fireEvent.click(screen.getByRole('button', { name: 'Thêm cơ sở', exact: true }));
  propertyDialog = screen.getByRole('dialog', { name: 'Thêm cơ sở nhà trọ', exact: true });
  fireEvent.change(within(propertyDialog).getByLabelText(/^Tên cơ sở/), { target: { value: 'Cơ sở được tạo từ thanh trên' } });
  fireEvent.change(within(propertyDialog).getByLabelText(/^Địa chỉ/), { target: { value: '12 Đường thử nghiệm, Phường mẫu' } });
  fireEvent.click(within(propertyDialog).getByRole('button', { name: 'Tạo cơ sở', exact: true }));
  await waitFor(() => assert.equal(propertyCombobox().getAttribute('data-property-id'), 'created-from-header'));
  assert.equal(propertyCreates.length, 1);
  assert.equal(propertyCreates[0].floors, 1);
  assert.equal(propertyCreates[0].archived, false);
  assert.equal(localStorage.getItem('trozy.workspace.' + fixtureUserId), 'created-from-header');
  assert.equal(screen.queryByRole('dialog', { name: 'Thêm cơ sở nhà trọ', exact: true }), null);
  assert.equal(location.hash, '#dashboard');
  assert.ok(propertyCombobox().textContent.includes('Cơ sở được tạo từ thanh trên'));
  assert.equal(propertyCombobox().textContent.includes('12 Đường thử nghiệm'), false);
  fireEvent.click(propertyCombobox());
  assert.ok(within(propertyListbox()).getByRole('option', { name: 'Cơ sở được tạo từ thanh trên', exact: true }).querySelector('small').textContent.includes('12 Đường thử nghiệm'));
  view.unmount(); allowPropertyCreation = false; fixtureProperties = standardProperties;
  assert.ok(requests.every(request => request.method === 'GET' || request.method === 'POST' && request.path === '/api/properties'));
  pass('The header plus button creates from an empty workspace and selects the new property after refresh with a per-account preference');
  console.log(`PASS: ${checks} App-shell interaction groups using mocked API data. Browser layout verification remains separate.`);
} finally {
  await act(async () => { cleanup(); await new Promise(resolve => setImmediate(resolve)); });
  await vite.close(); dom.window.close(); globalThis.fetch = nativeFetch;
  dom.window.HTMLElement.prototype.getBoundingClientRect = originalBounds;
  if (originalClientWidth) Object.defineProperty(dom.window.HTMLElement.prototype, 'clientWidth', originalClientWidth);
  else delete dom.window.HTMLElement.prototype.clientWidth;
  for (const [name, descriptor] of previous) {
    if (descriptor) Object.defineProperty(globalThis, name, descriptor);
    else delete globalThis[name];
  }
}
