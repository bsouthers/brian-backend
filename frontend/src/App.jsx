import React from 'react';
import { Routes, Route, Navigate } from 'react-router-dom'; // Import Navigate
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import ProtectedRoute from './auth/ProtectedRoute';
import { useAuth } from './auth/AuthContext'; // Import useAuth
import './App.css';

// Helper component to handle redirection from /login if already authenticated
const PublicRoute = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    // Optional: Show a loading indicator or null while checking auth
    return <div>Loading...</div>; // Or a proper spinner
  }

  return user ? <Navigate to="/" replace /> : children;
};


function App() {
  return (
    <Routes>
      {/* Wrap Login route with PublicRoute */}
      <Route
        path="/login"
        element={
          <PublicRoute>
            <Login />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
      {/* Add other routes here if needed */}
    </Routes>
  );
}

export default App;
