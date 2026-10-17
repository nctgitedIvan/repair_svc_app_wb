import { useEffect, useState } from 'react';
import { Card, Col, Row, Statistic, Table, Tag, message } from 'antd';
import {
  DollarOutlined,
  InboxOutlined,
  RollbackOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatMoney, STATUS_COLORS } from '../utils/format';

export default function DashboardPage() {
  const [loading, setLoading] = useState(false);
  const [stats, setStats] = useState(null);

  useEffect(() => {
    let mounted = true;
    setLoading(true);
    client
      .get('/dashboard/stats')
      .then(({ data }) => {
        if (mounted) setStats(data);
      })
      .catch((err) => {
        message.error((err.response && err.response.data && err.response.data.message) || '載入統計失敗');
      })
      .finally(() => {
        if (mounted) setLoading(false);
      });
    return () => {
      mounted = false;
    };
  }, []);

  const recentColumns = [
    { title: '訂單編號', dataIndex: 'orderNo', key: 'orderNo' },
    { title: '客戶', dataIndex: 'customerName', key: 'customerName' },
    {
      title: '狀態',
      dataIndex: 'statusLabel',
      key: 'statusLabel',
      render: (label, record) => <Tag color={STATUS_COLORS[record.status]}>{label}</Tag>,
    },
    {
      title: '金額',
      dataIndex: ['amounts', 'totalCents'],
      key: 'total',
      render: (cents) => <span className="money">{formatMoney(cents)}</span>,
    },
    {
      title: '建立時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>首頁總覽</h2>
          <div className="page-subtitle">即時營運指標（Mock 資料）</div>
        </div>
      </div>

      <Row gutter={[16, 16]} className="stat-grid">
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic
              title="今日營業額"
              value={stats ? stats.todayRevenueCents / 100 : 0}
              precision={2}
              prefix={<DollarOutlined />}
              suffix="元"
            />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic title="待派單" value={stats ? stats.pendingAssignCount : 0} prefix={<InboxOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic title="待審退款" value={stats ? stats.pendingRefundsCount : 0} prefix={<RollbackOutlined />} />
          </Card>
        </Col>
        <Col xs={24} sm={12} xl={6}>
          <Card loading={loading}>
            <Statistic title="註冊用戶" value={stats ? stats.userCount : 0} prefix={<TeamOutlined />} />
          </Card>
        </Col>
      </Row>

      <Card title="最近訂單" loading={loading}>
        <Table
          rowKey="orderId"
          size="middle"
          pagination={false}
          columns={recentColumns}
          dataSource={stats ? stats.recentOrders : []}
        />
      </Card>
    </div>
  );
}
