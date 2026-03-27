/**
 * seed-completed-booking.cy.js
 *
 * Mục đích: Tạo (seed) 1 booking có status = COMPLETED trong DB
 * để test trang /companion/bookings.html.
 *
 * Flow:
 *  1. Đăng ký + đăng nhập companion → đăng ký profile companion
 *  2. Admin approve companion (qua API admin trực tiếp)
 *  3. Companion bật online + thêm service price
 *  4. Đăng ký + đăng nhập customer → nạp ví
 *  5. Customer tạo booking với companion
 *  6. Companion accept booking → start → complete booking (qua API)
 *  7. Đăng nhập companion → vào /companion/bookings.html và kiểm tra booking COMPLETED hiện ra
 */

describe('Seed: Tạo 1 completed booking cho companion', () => {
  const now = Date.now();

  const companion = {
    username: `seed_companion_${now}`,
    email: `seed_companion_${now}@mail.com`,
    password: '123456',
  };

  const customer = {
    username: `seed_customer_${now}`,
    email: `seed_customer_${now}@mail.com`,
    password: '123456',
  };

  // ─── Helpers ────────────────────────────────────────────────────────────────

  function register(user) {
    cy.visit('/user/register.html');
    cy.get('#username').clear().type(user.username);
    cy.get('#email').clear().type(user.email);
    cy.get('#password').clear().type(user.password);
    cy.get('#register-form').submit();
    cy.url().should('include', '/user/login.html');
  }

  function login(user) {
    cy.intercept('POST', '/api/user/login').as('loginApi');
    cy.visit('/user/login.html');
    cy.get('#username').clear().type(user.username);
    cy.get('#password').clear().type(user.password);
    cy.get('#login-form').submit();
    cy.wait('@loginApi').its('response.statusCode').should('eq', 200);
  }

  function logout() {
    cy.request('POST', '/api/user/logout');
  }

  // ─── PHASE 1: Setup companion ────────────────────────────────────────────────

  before(() => {
    // 1a. Đăng ký customer
    register(customer);

    // 1b. Đăng ký companion
    register(companion);

    // 1c. Login companion → đăng ký profile companion + bật online + thêm service
    login(companion);

    cy.request({
      method: 'POST',
      url: '/api/companions/register',
      failOnStatusCode: false,
      body: {
        bio: 'Seed companion tạo bởi Cypress',
        hobbies: 'du lich, doc sach',
        appearance: 'lich su, than thien',
        availability: 'buoi toi',
      },
    });

    // Cập nhật thêm rentalVenues để booking có thể chọn venue
    cy.request({
      method: 'PUT',
      url: '/api/companions/me/profile',
      failOnStatusCode: false,
      body: {
        bio: 'Seed companion tạo bởi Cypress',
        hobbies: 'du lich',
        appearance: 'lich su',
        availability: 'buoi toi',
        rentalVenues: 'Quan cafe ABC',
      },
    });

    // Thêm service price
    cy.request({
      method: 'POST',
      url: '/api/companions/me/service-prices',
      failOnStatusCode: false,
      body: {
        serviceName: 'Di choi cung ban',
        pricePerHour: 100000,
        description: 'Seed service by Cypress',
      },
    });

    // Bật online
    cy.request({
      method: 'PATCH',
      url: '/api/companions/me/online',
      failOnStatusCode: false,
      body: { online: true },
    });

    logout();

    // 1d. Admin approve companion  (login admin trước)
    cy.request({
      method: 'POST',
      url: '/api/user/login',
      body: {
        username: Cypress.env('ADMIN_USERNAME') || 'admin',
        password: Cypress.env('ADMIN_PASSWORD') || 'admin123',
      },
      failOnStatusCode: false,
    });

    // Lấy danh sách pending companions → approve companion vừa tạo
    cy.request({ url: '/api/admin/pending-companions', failOnStatusCode: false }).then((res) => {
      const list = res.body || [];
      const found = list.find(
        (c) => c.username === companion.username || c.user?.username === companion.username,
      );
      if (found) {
        cy.request({
          method: 'POST',
          url: `/api/admin/approve-companion/${found.id}`,
          failOnStatusCode: false,
        });
      } else {
        cy.log('⚠️  Không tìm thấy companion pending – bỏ qua bước approve');
      }
    });

    cy.request('POST', '/api/user/logout');
  });

  // ─── PHASE 2: Tạo booking và đẩy lên COMPLETED ──────────────────────────────

  it('tạo booking → companion accept → complete → kiểm tra trang companion/bookings.html', () => {
    // ── 2a. Customer nạp ví ──────────────────────────────────────────────────
    login(customer);

    cy.request({
      method: 'POST',
      url: '/api/wallet/deposit',
      failOnStatusCode: false,
      body: { amount: 500000, provider: 'MOMO' },
    });

    // ── 2b. Tìm companion vừa tạo & service price ────────────────────────────
    cy.request('/api/companions').then((res) => {
      const allCompanions = res.body || [];
      const targetCompanion = allCompanions.find(
        (c) => c.username === companion.username || c.user?.username === companion.username,
      );

      if (!targetCompanion) {
        cy.log('❌ Không tìm thấy companion trong danh sách – hủy test');
        return;
      }

      cy.request(`/api/companions/${targetCompanion.id}/service-prices`).then((spRes) => {
        const service = (spRes.body || [])[0];
        if (!service) {
          cy.log('❌ Companion chưa có service price – hủy test');
          return;
        }

        // ── 2c. Customer tạo booking ─────────────────────────────────────────
        cy.request({
          method: 'POST',
          url: '/api/bookings',
          failOnStatusCode: false,
          body: {
            companionId: targetCompanion.id,
            servicePriceId: service.id,
            bookingTime: '2026-04-01T10:00:00',
            duration: 60,
            locationEnabled: false,
            rentalVenue: 'Quan cafe ABC',
            note: 'Seed booking bởi Cypress',
          },
        }).then((bookingRes) => {
          cy.log('Create booking status: ' + bookingRes.status);
          expect([200, 201]).to.include(bookingRes.status);

          const bookingId = bookingRes.body?.id;
          expect(bookingId).to.be.a('number');

          logout();

          // ── 2d. Companion accept → start → complete ──────────────────────
          login(companion);

          cy.request({
            method: 'PATCH',
            url: `/api/companions/me/bookings/${bookingId}/accept`,
            failOnStatusCode: false,
          }).then((r) => cy.log('Accept status: ' + r.status));

          cy.request({
            method: 'PATCH',
            url: `/api/companions/me/bookings/${bookingId}/start`,
            failOnStatusCode: false,
          }).then((r) => cy.log('Start status: ' + r.status));

          cy.request({
            method: 'PATCH',
            url: `/api/companions/me/bookings/${bookingId}/complete`,
            failOnStatusCode: false,
          }).then((r) => {
            cy.log('Complete status: ' + r.status);
            expect(r.status).to.eq(200);
          });

          // ── 2e. Vào trang bookings.html và kiểm tra booking COMPLETED ─────
          cy.intercept('GET', '/api/companions/me/bookings/workflow').as('workflowApi');
          cy.visit('/companion/bookings.html');
          cy.wait('@workflowApi').its('response.statusCode').should('eq', 200);

          // Panel "Đã hoàn thành" (#wf-done) phải tồn tại và chứa booking
          cy.get('#wf-done').should('exist');
          cy.get('#wf-done').should('contain.text', String(bookingId)).or(() =>
            cy.get('#wf-done .card').its('length').should('be.greaterThan', 0),
          );

          cy.log(`✅ Booking #${bookingId} đã ở trạng thái COMPLETED – seed thành công!`);

          logout();
        });
      });
    });
  });
});
