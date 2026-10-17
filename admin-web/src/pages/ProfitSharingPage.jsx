import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button, Card, Space, Table, Tag, message } from 'antd';
import { DollarOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatMoney } from '../utils/format';

export default function ProfitSharingPage() {
  const [orders, setOrders] = useState([]);
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([client.get('/orders'), client.get('/profit-sharing')])
      .then(([orderResponse, recordResponse]) => {
        setOrders((orderResponse.data.list || []).filter((order) => order.status === 'COMPLETED'));
        setRecords(recordResponse.data.list || []);
      })
      .catch((err) => {
        message.error((err.response && err.response.data && err.response.data.message) || '載入分帳資料失敗');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const executedOrderIds = useMemo(
    () => new Set(records.map((record) => record.orderId)),
    [records],
  );

  const execute = async (order) => {
    try {
      await client.post('/profit-sharing/execute', { orderId: order.orderId });
      message.success('分帳已執行（Mock）');
      load();
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || '分帳失敗');
    }
  };

  const orderColumns = [
    { title: '訂單編號', dataIndex: 'orderNo', key: 'orderNo', width: 170 },
    { title: '師傅', dataIndex: 'technicianName', key: 'technicianName', render: (v) => v || '—' },
    {
      title: '服務費',
      key: 'serviceFee',
      render: (_, record) => formatMoney(record.amounts.serviceFeeCents),
    },
    {
      title: '預估師傅分潤（80%）',
      key: 'share',
      render: (_, record) => (
        <span className="money">{formatMoney(Math.round(record.amounts.serviceFeeCents * 0.8))}</span>
      ),
    },
    {
      title: '操作',
      key: 'actions',
      width: 140,
      render: (_, record) =>
        executedOrderIds.has(record.orderId) ? (
          <Tag color="green">已分帳</Tag>
        ) : (
          <Button
            type="link"
            icon={<DollarOutlined />}
            disabled={!record.technicianId}
            onClick={() => execute(record)}
          >
            執行分帳
          </Button>
        ),
    },
  ];

  const recordColumns = [
    { title: '分帳編號', dataIndex: 'sharingId', key: 'sharingId', width: 190 },
    { title: '訂單編號', dataIndex: 'orderNo', key: 'orderNo', width: 170 },
    { title: '師傅', dataIndex: 'technicianName', key: 'technicianName' },
    {
      title: '分潤金額',
      dataIndex: 'amountCents',
      key: 'amount',
      render: (cents) => <span className="money">{formatMoney(cents)}</span>,
    },
    {
      title: '狀態',
      dataIndex: 'status',
      key: 'status',
      render: (status) => <Tag color={status === 'success' ? 'green' : 'gold'}>{status}</Tag>,
    },
    {
      title: '時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      render: (value) => dayjs(value).format('YYYY-MM-DD HH:mm'),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>分帳管理</h2>
          <div className="page-subtitle">已完成訂單的師傅分潤（Mock：服務費 80%）</div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>
          重新整理
        </Button>
      </div>

      <Card title="可執行分帳的訂單" style={{ marginBottom: 16 }}>
        <Table
          rowKey="orderId"
          loading={loading}
          size="middle"
          columns={orderColumns}
          dataSource={orders}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      </Card>

      <Card title="分帳紀錄">
        <Table
          rowKey="sharingId"
          loading={loading}
          size="middle"
          columns={recordColumns}
          dataSource={records}
          pagination={{ pageSize: 10, showSizeChanger: false }}
        />
      </Card>
    </div>
  );
}
