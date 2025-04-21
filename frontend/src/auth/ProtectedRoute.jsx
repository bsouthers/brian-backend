import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from './AuthContext';
// Optional: Import an MUI loading component if desired
// import CircularProgress from '@mui/material/CircularProgress';
// import Box from '@mui/material/Box';

const ProtectedRoute = ({ children }) => {
  const { user, isLoading } = useAuth();

  if (isLoading) {
    // Render a loading indicator while checking auth status
    // Replace with a more sophisticated loader (e.g., MUI CircularProgress) if needed
    // return (
    //   <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
    //     <CircularProgress />
    //   </Box>
    // );
    return <div>Loading...</div>;
  }

  if (!user) {
    // If not loading and no user, redirect to the login page
    // Pass the current location to redirect back after login (optional)
    return <Navigate to="/login" replace />;
  }

  // If authenticated and not loading, render the requested component/route
  // If used directly wrapping a component, render children.
  // If used in route definitions, render Outlet.
  return children ? children : <Outlet />;
};

export default ProtectedRoute;