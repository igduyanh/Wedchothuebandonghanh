describe('ADMIN full flow: UI to API', () => {
  const admin = {
    username: Cypress.env('ADMIN_USERNAME') || 'admin',
    password: Cypress.env('ADMIN_PASSWORD') || '123456',
  };

  function loginAdmin() {
    cy.intercept('POST', '/api/user/login').as('loginApi');
    cy.visit('/user/login.html');
    cy.get('#username').clear().type(admin.username);
    cy.get('#password').clear().type(admin.password);
    cy.get('#login-form').submit();
    cy.wait('@loginApi').its('response.statusCode').should('eq', 200);
    cy.url().should('include', '/admin/dashboard.html');
  }

  it('dashboard, users, moderation (xem hồ sơ trước khi duyệt), transactions, disputes', () => {
    if (!admin.username || !admin.password) {
      cy.log('Skip: cần cấu hình ADMIN_USERNAME và ADMIN_PASSWORD');
      return;
    }

    loginAdmin();

    cy.intercept('GET', '/api/admin/dashboard-stats').as('statsApi');
    cy.intercept('GET', '/api/admin/pending-companions').as('pendingApi');
    cy.visit('/admin/dashboard.html');
    cy.wait('@statsApi').its('response.statusCode').should('eq', 200);
    cy.wait('@pendingApi').its('response.statusCode').should('eq', 200);
    cy.get('#stat-profit').should('exist');
    cy.get('#stat-transactions').should('exist');

    cy.intercept('GET', '/api/admin/users').as('usersApi');
    cy.visit('/admin/users.html');
    cy.wait('@usersApi').its('response.statusCode').should('eq', 200);
    cy.get('#users-body').should('exist');
    cy.get('#companions-body').should('exist');

    cy.intercept('GET', '/api/admin/moderation/reviews').as('moderationReviewApi');
    cy.visit('/admin/moderation.html');
    cy.wait('@pendingApi').its('response.statusCode').should('eq', 200);
    cy.wait('@moderationReviewApi').its('response.statusCode').should('eq', 200);
    cy.get('#moderation-pending-body').should('exist');
    cy.get('#reviews-body').should('exist');

    cy.get('#moderation-pending-body').then(($tbody) => {
      const hasRow = $tbody.find('tr').length > 0 && !$tbody.text().includes('Không có hồ sơ');
      if (hasRow) {
        cy.get('#moderation-pending-body tr').first().within(() => {
          cy.contains('button', 'Xem hồ sơ').should('exist').click();
          cy.contains('button', 'Cấp tích xanh').should('not.exist');
        });
        cy.get('#companion-review-modal').should('be.visible');
        cy.get('#companion-review-detail').invoke('text').should('not.equal', '');
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
      const hasApproveButton = $tbody.find('button[data-action="approve"]').length > 0;
      if (hasApproveButton) {
        cy.wrap($tbody).find('button[data-action="approve"]').first().click();
        cy.wait('@approveWithdrawalApi').its('response.statusCode').should('eq', 200);
        cy.get('#admin-alert').invoke('text').should('match', /duyệt lệnh rút tiền|duyet lenh rut tien/i);
      }
    });

    cy.intercept('GET', '/api/admin/disputes').as('disputesApi');
    cy.visit('/admin/disputes.html');
    cy.wait('@disputesApi').its('response.statusCode').should('eq', 200);
    cy.get('#disputes-body').should('exist');

    cy.request('POST', '/api/user/logout');
  });
});
