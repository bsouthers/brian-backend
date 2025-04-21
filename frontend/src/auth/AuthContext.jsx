import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import axiosInstance from '../api/axios'; // Import the configured Axios instance

// Create the context
const AuthContext = createContext(null);

// Create the provider component
export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);
  // TODO: Switch to http-only cookies for JWT storage and transmission in the next sprint for improved security.
  const [token, setToken] = useState(() => localStorage.getItem('jwt')); // Initialize token from localStorage
  const [isLoading, setIsLoading] = useState(true); // Start in loading state

  // Effect to fetch user profile if token exists on mount
  useEffect(() => {
    const fetchUser = async () => {
      if (token) {
        try {
          // Use the configured axiosInstance which includes the token interceptor
          const response = await axiosInstance.get('/auth/me');
          setUser(response.data.user); // Assuming the API returns user data under 'user' key
        } catch (error) {
          console.error("Failed to fetch user profile:", error);
          // If fetching user fails (e.g., invalid token), clear token and user
          localStorage.removeItem('jwt');
          setToken(null);
          setUser(null);
        } finally {
          setIsLoading(false); // Stop loading once fetch attempt is complete
        }
      } else {
        setIsLoading(false); // No token, stop loading
      }
    };

    fetchUser();
  }, [token]); // Re-run if the token changes (e.g., after login)

  // Login function
  const login = useCallback(async (email, password) => {
    setIsLoading(true);
    try {
      const response = await axiosInstance.post('/auth/login', { email, password });
      const { token: receivedToken, user: loggedInUser } = response.data; // Assuming API returns token and user

      localStorage.setItem('jwt', receivedToken); // Store token in localStorage
      setToken(receivedToken); // Update token state
      setUser(loggedInUser); // Update user state
      setIsLoading(false);
      return response; // Return the full response for potential further handling
    } catch (error) {
      console.error("Login failed:", error);
      localStorage.removeItem('jwt'); // Ensure no invalid token is stored
      setToken(null);
      setUser(null);
      setIsLoading(false);
      throw error; // Re-throw error for the calling component to handle
    }
  }, []);

  // Logout function
  const logout = useCallback(() => {
    localStorage.removeItem('jwt'); // Remove token from localStorage
    setToken(null); // Clear token state
    setUser(null); // Clear user state
    // Optionally redirect or perform other cleanup
  }, []);

  // Context value
  const value = {
    user,
    token,
    isLoading,
    login,
    logout,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
};

// Custom hook to use the auth context
export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};