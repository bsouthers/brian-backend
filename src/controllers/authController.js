const authService = require('../services/authService');
const { Person } = require('../models'); // Needed for getMe if not using service for it

/**
 * Handles user login.
 * Expects 'email' and 'password' in the request body.
 */
const login = async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ message: 'Email and password are required.' });
  }

  try {
    const result = await authService.loginUser(email, password);

    if (!result) {
      return res.status(401).json({ message: 'Invalid credentials.' });
    }

    // Send the token and user details back
    // Consider security implications of what user details are sent.
    // TODO: Switch to http-only cookies for JWT storage and transmission in the next sprint for improved security.
    res.json({ token: result.token, user: result.user });

  } catch (error) {
    console.error('Login controller error:', error);
    res.status(500).json({ message: 'An error occurred during login.' });
  }
};

/**
 * Gets the details of the currently authenticated user.
 * Assumes authentication middleware has run and attached user to req.user.
 */
const getMe = async (req, res) => {
  // req.user should be populated by the authentication middleware
  if (!req.user) {
    // This case should ideally be caught by the middleware, but added as a safeguard
    return res.status(401).json({ message: 'Not authenticated.' });
  }

  try {
    // The middleware already fetched the user, but we might want to refetch
    // or just return the data attached by the middleware.
    // For simplicity, we return the user object attached by the middleware.
    // Ensure the middleware doesn't attach sensitive info like the password hash.
    const userDetails = {
        employee_id: req.user.employee_id,
        first_name: req.user.first_name,
        last_name: req.user.last_name,
        email: req.user.email,
        team: req.user.team,
        // Add other safe fields as needed
    };
    res.json(userDetails);

  } catch (error) {
      console.error('GetMe controller error:', error);
      res.status(500).json({ message: 'An error occurred fetching user details.' });
  }
};

/**
 * Handles user logout.
 * Basic implementation - JWT logout is primarily client-side.
 */
const logout = (req, res) => {
  // For stateless JWT, logout is typically handled client-side by deleting the token.
  // Server-side blocklisting is more complex and likely not needed here.
  res.json({ message: 'Logout successful. Please delete the token client-side.' });
};

module.exports = {
  login,
  getMe,
  logout,
};