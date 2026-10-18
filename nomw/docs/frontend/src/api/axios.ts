import axios from 'axios';

// ===== Axios instance cho Nom Docx Web =====
const api = axios.create({
  baseURL: (import.meta as any).env.VITE_API_URL || '/api/v1',
  timeout: 30000,
});

// Request interceptor
api.interceptors.request.use((config) => {
  const token = localStorage.getItem('nom_token') || localStorage.getItem('minepanel_token');
  if (token) {
    config.headers.Authorization = `Bearer ${token}`;
  }
  return config;
});

// Response interceptor
api.interceptors.response.use(
  (res) => res,
  (err) => {
    return Promise.reject(err);
  }
);

export default api;
