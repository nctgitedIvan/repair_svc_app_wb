import { useEffect, useState } from 'react';
import { Button, Card, Form, Input, message, Typography } from 'antd';
import { LockOutlined, UserOutlined, ToolOutlined } from '@ant-design/icons';
import { useNavigate } from 'react-router-dom';
import client from '../api/client';
import { getToken, setSession } from '../auth';

export default function LoginPage() {
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (getToken()) navigate('/dashboard', { replace: true });
  }, [navigate]);

  const onFinish = async (values) => {
    setLoading(true);
    try {
      const { data } = await client.post('/auth/login', values);
      setSession(data.token, data.user);
      message.success('登入成功');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || '登入失敗');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="login-page">
      <Card className="login-card">
        <div className="login-brand">
          <ToolOutlined style={{ fontSize: 42, color: '#fa4126' }} />
          <h1>維修服務平台</h1>
          <p>Web 管理後台</p>
        </div>

        <Form layout="vertical" onFinish={onFinish} initialValues={{ username: 'admin', password: 'admin' }}>
          <Form.Item name="username" label="帳號" rules={[{ required: true, message: '請輸入帳號' }]}>
            <Input prefix={<UserOutlined />} placeholder="admin" autoComplete="username" />
          </Form.Item>
          <Form.Item name="password" label="密碼" rules={[{ required: true, message: '請輸入密碼' }]}>
            <Input.Password prefix={<LockOutlined />} placeholder="admin" autoComplete="current-password" />
          </Form.Item>
          <Form.Item style={{ marginBottom: 8 }}>
            <Button type="primary" htmlType="submit" block loading={loading}>
              登入
            </Button>
          </Form.Item>
        </Form>

        <Typography.Text type="secondary">
          示範帳號：admin／admin（Mock JWT，僅供本機開發）
        </Typography.Text>
      </Card>
    </div>
  );
}
