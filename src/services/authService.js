const { Person } = require('../models'); // Assuming models/index.js exports models
const jwt = require('jsonwebtoken');
// const { jwtSecret, jwtExpiresIn } = require('../config/environment'); // Assuming JWT config is here // Commented out old line
const env          = require('../config/environment');
// Accept either JWT_SECRET / JWT_EXPIRES_IN (upper-case) or the original lower-case variants
const jwtSecret    = env.jwtSecret    || env.JWT_SECRET;
const jwtExpiresIn = env.jwtExpiresIn || env.JWT_EXPIRES_IN || '1h';

/**
 * Attempts to log in a user.
 * @param {string} email - The user's email.
 * @param {string} password - The user's password.
 * @returns {Promise<{token: string, user: object}|null>} - JWT and user details if successful, null otherwise.
 */
const loginUser = async (email, password) => {
  try {
    const person = await Person.findOne({ where: { email } });

    if (!person) {
      console.log(`Login attempt failed: No user found with email ${email}`);
      return null; // User not found
    }

    // Use the instance method we added to the Person model
    const isMatch = await person.comparePassword(password);

    if (!isMatch) {
      console.log(`Login attempt failed: Invalid password for email ${email}`);
      return null; // Passwords don't match
    }

    // Passwords match, generate JWT
    const payload = {
      id: person.employee_id, // Use employee_id as the identifier in the token
      email: person.email,
      // Add other relevant non-sensitive info if needed
    };

    const token = jwt.sign(
      payload,
      jwtSecret,
      { expiresIn: jwtExpiresIn || '1h' } // Use configured expiration or default to 1 hour
    );

    // Return the token and some user details (excluding password)
    const userDetails = {
      employee_id: person.employee_id,
      first_name: person.first_name,
      last_name: person.last_name,
      email: person.email,
      team: person.team,
      // Add other fields as needed, but NEVER the password hash
    };

    console.log(`Login successful for email ${email}`);
    return { token, user: userDetails };

  } catch (error) {
    console.error('Error during login process:', error);
    throw error; // Re-throw the error to be handled by the controller
  }
};

module.exports = {
  loginUser,
};