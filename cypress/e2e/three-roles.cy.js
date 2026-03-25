describe('Nghiệp vụ E2E chi tiết cho 3 role', () => {
  Cypress.on('uncaught:exception', (err) => {
    if (String(err?.message || '').includes("Cannot set properties of null (setting 'textContent')")) {
      return false;
    }
    return true;
  });

  const now = Date.now();
  const customer = {
    username: `e2e_customer_${now}`,
    email: `e2e_customer_${now}@mail.com`,
    password: '123456',
  };
  const companion = {
    username: `e2e_companion_${now}`,
    email: `e2e_companion_${now}@mail.com`,
    password: '123456',
  };
  const admin = {
    username: Cypress.env('ADMIN_USERNAME') || 'thinh270924@gmail.com',
    password: Cypress.env('ADMIN_PASSWORD') || '123456',
  };

  const state = {
    companionId: null,
    companionUserId: null,
    servicePriceId: null,
    pendingBookingId: null,
    completedBookingId: null,
    withdrawalId: null,
  };

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
  }

  function apiLogout() {
    cy.request('POST', '/api/user/logout');
  }

  function ensureServicePrice() {
    return cy.request('/api/companions/me/service-prices').then((resp) => {
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
          description: 'Tư vấn vui vẻ, đồng hành theo nhu cầu (demo)',
        },
      }).then((createResp) => {
        state.servicePriceId = createResp.body.id;
      });
    });
  }

  before(() => {
    uiRegister(customer);
    uiRegister(companion);

    uiLogin(companion);
    cy.url().should('include', '/user/index.html');
    cy.request({
      method: 'POST',
      url: '/api/companions/register',
      body: {
        bio: 'Bạn đồng hành vui vẻ, trò chuyện nhẹ nhàng và lịch sự',
        hobbies: 'Cà phê, đọc sách, dạo phố',
        appearance: 'Tinh tế, lịch sự',
        availability: 'Tối thứ 2-6',
        serviceType: 'Tâm sự',
        area: 'Quận 1',
        rentalVenues: 'Quán cafe trung tâm\nCông viên Lê Văn Tám',
        gender: 'Nữ',
        onlineStatus: 'true',
      },
    });
    ensureServicePrice();
    cy.request({
      method: 'PATCH',
      url: '/api/companions/me/online',
      body: { online: true },
    });
    cy.request('/api/companions/me/profile').then((resp) => {
      state.companionId = resp.body.id;
      state.companionUserId = resp.body.user?.id;
      expect(state.companionId, 'companionId phải có').to.exist;
      expect(state.servicePriceId, 'servicePriceId phải có').to.exist;
    });
    apiLogout();

    uiLogin(admin);
    cy.request('/api/admin/pending-companions').then((resp) => {
      const created = (resp.body || []).find((item) => item.user?.username === companion.username);
      if (created) {
        cy.request('POST', `/api/admin/approve-companion/${created.id}`);
      }
    });
    apiLogout();
  });

  it('USER: nạp ví, yêu thích, đặt lịch (bắt buộc dịch vụ), gửi SOS report', () => {
    uiLogin(customer);
    cy.url().should('include', '/user/index.html');

    cy.intercept('POST', '/api/wallet/deposit').as('depositApi');
    cy.visit('/user/wallet.html');
    cy.get('#depositAmount').clear().type('500000');
    cy.get('#provider').select('MOMO');
    cy.get('#deposit-form').submit();
    cy.wait('@depositApi').its('response.statusCode').should('eq', 200);
    cy.get('#wallet-message').should('contain.text', 'Nạp tiền thành công');
    cy.get('#wallet-transactions tr').its('length').should('be.greaterThan', 0);

    cy.visit(`/user/profile.html?id=${state.companionId}`);
    cy.get('#add-favorite-btn').click();
    cy.get('#profile-message').should('contain.text', 'Đã thêm vào yêu thích');

    cy.intercept('GET', `/api/companions/${state.companionId}/service-prices`).as('servicePricesApi');
    cy.intercept('POST', '/api/bookings').as('createBookingApi');
    cy.visit(`/user/booking.html?id=${state.companionId}`);
    cy.wait('@servicePricesApi').its('response.statusCode').should('eq', 200);
    cy.get('#servicePriceId option').its('length').should('be.gte', 1);
    cy.get(`#servicePriceId option[value="${state.servicePriceId}"]`).should('exist');
    cy.get('#servicePriceId').select(String(state.servicePriceId));
    cy.get('#booking-service-price-hint').invoke('text').should('not.equal', '');
    cy.get('#bookingTime').type('2030-12-31T20:00');
    cy.get('#duration').clear().type('60');
    cy.get('#locationEnabled').uncheck({ force: true });
    cy.get('#rentalVenue').select('Quán cafe trung tâm');
    cy.get('#note').clear().type('Booking demo: test luồng 3 role');
    cy.get('#booking-form').submit();
    cy.wait('@createBookingApi').its('response.statusCode').should('eq', 200);
    cy.url().should('include', '/user/appointments.html');
    cy.get('#appointment-list').should('contain.text', 'PENDING');

    cy.request('/api/bookings/me').then((resp) => {
      const found = (resp.body || []).find((b) => b.companion?.id === state.companionId);
      expect(found, 'Phải tạo được booking PENDING').to.exist;
      state.pendingBookingId = found.id;
      expect(found.servicePricePerHour, 'booking phải lưu giá dịch vụ').to.exist;
    });

    cy.visit('/user/report.html');
    cy.get('#reportedUserId').clear().type(String(state.companionUserId));
    cy.get('#reportCategory').select('LATE');
    cy.get('#reason').clear().type('Companion đến trễ');
    cy.get('#isEmergency').check({ force: true });
    cy.get('#report-form').submit();
    cy.get('#report-message').should('contain.text', 'Gửi tố cáo thành công');
    cy.get('#report-list .card').its('length').should('be.greaterThan', 0);
  });

  it('COMPANION: nhận đơn, check-in/out, đánh giá user, thiết lập bank + rút tiền', () => {
    uiLogin(companion);
    cy.url().should('include', '/companion/dashboard.html');

    cy.visit('/companion/bookings.html');

    cy.request('/api/companions/me/bookings').then((resp) => {
      const target =
        (resp.body || []).find((b) => b.id === state.pendingBookingId && b.status === 'PENDING') ||
        (resp.body || []).find((b) => b.status === 'PENDING');
      state.pendingBookingId = target?.id || null;
      expect(state.pendingBookingId, 'Cần có booking PENDING trước').to.exist;
    });

    cy.then(() => {
      const bookingId = state.pendingBookingId;
      cy.request({
        method: 'PATCH',
        url: `/api/companions/me/bookings/${bookingId}`,
        body: { status: 'ACCEPTED' },
      }).its('status').should('eq', 200);

      apiLogout();
      cy.request({
        method: 'POST',
        url: '/api/user/login',
        body: { username: customer.username, password: customer.password },
      }).its('status').should('eq', 200);
      cy.request({
        method: 'PATCH',
        url: `/api/bookings/me/${bookingId}/check-in`,
        body: { lat: '10.762622', lng: '106.660172' },
      }).its('status').should('eq', 200);
      apiLogout();
      cy.request({
        method: 'POST',
        url: '/api/user/login',
        body: { username: companion.username, password: companion.password },
      }).its('status').should('eq', 200);

      cy.request({
        method: 'POST',
        url: `/api/companions/me/bookings/${bookingId}/checkin`,
        body: { lat: '10.762622', lng: '106.660172' },
      }).its('status').should('eq', 200);

      apiLogout();
      cy.request({
        method: 'POST',
        url: '/api/user/login',
        body: { username: customer.username, password: customer.password },
      }).its('status').should('eq', 200);
      cy.request({
        method: 'PATCH',
        url: `/api/bookings/me/${bookingId}/check-out`,
        body: { lat: '10.762622', lng: '106.660172' },
      }).its('status').should('eq', 200);
      apiLogout();
      cy.request({
        method: 'POST',
        url: '/api/user/login',
        body: { username: companion.username, password: companion.password },
      }).its('status').should('eq', 200);

      cy.request({
        method: 'POST',
        url: `/api/companions/me/bookings/${bookingId}/checkout`,
        body: { lat: '10.762622', lng: '106.660172' },
      }).its('status').should('eq', 200);

      cy.request('/api/companions/me/bookings').then((afterResp) => {
        const done = (afterResp.body || []).find((b) => b.id === bookingId);
        expect(done?.status, 'Booking phải COMPLETED sau luồng xử lý').to.eq('COMPLETED');
      });
    });

    cy.request('/api/companions/me/bookings').then((resp) => {
      const completed = (resp.body || []).find((b) => b.id === state.pendingBookingId && b.status === 'COMPLETED');
      expect(completed, 'Booking phải completed').to.exist;
      state.completedBookingId = completed.id;
    });

    cy.intercept('PUT', '/api/companions/me/bank-account').as('saveBankApi');
    cy.intercept('POST', '/api/companions/me/withdrawals').as('createWithdrawalApi');
    cy.visit('/companion/finance.html');
    cy.get('#bank-name').clear().type('Vietcombank');
    cy.get('#bank-account-number').clear().type('123456789');
    cy.get('#account-holder-name').clear().type('Nguyễn Văn A (Demo)');
    cy.get('#bank-account-form').submit();
    cy.wait('@saveBankApi').its('response.statusCode').should('eq', 200);
    cy.get('#alert-box').invoke('text').should('match', /lưu|ngân hàng/i);

    cy.get('#withdraw-amount').clear().type('10000');
    cy.get('#withdraw-form').submit();
    cy.wait('@createWithdrawalApi').its('response.statusCode').should('eq', 200);
    cy.get('#alert-box').invoke('text').should('match', /lệnh rút|tạo/i);
    cy.get('#withdrawal-body').find('tr').its('length').should('be.greaterThan', 0);

    cy.request('/api/companions/me/withdrawals').then((resp) => {
      const latest = (resp.body || [])[0];
      if (latest) {
        state.withdrawalId = latest.id;
      }
    });
  });

  it('USER: chat/call + gửi review sau khi completed', () => {
    uiLogin(customer);
    cy.request('/api/bookings/me').then((resp) => {
      const bookings = resp.body || [];
      const completed =
        bookings.find((b) => b.id === state.pendingBookingId && b.status === 'COMPLETED') ||
        bookings.find((b) => b.status === 'COMPLETED');

      if (completed) {
        state.completedBookingId = completed.id;
        return;
      }

      const pending =
        bookings.find((b) => b.id === state.pendingBookingId && b.status === 'PENDING') ||
        bookings.find((b) => b.status === 'PENDING');

      if (!pending) {
        state.completedBookingId = null;
        return;
      }

      const pendingId = pending.id;
      apiLogout();
      uiLogin(companion);
      cy.request({
        method: 'PATCH',
        url: `/api/companions/me/bookings/${pendingId}`,
        body: { status: 'ACCEPTED' },
        failOnStatusCode: false,
      });
      apiLogout();
      cy.request({
        method: 'POST',
        url: '/api/user/login',
        body: { username: customer.username, password: customer.password },
        failOnStatusCode: false,
      });
      cy.request({
        method: 'PATCH',
        url: `/api/bookings/me/${pendingId}/check-in`,
        body: { lat: '10.762622', lng: '106.660172' },
        failOnStatusCode: false,
      });
      apiLogout();
      cy.request({
        method: 'POST',
        url: '/api/user/login',
        body: { username: companion.username, password: companion.password },
        failOnStatusCode: false,
      });
      cy.request({
        method: 'POST',
        url: `/api/companions/me/bookings/${pendingId}/checkin`,
        body: { lat: '10.762622', lng: '106.660172' },
        failOnStatusCode: false,
      });
      apiLogout();
      cy.request({
        method: 'POST',
        url: '/api/user/login',
        body: { username: customer.username, password: customer.password },
        failOnStatusCode: false,
      });
      cy.request({
        method: 'PATCH',
        url: `/api/bookings/me/${pendingId}/check-out`,
        body: { lat: '10.762622', lng: '106.660172' },
        failOnStatusCode: false,
      });
      apiLogout();
      cy.request({
        method: 'POST',
        url: '/api/user/login',
        body: { username: companion.username, password: companion.password },
        failOnStatusCode: false,
      });
      cy.request({
        method: 'POST',
        url: `/api/companions/me/bookings/${pendingId}/checkout`,
        body: { lat: '10.762622', lng: '106.660172' },
        failOnStatusCode: false,
      });
      apiLogout();
      uiLogin(customer);
      cy.request('/api/bookings/me').then((verifyResp) => {
        const completedAfterFix = (verifyResp.body || []).find((b) => b.id === pendingId && b.status === 'COMPLETED');
        state.completedBookingId = completedAfterFix?.id || null;
      });
    }).then(() => {
      expect(state.completedBookingId, 'Cần có booking completed trước').to.exist;
    });

    cy.visit('/user/appointments.html');
    cy.get('#appointment-list').should('contain.text', 'COMPLETED');

    cy.then(() => {
      cy.visit(`/user/chat.html?bookingId=${state.completedBookingId}`);
      cy.get('#chat-content').clear().type('Chào bạn, mình tới đúng hẹn nhé!');
      cy.get('#chat-form').submit();
      cy.get('#chat-list').should('contain.text', 'Chào bạn, mình tới đúng hẹn nhé!');
      cy.get('#call-btn').click();
      cy.get('#call-info').should('contain.text', 'VoIP room');
    });

    cy.visit('/user/review.html');
    cy.get('#rating-stars .star-btn[data-value="5"]').click();
    cy.get('#comment').clear().type('Trải nghiệm rất tốt từ bài test');
    cy.get('#review-form').submit();
    cy.get('#review-message').should('contain.text', 'Gửi đánh giá thành công');
    cy.get('#review-list').should('contain.text', 'Trải nghiệm rất tốt từ bài test');
  });

  it('ADMIN: kiểm tra dashboard/users/moderation/transactions/disputes chi tiết', () => {
    uiLogin(admin);
    cy.url().should('include', '/admin/dashboard.html');

    cy.intercept('GET', '/api/admin/dashboard-stats').as('statsApi');
    cy.visit('/admin/dashboard.html');
    cy.wait('@statsApi').its('response.statusCode').should('eq', 200);
    cy.get('#stat-profit').should('exist');
    cy.get('#stat-transactions').should('exist');
    cy.get('#pending-body').should('exist');

    cy.intercept('GET', '/api/admin/users').as('usersApi');
    cy.visit('/admin/users.html');
    cy.wait('@usersApi').its('response.statusCode').should('eq', 200);
    cy.get('#users-body').should('contain.text', customer.username);
    cy.get('#companions-body').should('contain.text', companion.username);

    cy.intercept('GET', '/api/admin/pending-companions').as('pendingApi');
    cy.intercept('GET', '/api/admin/moderation/reviews').as('reviewsApi');
    cy.visit('/admin/moderation.html');
    cy.wait('@pendingApi').its('response.statusCode').should('eq', 200);
    cy.wait('@reviewsApi').its('response.statusCode').should('eq', 200);
    cy.get('#moderation-pending-body').should('exist');
    cy.get('#reviews-body').should('exist');

    cy.get('#moderation-pending-body').then(($tbody) => {
      if ($tbody.text().includes(companion.username)) {
        cy.contains('#moderation-pending-body tr', companion.username).within(() => {
          cy.contains('button', 'Xem hồ sơ').should('exist').click();
          cy.contains('button', 'Cấp tích xanh').should('not.exist');
        });
        cy.get('#companion-review-modal').should('be.visible');
        cy.get('#companion-review-detail').should('contain.text', companion.username);
        cy.intercept('POST', /\/api\/admin\/approve-companion\/\d+/).as('approveCompanionApi');
        cy.get('#companion-approve-btn').click();
        cy.wait('@approveCompanionApi').its('response.statusCode').should('eq', 200);
        cy.get('#admin-alert').invoke('text').should('match', /cấp tích xanh|duyệt/i);
      }
    });

    cy.intercept('GET', '/api/admin/transactions').as('transactionsApi');
    cy.intercept('PUT', '/api/admin/transactions/commission-rate').as('commissionApi');
    cy.intercept('POST', /\/api\/admin\/transactions\/withdrawals\/\d+\/approve/).as('approveWithdrawalApi');
    cy.visit('/admin/transactions.html');
    cy.wait('@transactionsApi').its('response.statusCode').should('eq', 200);
    cy.get('#commission-rate').clear().type('0.2');
    cy.get('#commission-form').submit();
    cy.wait('@commissionApi').its('response.statusCode').should('eq', 200);
    cy.get('#admin-alert').invoke('text').should('match', /hoa hồng|commission/i);

    cy.get('#withdrawals-body').then(($tbody) => {
      const hasApprove = $tbody.find('button[data-action="approve"]').length > 0;
      if (hasApprove) {
        cy.get('#withdrawals-body button[data-action="approve"]').first().click();
        cy.wait('@approveWithdrawalApi').its('response.statusCode').should('eq', 200);
        cy.get('#admin-alert').invoke('text').should('match', /duyệt lệnh rút tiền|duyet lenh rut tien/i);
      }
    });

    cy.intercept('GET', '/api/admin/disputes').as('disputesApi');
    cy.visit('/admin/disputes.html');
    cy.wait('@disputesApi').its('response.statusCode').should('eq', 200);
    cy.get('#disputes-body').should('exist');
  });
});
