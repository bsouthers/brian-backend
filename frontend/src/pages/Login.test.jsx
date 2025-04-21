// src/pages/Login.test.jsx
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MemoryRouter } from 'react-router-dom';
import { AuthProvider } from '../auth/AuthContext'; // Adjust path if needed
import Login from './Login'; // Adjust path if needed
import axios from '../api/axios'; // Adjust path if needed

// Mock the axios module
vi.mock('../api/axios');

// Mock localStorage
const localStorageMock = (() => {
  let store = {};
  return {
    getItem: vi.fn((key) => store[key] || null),
    setItem: vi.fn((key, value) => {
      store[key] = value.toString();
    }),
    removeItem: vi.fn((key) => {
      delete store[key];
    }),
    clear: vi.fn(() => {
      store = {};
    }),
  };
})();

describe('Login Component', () => {
  let originalLocalStorage;

  beforeEach(() => {
    // Stub global localStorage before each test
    originalLocalStorage = window.localStorage;
    vi.stubGlobal('localStorage', localStorageMock);
    // Reset mocks before each test
    vi.clearAllMocks();
  });

  afterEach(() => {
    // Restore original localStorage after each test
    vi.stubGlobal('localStorage', originalLocalStorage);
  });

  it('should allow user to log in successfully, store JWT, and use relative API path', async () => {
    const mockToken = 'mock-jwt-token';
    const mockUser = { id: 1, email: 'test@example.com' };
    const mockResponse = { data: { token: mockToken, user: mockUser } };

    // Configure the mock axios post method
    axios.post.mockResolvedValue(mockResponse);

    render(
      <MemoryRouter>
        <AuthProvider>
          <Login />
        </AuthProvider>
      </MemoryRouter>
    );

    // Find form elements
    const emailInput = screen.getByLabelText(/email/i);
    const passwordInput = screen.getByLabelText(/password/i);
    const loginButton = screen.getByRole('button', { name: /sign in/i });

    // Simulate user input
    fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
    fireEvent.change(passwordInput, { target: { value: 'password123' } });

    // Simulate form submission
    fireEvent.click(loginButton);

    // Wait for async operations and assertions
    await waitFor(() => {
      // Assert axios was called correctly
      expect(axios.post).toHaveBeenCalledTimes(1);
      // Verify that the relative path '/auth/login' is used, confirming baseURL is applied correctly
      expect(axios.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });
    });

    await waitFor(() => {
        // Assert localStorage was updated
        expect(localStorage.setItem).toHaveBeenCalledTimes(1);
        expect(localStorage.setItem).toHaveBeenCalledWith('jwt', mockToken);
    });

    // Optional: Check if login form elements are gone (implies navigation)
    // This might be brittle depending on how navigation/redirects are handled.
    // await waitFor(() => {
    //   expect(screen.queryByLabelText(/email/i)).not.toBeInTheDocument();
    //   expect(screen.queryByLabelText(/password/i)).not.toBeInTheDocument();
    // });
  });

  // Add more tests here for error handling, validation, etc.
});