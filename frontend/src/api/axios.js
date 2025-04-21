import axios from 'axios';

// Create an Axios instance
const axiosInstance = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:3000/api/v1', // Read base URL from env vars with fallback
  withCredentials: true // Ensure cookies are sent with requests
});

// Add a request interceptor to include the JWT token
axiosInstance.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem('jwt'); // Get token from localStorage
    if (token) {
      config.headers['Authorization'] = `Bearer ${token}`; // Add Authorization header if token exists
    }
    return config;
  },
  (error) => {
    // Handle request error
    return Promise.reject(error);
  }
);

// Optional: Add a response interceptor for global error handling (e.g., 401 Unauthorized)
axiosInstance.interceptors.response.use(
  (response) => {
    // Any status code that lie within the range of 2xx cause this function to trigger
    return response;
  },
  (error) => {
    // Any status codes that falls outside the range of 2xx cause this function to trigger
    // Example: Handle 401 Unauthorized globally (e.g., redirect to login)
    if (error.response && error.response.status === 401) {
      // Potentially clear token and redirect user
      console.error("Unauthorized access - 401");
      // localStorage.removeItem('jwt');
      // window.location.href = '/login'; // Or use React Router navigation
    }
    return Promise.reject(error);
  }
);


export default axiosInstance;