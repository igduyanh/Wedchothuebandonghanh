describe('Tracking/GPS/Live map/SOS (E2E)', () => {
  Cypress.on('uncaught:exception', (err) => {
    if (String(err?.message || '').includes("Cannot set properties of null (setting 'textContent')")) {
      return false;
    }
    return true;
  });

  const now = Date.now();
  const suffix = String(now).slice(-6);
  const customer = {
    // Backend yêu cầu username 4-30 ký tự => cắt suffix timestamp cho ngắn.
    username: `e2ecust${suffix}`,
    email: `e2e_customer_tracking_${now}@mail.com`,
    password: '123456'
  };
  const companion = {
    username: `e2ecomp${suffix}`,
    email: `e2e_companion_tracking_${now}@mail.com`,
    password: '123456'
  };
  const admin = {
    username: Cypress.env('ADMIN_USERNAME') || 'thinh270924@gmail.com',
    password: Cypress.env('ADMIN_PASSWORD') || '123456'
  };

  const state = {
    companionId: null,
    companionUserId: null,
    servicePriceId: null,
    bookingId: null
  };

  const baseLat = 10.762622;
  const baseLng = 106.660172;
  const noteText = `Booking demo GPS realtime / SOS ${now.toString().slice(-6)}`;

  function visitWithStubs(path) {
    cy.visit(path, {
      onBeforeLoad(win) {
        // Note: không set trực tiếp win.isSecureContext (Electron/Cypress có thể chỉ có getter).
        // Test đã stub geolocation/permissions nên flow GPS/SOS vẫn chạy ổn mà không cần secure context.

        // Stub GPS for all "getCurrentPosition" based flows.
        const geo = {
          getCurrentPosition(success) {
            success({
              coords: { latitude: baseLat, longitude: baseLng }
            });
          }
        };
        try {
          Object.defineProperty(win.navigator, 'geolocation', { value: geo, configurable: true });
        } catch (_) {
          // Best-effort: in some environments navigator.geolocation might be non-configurable.
          win.navigator.geolocation = geo;
        }

        if (!win.navigator.permissions) {
          win.navigator.permissions = {
            query: () => Promise.resolve({ state: 'granted' })
          };
        } else if (win.navigator.permissions.query) {
          win.navigator.permissions.query = () => Promise.resolve({ state: 'granted' });
        }

        // Minimal Leaflet stub for chat/admin map rendering code.
        // Admin page loads Leaflet from CDN; we intercept the script to keep this stub.
        const calls = (win.__leafletCalls = {
          circleMarkers: 0,
          markers: 0,
          polylineCalls: []
        });

        const makeMap = () => {
          const mapObj = {
            setView: () => mapObj,
            fitBounds: () => {},
            invalidateSize: () => {},
            removeLayer: () => {}
          };
          return mapObj;
        };

        const layerGroup = () => ({
          addTo: () => layerGroup(),
          clearLayers: () => {}
        });

        const circleMarker = () => {
          calls.circleMarkers += 1;
          const m = {
            bindPopup: () => m,
            addTo: () => m,
            setLatLng: () => {}
          };
          return m;
        };

        const polyline = (coords) => {
          calls.polylineCalls.push(coords);
          return {
            addTo: () => polyline
          };
        };

        const marker = () => {
          calls.markers += 1;
          const m = {
            addTo: () => m,
            setLatLng: () => {}
          };
          return m;
        };

        win.L = {
          map: () => makeMap(),
          tileLayer: () => ({ addTo: () => {} }),
          layerGroup: () => layerGroup(),
          circleMarker: () => circleMarker(),
          polyline: (coords, _opts) => polyline(coords),
          marker: () => marker()
        };
      }
    });
  }

  function uiRegister(user) {
    cy.visit('/user/register.html');
    cy.get('#username').clear().type(user.username);
    cy.get('#password').clear().type(user.password);
    cy.get('#email').clear().type(user.email);
    cy.get('#register-form').submit();
    cy.url().should('include', '/user/login.html');
  }

  function uiLogin(user) {
    cy.intercept('POST', '/api/user/login').as('loginApi');
    cy.visit('/user/login.html');
    cy.get('#username').clear().type(user.username);
    cy.get('#password').clear().type(user.password);
    cy.get('#login-form').submit();
    cy.wait('@loginApi').its('response.statusCode').should('eq', 200);
    // Some flows land on /admin/dashboard.html or /user/index.html.
  }

  function apiLogout() {
    cy.request('POST', '/api/user/logout');
  }

  function ensureServicePrice() {
    return cy
      .request('/api/companions/me/service-prices')
      .then((resp) => {
        const existing = (resp.body || [])[0];
        if (existing) {
          state.servicePriceId = existing.id;
          return;
        }
        cy.request({
          method: 'POST',
          url: '/api/companions/me/service-prices',
          body: {
            serviceName: 'Gói đồng hành cuối tuần',
            pricePerHour: '200000',
            description: 'Tư vấn vui vẻ, đồng hành theo nhu cầu (demo)'
          }
        }).then((createResp) => {
          state.servicePriceId = createResp.body.id;
        });
      });
  }

  before(() => {
    uiRegister(customer);
    uiRegister(companion);

    uiLogin(companion);

    cy.request({
      method: 'POST',
      url: '/api/companions/register',
      body: {
        bio: 'Bạn đồng hành vui vẻ, trò chuyện nhẹ nhàng và tận tâm',
        hobbies: 'Cà phê, đọc sách, dạo phố',
        appearance: 'Lịch sự, tinh tế',
        availability: 'Tối thứ 2-6',
        serviceType: 'Tâm sự',
        area: 'Quận 1',
        rentalVenues: 'Quán cafe trung tâm\nCông viên Lê Văn Tám',
        gender: 'Nữ',
        onlineStatus: 'true'
      }
    });

    ensureServicePrice();
    cy.request({
      method: 'PATCH',
      url: '/api/companions/me/online',
      body: { online: true }
    });

    cy.request('/api/companions/me/profile').then((resp) => {
      state.companionId = resp.body.id;
      state.companionUserId = resp.body.user?.id;
      expect(state.companionId, 'companionId phải có').to.exist;
      expect(state.servicePriceId, 'servicePriceId phải có').to.exist;
      expect(state.companionUserId, 'companionUserId phải có').to.exist;
    });

    apiLogout();

    // Approve companion if there is a pending request.
    uiLogin(admin);
    cy.request('/api/admin/pending-companions').then((resp) => {
        const created = (resp.body || []).find((item) => item.user?.username === companion.username);
      if (created) {
        cy.request('POST', `/api/admin/approve-companion/${created.id}`);
      }
    });
    apiLogout();
  });

  it('Tracking GPS/live-map + SOS: ACCEPTED→IN_PROGRESS→COMPLETED', () => {
    // Stub websocket/STOMP script to avoid real SockJS connections during tests.
    cy.intercept('GET', '/js/realtime-stomp.js', {
      body:
        '(function(){window.RealtimeStomp={ensureLibs:()=>Promise.resolve(),connect:()=>Promise.resolve(),subscribeNotifications:async()=>({unsubscribe:()=>{}}),subscribeChat:async()=>({unsubscribe:()=>{}}),subscribeBookingLocation:async()=>({unsubscribe:()=>{}})};})();'
    });
    // Keep Leaflet stub (admin/tracking.html loads Leaflet via CDN script tag).
    cy.intercept('GET', 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js', { body: '' });

    uiLogin(customer);

    cy.intercept('POST', '/api/wallet/deposit').as('depositApi');
    cy.visit('/user/wallet.html');
    cy.get('#depositAmount').clear().type('500000');
    cy.get('#provider').select('MOMO');
    cy.get('#deposit-form').submit();
    cy.wait('@depositApi').its('response.statusCode').should('eq', 200);

    // Favorite companion (để tránh lỗi flow nếu backend yêu cầu).
    cy.visit(`/user/profile.html?id=${state.companionId}`);
    cy.get('#add-favorite-btn').click();

    cy.intercept('GET', `/api/companions/${state.companionId}/service-prices`).as('servicePricesApi');
    cy.intercept('POST', '/api/bookings').as('createBookingApi');
    cy.visit(`/user/booking.html?id=${state.companionId}`);
    cy.wait('@servicePricesApi').its('response.statusCode').should('eq', 200);

    cy.get('#servicePriceId option').its('length').should('be.gte', 1);
    cy.get(`#servicePriceId option[value="${state.servicePriceId}"]`).should('exist');
    cy.get('#servicePriceId').select(String(state.servicePriceId));
    cy.get('#booking-service-price-hint').invoke('text').should('not.equal', '');
    cy.get('#bookingTime').type('2030-12-31T20:00');
    // #duration là <select>, tránh cy.clear() (không clearable trong Cypress setup này)
    cy.get('#duration').select('60');
    cy.get('#locationEnabled').uncheck({ force: true });
    cy.get('#rentalVenue').select('Quán cafe trung tâm');
    cy.get('#note').clear().type(noteText);
    cy.get('#booking-form').submit();
    // Lấy trực tiếp bookingId từ response createBooking để tránh bị null
    cy.wait('@createBookingApi').then((interception) => {
      expect(interception.response?.statusCode, 'create booking statusCode').to.eq(200);

      const idFromResp = interception.response?.body?.id;
      if (idFromResp) {
        state.bookingId = idFromResp;
      } else {
        // Fallback: tìm booking vừa tạo theo noteText/hoặc chọn booking mới nhất của companion.
        return cy.request('/api/bookings/me').then((resp) => {
          const bookings = resp.body || [];
          const found =
            bookings.find(
              (b) =>
                String(b.companion?.id || '') === String(state.companionId) &&
                String(b.note || '').includes(noteText)
            ) ||
            bookings
              .filter((b) => String(b.companion?.id || '') === String(state.companionId))
              .sort((a, b) => new Date(b.bookingTime || 0) - new Date(a.bookingTime || 0))[0];

          expect(found, `Không tìm thấy booking theo note: ${noteText}`).to.exist;
          expect(found.id, 'bookingId từ fallback').to.exist;
          state.bookingId = found.id;
        });
      }
      expect(state.bookingId, 'state.bookingId phải có').to.exist;
      cy.url().should('include', '/user/appointments.html');
    });

    cy.then(() => state.bookingId).then((bookingId) => {
      expect(bookingId, 'bookingId phải có').to.exist;
    // Companion: ACCEPTED
    apiLogout();
    uiLogin(companion);
    cy.request({
      method: 'PATCH',
      url: `/api/companions/me/bookings/${state.bookingId}`,
      body: { status: 'ACCEPTED' }
    }).its('status').should('eq', 200);

    apiLogout();

    // Customer: check-in GPS -> stays ACCEPTED until companion check-in.
    uiLogin(customer);
    cy.intercept('PATCH', `/api/bookings/me/${state.bookingId}/check-in`).as('customerCheckInApi');
    visitWithStubs('/user/appointments.html');
    cy.get(`.booking-action[data-action="check-in"][data-id="${state.bookingId}"]`).should('exist').click();
    cy.wait('@customerCheckInApi').then(({ request }) => {
      const body = request.body;
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      expect(parsed).to.have.property('lat');
      expect(parsed).to.have.property('lng');
      expect(Number(parsed.lat)).to.eq(baseLat);
      expect(Number(parsed.lng)).to.eq(baseLng);
    });

    cy.request('/api/bookings/me').then((resp) => {
      const b = (resp.body || []).find((x) => x.id === state.bookingId);
      expect(b.status, 'Sau check-in của khách phải vẫn ACCEPTED').to.eq('ACCEPTED');
    });

    // Companion: check-in GPS -> booking becomes IN_PROGRESS.
    apiLogout();
    uiLogin(companion);
    cy.intercept('POST', `/api/companions/me/bookings/${state.bookingId}/checkin`).as('companionCheckInApi');
    visitWithStubs('/companion/bookings.html');
    cy.contains('#booking-body tr', String(state.bookingId)).within(() => {
      cy.get('[data-action="checkin"]').should('exist').click();
    });
    cy.wait('@companionCheckInApi').then(({ request }) => {
      const body = request.body;
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      expect(parsed).to.have.property('lat');
      expect(parsed).to.have.property('lng');
      expect(Number(parsed.lat)).to.eq(baseLat);
      expect(Number(parsed.lng)).to.eq(baseLng);
    });

    cy.request('/api/companions/me/bookings').then((resp) => {
      const b = (resp.body || []).find((x) => x.id === state.bookingId);
      expect(b.status, 'Sau check-in companion phải chuyển IN_PROGRESS').to.eq('IN_PROGRESS');
    });

    // Customer chat: Live location panel update + periodic POST.
    apiLogout();
    uiLogin(customer);
    const userLivePayload = {
      bookingId: state.bookingId,
      latitude: String(baseLat),
      longitude: String(baseLng),
      at: new Date().toISOString(),
      role: 'COMPANION',
      username: 'companion'
    };
    cy.intercept('GET', `/api/bookings/me/${state.bookingId}/live-location`, { statusCode: 200, body: userLivePayload });
    cy.intercept('POST', `/api/bookings/me/${state.bookingId}/live-location`).as('customerPushLiveApi');
    visitWithStubs(`/user/chat.html?bookingId=${state.bookingId}`);
    cy.wait('@customerPushLiveApi');
    cy.get('#live-location-details').should('contain.text', String(baseLat));
    cy.get('#live-map-wrap').should(($el) => {
      expect($el[0].style.display).to.eq('block');
    });

    // Companion chat: Live location panel update + periodic POST.
    apiLogout();
    uiLogin(companion);
    const companionLivePayload = {
      bookingId: state.bookingId,
      latitude: String(baseLat),
      longitude: String(baseLng),
      at: new Date().toISOString(),
      role: 'CUSTOMER',
      username: 'customer'
    };
    cy.intercept('GET', `/api/bookings/me/${state.bookingId}/live-location`, { statusCode: 200, body: companionLivePayload });
    cy.intercept('POST', `/api/bookings/me/${state.bookingId}/live-location`).as('companionPushLiveApi');
    visitWithStubs(`/companion/chat.html?bookingId=${state.bookingId}`);
    cy.wait('@companionPushLiveApi');
    cy.get('#live-location-details').should('contain.text', String(baseLat));
    cy.get('#live-map-wrap').should(($el) => {
      expect($el[0].style.display).to.eq('block');
    });

    // Admin tracking: markers detail + trail append via mocked STOMP callback.
    apiLogout();
    uiLogin(admin);
    visitWithStubs('/admin/tracking.html');
    cy.window().then((win) => {
      win.RealtimeStomp.subscribeBookingLocation = async (bookingId, cb) => {
        cb({ bookingId, latitude: String(baseLat), longitude: String(baseLng), at: new Date().toISOString() });
        cb({ bookingId, latitude: String(baseLat + 0.0002), longitude: String(baseLng + 0.0008), at: new Date().toISOString() });
        return { unsubscribe: () => {} };
      };
    });
    cy.contains('#admin-tracking-body tr', String(state.bookingId)).click();
    cy.get('#admin-tracking-selected-id').should('contain.text', String(state.bookingId));
    cy.get('#admin-tracking-detail').should('contain.text', `Đơn #${state.bookingId}`);
    // renderAdminTrackingDetail dùng toFixed(5)
    cy.get('#admin-tracking-detail').should('contain.text', '10.76262');
    cy.window().then((win) => {
      expect(win.__leafletCalls.polylineCalls.length, 'Đã vẽ ít nhất 2 đoạn polyline (tĩnh + trail)').to.be.gte(2);
    });

    // SOS: Companion kích hoạt SOS tại bookings page.
    apiLogout();
    uiLogin(companion);
    cy.intercept('POST', `/api/companions/me/bookings/${state.bookingId}/sos`).as('companionSosApi');
    visitWithStubs('/companion/bookings.html');
    cy.contains('#booking-body tr', String(state.bookingId)).within(() => {
      cy.get('[data-action="sos"]').should('exist').click();
    });
    cy.get('#sos-note-input').clear().type('SOS demo GPS realtime - companion');
    cy.get('#confirm-sos-btn').click();
    cy.wait('@companionSosApi').then(({ request }) => {
      const body = request.body;
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      expect(parsed).to.have.property('note');
      expect(parsed.note).to.include('SOS demo GPS realtime - companion');
      expect(Number(parsed.lat)).to.eq(baseLat);
      expect(Number(parsed.lng)).to.eq(baseLng);
    });

    // SOS: Customer gửi SOS từ user/report.html
    apiLogout();
    uiLogin(customer);
    cy.intercept('POST', '/api/reports').as('userReportSosApi');
    visitWithStubs(`/user/report.html?reportedUserId=${state.companionUserId}&bookingId=${state.bookingId}&emergency=1`);
    cy.get('#isEmergency').should('be.checked');
    cy.get('#reportCategory').should('have.value', 'OTHER');
    // Tránh race condition: reason có thể đang được init async từ booking.
    cy.get('#reason').clear().type('SOS demo GPS realtime - user báo khẩn cấp');
    cy.get('#report-form').submit();
    cy.wait('@userReportSosApi').then(({ request }) => {
      const body = request.body;
      const parsed = typeof body === 'string' ? JSON.parse(body) : body;
      expect(parsed.emergency).to.eq(true);
      expect(parsed.bookingId).to.eq(state.bookingId);
      expect(Number(parsed.reporterLatitude)).to.eq(baseLat);
      expect(Number(parsed.reporterLongitude)).to.eq(baseLng);
    });
    cy.get('#report-message').should('contain.text', 'thành công');

    // Check-out GPS: customer + companion -> COMPLETED
    apiLogout();
    uiLogin(customer);
    cy.intercept('PATCH', `/api/bookings/me/${state.bookingId}/check-out`).as('customerCheckOutApi');
    visitWithStubs('/user/appointments.html');
    cy.get(`.booking-action[data-action="check-out"][data-id="${state.bookingId}"]`).should('exist').click();
    cy.wait('@customerCheckOutApi');
    cy.request('/api/bookings/me').then((resp) => {
      const b = (resp.body || []).find((x) => x.id === state.bookingId);
      // Companion check-out chưa làm => thường vẫn IN_PROGRESS.
      expect(b.status, 'Sau check-out khách trước companion phải không COMPLETED').to.not.eq('COMPLETED');
    });

    apiLogout();
    uiLogin(companion);
    cy.intercept('POST', `/api/companions/me/bookings/${state.bookingId}/checkout`).as('companionCheckOutApi');
    visitWithStubs('/companion/bookings.html');
    cy.contains('#booking-body tr', String(state.bookingId)).within(() => {
      cy.get('[data-action="checkout"]').should('exist').click();
    });
    cy.wait('@companionCheckOutApi');
    cy.request('/api/companions/me/bookings').then((resp) => {
      const b = (resp.body || []).find((x) => x.id === state.bookingId);
      expect(b.status, 'Booking phải COMPLETED sau cả hai check-out').to.eq('COMPLETED');
    });

    // Admin SOS overlay: giả lập 1 notification SOS mới để kiểm tra render link Google Maps.
    apiLogout();
    uiLogin(admin);
    cy.clock();
    let notifyCall = 0;
    cy.intercept('GET', '/api/admin/notifications/me', (req) => {
      notifyCall += 1;
      if (notifyCall === 1) {
        req.reply([]);
      } else {
        req.reply([
          {
            id: 9999,
            title: 'SOS khẩn cấp',
            content:
              'Google Maps: https://www.google.com/maps?q=10.762622,106.660172\n' +
              'Latitude: 10.762622\n' +
              'Longitude: 106.660172\n' +
              '— SECTION —',
            createdAt: new Date().toISOString()
          }
        ]);
      }
    }).as('adminNotifApi');
    visitWithStubs('/admin/tracking.html');
    // Đợi poll lần đầu hoàn tất => timer setInterval đã được đăng.
    cy.wait('@adminNotifApi');
    cy.tick(4000);
    cy.wait('@adminNotifApi');
    cy.get('#admin-sos-overlay', { timeout: 10000 }).should('exist');
    cy.get('#admin-sos-overlay').should('contain.text', 'CẢNH BÁO SOS KHẨN CẤP');
    cy.get('#admin-sos-overlay a').should('have.attr', 'href').and('include', 'google.com/maps?q=');
    });
  });
});

