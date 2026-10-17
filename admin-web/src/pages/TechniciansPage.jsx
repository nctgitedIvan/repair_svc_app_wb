import { useCallback, useEffect, useState } from 'react';
import { Button, Drawer, Space, Table, Tag, message } from 'antd';
import { CheckOutlined, ReloadOutlined, WalletOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatMoney } from '../utils/format';

const STATUS_COLORS = {
  pending: 'gold',
  approved: 'green',
  rejected: 'red',
  disabled: 'default',
};

const STATUS_LABELS = {
  pending: '待審核',
  approved: '已通過',
  rejected: '已拒絕',
  disabled: '已停用',
};

export default function TechniciansPage() {
  const [list, setList] = useState([]);
  const [loading, setLoading] = useState(false);
  const [earnings, setEarnings] = useState(null);
  const [earningsLoading, setEarningsLoading] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    client
      .get('/technicians')
      .then(({ data }) => setList(data.list || []))
      .catch((err) => {
        message.error((err.response && err.response.data && err.response.data.message) || '載入師傅失敗');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const approve = async (record) => {
    try {
      await client.post(`/technicians/${record.technicianId}/approve`);
      message.success(`已通過 ${record.name} 的入駐審核`);
      load();
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || '審核失敗');
    }
  };

  const showEarnings = async (record) => {
    setEarningsLoading(true);
    try {
      const { data } = await client.get(`/technicians/${record.technicianId}/earnings`);
      setEarnings(data);
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || '載入收益失敗');
    } finally {
      setEarningsLoading(false);
    }
  };

  const columns = [
    {
      title: '師傅',
      key: 'name',
      render: (_, record) => (
        <div>
          <div>{record.name}</div>
          <div className="text-muted">{record.phone}</div>
        </div>
      ),
    },
    {
      title: '狀態',
      key: 'status',
      width: 110,
      render: (_, record) => (
        <Tag color={STATUS_COLORS[record.status]}>{STATUS_LABELS[record.status] || record.status}</Tag>
      ),
    },
    {
      title: '技能',
      key: 'skillTags',
      render: (_, record) => (
        <Space size={4} wrap>
          {(record.skillTags || []).map((tag) => (
            <Tag key={tag}>{tag}</Tag>
          ))}
        </Space>
      ),
    },
    { title: '等級', dataIndex: 'level', key: 'level', width: 80, render: (v) => v || '—' },
    {
      title: '累計收益',
      dataIndex: 'earningsCents',
      key: 'earnings',
      width: 120,
      render: (cents) => <span className="money">{formatMoney(cents)}</span>,
    },
    {
      title: '審核時間',
      dataIndex: 'approvedAt',
      key: 'approvedAt',
      width: 150,
      render: (value) => (value ? dayjs(value).format('YYYY-MM-DD') : '—'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space>
          {record.status === 'pending' && (
            <Button type="link" icon={<CheckOutlined />} onClick={() => approve(record)}>
              通過審核
            </Button>
          )}
          <Button type="link" icon={<WalletOutlined />} onClick={() => showEarnings(record)}>
            查看收益
          </Button>
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>師傅管理</h2>
          <div className="page-subtitle">審核入駐、查看收益（Mock 資料）</div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>
          重新整理
        </Button>
      </div>

      <Table
        rowKey="technicianId"
        loading={loading}
        columns={columns}
        dataSource={list}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />

      <Drawer
        title={`收益明細 · ${earnings ? earnings.technicianName : ''}`}
        width={560}
        open={!!earnings}
        onClose={() => setEarnings(null)}
        loading={earningsLoading}
      >
        {earnings && (
          <>
            <div style={{ marginBottom: 16 }}>
              累計收益：<span className="money">{formatMoney(earnings.totalCents)}</span>
            </div>
            <Table
              rowKey="orderId"
              size="small"
              pagination={false}
              dataSource={earnings.records}
              columns={[
                { title: '訂單', dataIndex: 'orderNo', key: 'orderNo' },
                {
                  title: '完工時間',
                  dataIndex: 'completedAt',
                  key: 'completedAt',
                  render: (value) => (value ? dayjs(value).format('YYYY-MM-DD') : '—'),
                },
                {
                  title: '服務費',
                  dataIndex: 'serviceFeeCents',
                  key: 'serviceFee',
                  render: (cents) => formatMoney(cents),
                },
                {
                  title: '師傅分潤',
                  dataIndex: 'technicianShareCents',
                  key: 'share',
                  render: (cents) => <span className="money">{formatMoney(cents)}</span>,
                },
              ]}
            />
          </>
        )}
      </Drawer>
    </div>
  );
}
