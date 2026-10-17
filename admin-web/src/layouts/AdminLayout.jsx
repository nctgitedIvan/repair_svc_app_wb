import { useMemo } from 'react';
import { Layout, Menu, Dropdown, Avatar, Space, Typography } from 'antd';
import {
  DashboardOutlined,
  ShoppingOutlined,
  ToolOutlined,
  ProfileOutlined,
  TeamOutlined,
  LogoutOutlined,
  UserOutlined,
  RollbackOutlined,
  DollarOutlined,
  AppstoreOutlined,
  SafetyCertificateOutlined,
  GiftOutlined,
} from '@ant-design/icons';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { clearSession, getUser } from '../auth';

const { Header, Sider, Content } = Layout;

const MENU_ITEMS = [
  { key: '/dashboard', icon: <DashboardOutlined />, label: '首頁總覽' },
  { key: '/products', icon: <ShoppingOutlined />, label: '商品管理' },
  { key: '/services', icon: <ToolOutlined />, label: '服務管理' },
  { key: '/orders', icon: <ProfileOutlined />, label: '訂單管理' },
  { key: '/refunds', icon: <RollbackOutlined />, label: '退款審批' },
  { key: '/profit-sharing', icon: <DollarOutlined />, label: '分帳管理' },
  { key: '/categories', icon: <AppstoreOutlined />, label: '分類管理' },
  { key: '/technicians', icon: <TeamOutlined />, label: '師傅管理' },
  { key: '/coupons', icon: <GiftOutlined />, label: '優惠券管理' },
  { key: '/permissions', icon: <SafetyCertificateOutlined />, label: '權限管理' },
];

const TITLES = {
  '/dashboard': '首頁總覽',
  '/products': '商品管理',
  '/services': '服務管理',
  '/orders': '訂單管理',
  '/refunds': '退款審批',
  '/profit-sharing': '分帳管理',
  '/categories': '分類管理',
  '/technicians': '師傅管理',
  '/coupons': '優惠券管理',
  '/permissions': '權限管理',
};

export default function AdminLayout() {
  const location = useLocation();
  const navigate = useNavigate();
  const user = getUser();

  const selectedKey = useMemo(() => {
    const match = MENU_ITEMS.find((item) => location.pathname.startsWith(item.key));
    return match ? match.key : '/dashboard';
  }, [location.pathname]);

  const onMenuClick = ({ key }) => navigate(key);

  const onLogout = () => {
    clearSession();
    navigate('/login', { replace: true });
  };

  return (
    <Layout style={{ minHeight: '100vh' }}>
      <Sider breakpoint="lg" collapsedWidth="0" theme="dark">
        <div className="admin-logo">維修平台 · 管理後台</div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[selectedKey]}
          items={MENU_ITEMS}
          onClick={onMenuClick}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: '#fff',
            padding: '0 24px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
          }}
        >
          <Typography.Text strong>{TITLES[selectedKey] || '管理後台'}</Typography.Text>
          <Dropdown
            menu={{
              items: [{ key: 'logout', icon: <LogoutOutlined />, label: '登出' }],
              onClick: ({ key }) => {
                if (key === 'logout') onLogout();
              },
            }}
          >
            <Space style={{ cursor: 'pointer' }}>
              <Avatar size="small" icon={<UserOutlined />} />
              <span>{user ? user.name : '管理員'}</span>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24 }}>
          <Outlet />
        </Content>
      </Layout>
    </Layout>
  );
}
