describe('Login', () => {
  it('logs in & reaches dashboard', () => {
    // Visit the login page (adjust path if necessary, assuming '/login')
    cy.visit('/login');

    // Intercept the login API call to wait for it later
    // Ensure the URL matches your actual backend API endpoint for login
    cy.intercept('POST', 'http://localhost:3000/api/v1/auth/login').as('loginRequest');

    // Find form elements, type credentials, and submit
    // Adjust selectors if they differ in your Login.jsx component
    cy.get('input[name="email"]').type('dev@example.com');
    cy.get('input[name="password"]').type('password123');
    // Use a robust selector for the sign-in button, case-insensitive text match is good
    cy.contains('button', /sign in/i).click();

    // Wait for the intercepted login request and assert its success
    cy.wait('@loginRequest').its('response.statusCode').should('eq', 200);

    // Verify JWT token is stored in localStorage
    cy.window().its('localStorage.jwt').should('exist');

    // Verify redirection to the dashboard (root path '/' in this case)
    // Adjust the regex if your dashboard URL is different
    cy.url().should('match', /\/$/);
  });
});