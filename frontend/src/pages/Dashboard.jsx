import React from 'react';
import { Box, Typography, Button, Container } from '@mui/material';
import { useAuth } from '../auth/AuthContext'; // Assuming useAuth is here

const Dashboard = () => {
  const { logout } = useAuth();

  const handleLogout = async () => {
    try {
      await logout();
      // No need to navigate, AuthProvider/ProtectedRoute handles it
    } catch (error) {
      console.error('Logout failed:', error);
      // Optionally display an error message to the user
    }
  };

  return (
    <Container component="main" maxWidth="md">
      <Box
        sx={{
          marginTop: 8,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
        }}
      >
        <Typography variant="h4" component="h1" gutterBottom>
          Dashboard
        </Typography>
        <Typography variant="h6" sx={{ mb: 2 }}>
          ✅ You are logged in!
        </Typography>
        <Button variant="contained" color="secondary" onClick={handleLogout}>
          Logout
        </Button>
      </Box>
    </Container>
  );
};

export default Dashboard;