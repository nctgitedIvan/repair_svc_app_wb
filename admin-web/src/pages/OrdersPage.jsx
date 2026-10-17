import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  Descriptions,
  Drawer,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { ReloadOutlined, SendOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import client from '../api/client';
import { formatMoney, STATUS_COLORS } from '../utils/format';

export default function OrdersPage() {
  const [orders, setOrders] = useState([]);
  const [technicians, setTechnicians] = useState([]);
  const [loading, setLoading] = useState(false);
  const [detail, setDetail] = useState(null);
  const [assigning, setAssigning] = useState(null);
  const [selectedTechnician, setSelectedTechnician] = useState(undefined);
  const [saving, setSaving] = useState(false);

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([client.get('/orders'), client.get('/technicians')])
      .then(([orderResponse, technicianResponse]) => {
        setOrders(orderResponse.data.list || []);
        setTechnicians((technicianResponse.data.list || []).filter((t) => t.status === 'approved'));
      })
      .catch((err) => {
        message.error((err.response && err.response.data && err.response.data.message) || '載入訂單失敗');
      })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onAssign = async () => {
    if (!selectedTechnician) {
      message.warning('請選擇師傅');
      return;
    }
    setSaving(true);
    try {
      await client.post(`/orders/${assigning.orderId}/assign`, { technicianId: selectedTechnician });
      message.success('已指派師傅');
      setAssigning(null);
      setSelectedTechnician(undefined);
      load();
    } catch (err) {
      message.error((err.response && err.response.data && err.response.data.message) || '派單失敗');
    } finally {
      setSaving(false);
    }
  };

  const columns = [
    { title: '訂單編號', dataIndex: 'orderNo', key: 'orderNo', width: 170 },
    {
      title: '客戶',
      key: 'customer',
      render: (_, record) => (
        <div>
          <div>{record.customerName}</div>
          <div className="text-muted">{record.customerPhone}</div>
        </div>
      ),
    },
    { title: '師傅', dataIndex: 'technicianName', key: 'technicianName', render: (name) => name || '—' },
    {
      title: '狀態',
      key: 'status',
      width: 130,
      render: (_, record) => <Tag color={STATUS_COLORS[record.status]}>{record.statusLabel}</Tag>,
    },
    {
      title: '金額',
      key: 'total',
      width: 120,
      render: (_, record) => <span className="money">{formatMoney(record.amounts.totalCents)}</span>,
    },
    {
      title: '建立時間',
      dataIndex: 'createdAt',
      key: 'createdAt',
      width: 160,
      render: (value) => dayjs(value).format('MM-DD HH:mm'),
    },
    {
      title: '操作',
      key: 'actions',
      width: 160,
      render: (_, record) => (
        <Space>
          <Button type="link" onClick={() => setDetail(record)}>
            詳情
          </Button>
          {['PAID_PENDING_ASSIGN', 'ASSIGNED_PENDING_ACCEPT'].includes(record.status) && (
            <Button
              type="link"
              icon={<SendOutlined />}
              onClick={() => {
                setAssigning(record);
                setSelectedTechnician(record.technicianId || undefined);
              }}
            >
              指派
            </Button>
          )}
        </Space>
      ),
    },
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>訂單管理</h2>
          <div className="page-subtitle">查看詳情、客服手動指派師傅（Mock 資料）</div>
        </div>
        <Button icon={<ReloadOutlined />} onClick={load}>
          重新整理
        </Button>
      </div>

      <Table
        rowKey="orderId"
        loading={loading}
        columns={columns}
        dataSource={orders}
        pagination={{ pageSize: 10, showSizeChanger: false }}
      />

      <Drawer
        title={`訂單 ${detail ? detail.orderNo : ''}`}
        width={640}
        open={!!detail}
        onClose={() => setDetail(null)}
      >
        {detail && (
          <>
            <Descriptions column={1} bordered size="small">
              <Descriptions.Item label="狀態">
                <Tag color={STATUS_COLORS[detail.status]}>{detail.statusLabel}</Tag>
              </Descriptions.Item>
              <Descriptions.Item label="客戶">
                {detail.customerName}（{detail.customerPhone}）
              </Descriptions.Item>
              <Descriptions.Item label="師傅">{detail.technicianName || '未指派'}</Descriptions.Item>
              <Descriptions.Item label="地址">{detail.address}</Descriptions.Item>
              <Descriptions.Item label="預約時間">
                {dayjs(detail.appointmentAt).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="建立時間">
                {dayjs(detail.createdAt).format('YYYY-MM-DD HH:mm')}
              </Descriptions.Item>
              <Descriptions.Item label="服務費">{formatMoney(detail.amounts.serviceFeeCents)}</Descriptions.Item>
              <Descriptions.Item label="材料費">{formatMoney(detail.amounts.materialFeeCents)}</Descriptions.Item>
              <Descriptions.Item label="合計">
                <span className="money">{formatMoney(detail.amounts.totalCents)}</span>
              </Descriptions.Item>
            </Descriptions>

            <div className="order-detail-items">
              <Table
                rowKey={(record, index) => `${record.nameSnapshot}-${index}`}
                size="small"
                pagination={false}
                dataSource={detail.items}
                columns={[
                  { title: '項目', dataIndex: 'nameSnapshot', key: 'name' },
                  { title: '規格', dataIndex: 'specSnapshot', key: 'spec', render: (v) => v || '—' },
                  { title: '類型', dataIndex: 'itemType', key: 'type' },
                  {
                    title: '單價',
                    dataIndex: 'unitPriceCents',
                    key: 'price',
                    render: (cents) => formatMoney(cents),
                  },
                  { title: '數量', dataIndex: 'quantity', key: 'quantity' },
                ]}
              />
            </div>
          </>
        )}
      </Drawer>

      <Modal
        title={`指派師傅 · ${assigning ? assigning.orderNo : ''}`}
        open={!!assigning}
        onCancel={() => setAssigning(null)}
        onOk={onAssign}
        confirmLoading={saving}
        okText="確認指派"
        cancelText="取消"
      >
        <Select
          style={{ width: '100%' }}
          placeholder="選擇已通過審核的師傅"
          value={selectedTechnician}
          onChange={setSelectedTechnician}
          options={technicians.map((technician) => ({
            value: technician.technicianId,
            label: `${technician.name}（${(technician.skillTags || []).join('、') || '無技能標籤'}）`,
          }))}
        />
      </Modal>
    </div>
  );
}
