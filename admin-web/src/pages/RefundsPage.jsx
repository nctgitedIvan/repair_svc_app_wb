import { useCallback, useEffect, useState } from 'react';
import { Button, Popconfirm, Space, Table, Tag, message } from 'antd';
import { CheckOutlined, CloseOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatMoney } from '../utils/format';

const STATUS_COLORS = {
  requested: 'gold',
  refunded: 'green',
  rejected: 'red',
  failed: 'red',
};

const STATUS_LABELS = {
  requested: '待審批',
  refunded: '已退款',
  rejected: '已拒絕',
  failed: '失敗',
};

export default function RefundsPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    client
      .get('/refunds')
      .then(({ data }) => setList(data.list || []))
      .catch((err) => {
        message.error((err.response && err.response.data && err.response.data.message) || '載入退款失敗');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const act = async (record, action) => {
    try {
      await client.post(`/refunds/${record.refundId}/${action}`);
      message.success(action === 'approve' ? '退款已批准' : '退款已拒絕');
      load();
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || '操作失敗');
    }
  };

  const columns = [
    { title: '退款編號', dataIndex: 'refundId', key: 'refundId', width: 160 },
    { title: '訂單編號', dataIndex: 'orderNo', key: 'orderNo', width: 170 },
    { title: '客戶', dataIndex: 'customerName', key: 'customerName' },
    {
      title: '金額',
      dataIndex: 'amountCents',
      key: 'amount',
      width: 120,
      render: (cents) => <span className="money">{formatMoney(cents)}</span>,
    },
    {
      title: '狀態',
      key: 'status',
      width: 110,
      render: (_, record) => <Tag color={STATUS_COLORS[record.status]}>{STATUS_LABELS[record.status] || record.status}</Tag>,
    },
    { title: '原因', dataIndex: 'reason', key: 'reason', render: (v) => v || '—' },
    {
      title: '申請時間',
      dataIndex: 'requestedAt',
      key: 'requestedAt',
      width: 160,
      render: (value) => dayjs(value).format('MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 170,
      render: (_, record) =>
        record.status === 'requested' ? (
          <Space>
            <Popconfirm title="確認批准這筆退款？" onConfirm={() => act(record, 'approve')}>
              <Button type="link" icon={<CheckOutlined />}>
                批准
              </Button>
            </Popconfirm>
            <Popconfirm title="確認拒絕這筆退款？" onConfirm={() => act(record, 'reject')}>
              <Button type="link" danger icon={<CloseOutlined />}>
                拒絕
              </Button>
            </Popconfirm>
          </Space>
        ) : (
          '—'
        ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>退款審批</h2>
          <div className="page-subtitle">客服小額退款／管理員大額退款（Mock 權限目前為 admin.full）</div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>
          重新整理
        </Button>
      </div>

      <Table
        rowKey="refundId"
        loading={loading}
        columns={columns}
        dataSource={list}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />
    </div>
  );
}
