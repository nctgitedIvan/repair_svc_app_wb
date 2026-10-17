import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import ProtectedRoute from './components/ProtectedRoute';
import AdminLayout from './layouts/AdminLayout';
import LoginPage from './pages/LoginPage';
import DashboardPage from './pages/DashboardPage';
import ProductsPage from './pages/ProductsPage';
import ServicesPage from './pages/ServicesPage';
import OrdersPage from './pages/OrdersPage';
import RefundsPage from './pages/RefundsPage';
import ProfitSharingPage from './pages/ProfitSharingPage';
import CategoriesPage from './pages/CategoriesPage';
import TechniciansPage from './pages/TechniciansPage';
import PermissionsPage from './pages/PermissionsPage';

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
        <Route element={<ProtectedRoute />}>
          <Route element={<AdminLayout />}>
            <Route index element={<Navigate to="/dashboard" replace />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/products" element={<ProductsPage />} />
            <Route path="/services" element={<ServicesPage />} />
            <Route path="/orders" element={<OrdersPage />} />
            <Route path="/refunds" element={<RefundsPage />} />
            <Route path="/profit-sharing" element={<ProfitSharingPage />} />
            <Route path="/categories" element={<CategoriesPage />} />
            <Route path="/technicians" element={<TechniciansPage />} />
            <Route path="/permissions" element={<PermissionsPage />} />
          </Route>
        </Route>
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
