import { useCallback, useEffect, useState } from 'react';
import {
  Button,
  DatePicker,
  Form,
  Input,
  InputNumber,
  Modal,
  Select,
  Space,
  Table,
  Tag,
  message,
} from 'antd';
import { GiftOutlined, PlusOutlined, ReloadOutlined } from '@ant-design/icons';
import dayjs from 'dayjs';
import client from '../api/client';

const { RangePicker } = DatePicker;

const yuan = (cents) => `¥${(Number(cents || 0) / 100).toFixed(2)}`;
const dateText = (ms) => (Number.isInteger(ms) ? dayjs(ms).format('YYYY-MM-DD') : '—');

const errorMessage = (err, fallback) =>
  (err.response && err.response.data && err.response.data.message) || fallback;

export default function CouponsPage() {
  const [list, setList] = useState([]);
  const [recipients, setRecipients] = useState([]);
  const [loading, setLoading] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [issueOpen, setIssueOpen] = useState(false);
  const [issuing, setIssuing] = useState(false);
  const [issueTarget, setIssueTarget] = useState('all');
  const [issueCoupon, setIssueCoupon] = useState(null);
  const [form] = Form.useForm();

  const load = useCallback(() => {
    setLoading(true);
    Promise.all([client.get('/coupons'), client.get('/coupons/recipients')])
      .then(([couponsRes, recipientsRes]) => {
        setList(couponsRes.data.list || []);
        setRecipients(recipientsRes.data.list || []);
      })
      .catch((err) => message.error(errorMessage(err, '載入優惠券失敗')))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setCreateOpen(true);
    form.setFieldsValue({
      name: '',
      amountYuan: 10,
      minSpendYuan: 0,
      validRange: [dayjs(), dayjs().add(30, 'day')],
    });
  };

  const createCoupon = async () => {
    const values = await form.validateFields();
    const [from, to] = values.validRange;

    const payload = {
      name: values.name.trim(),
      amountCents: Math.round(values.amountYuan * 100),
      minSpendCents: Math.round((values.minSpendYuan || 0) * 100),
      validFrom: from.valueOf(),
      validTo: to.valueOf(),
    };

    try {
      await client.post('/coupons', payload);
      message.success('優惠券已新增');
      setCreateOpen(false);
      load();
    } catch (err) {
      message.error(errorMessage(err, '新增優惠券失敗'));
    }
  };

  const openIssue = (coupon) => {
    setIssueCoupon(coupon);
    setIssueTarget('all');
    setIssueOpen(true);
  };

  const submitIssue = async () => {
    if (!issueCoupon) return;
    setIssuing(true);
    try {
      const { data } = await client.post(`/coupons/${issueCoupon.couponId}/issue`, {
        userId: issueTarget,
      });
      const skippedText = data.skipped ? `，略過 ${data.skipped} 位已持有者` : '';
      message.success(`已發放 ${data.issued} 張${skippedText}`);
      setIssueOpen(false);
      load();
    } catch (err) {
      message.error(errorMessage(err, '發放失敗'));
    } finally {
      setIssuing(false);
    }
  };

  const columns = [
    { title: '優惠券名稱', dataIndex: 'name', key: 'name' },
    {
      title: '面額',
      dataIndex: 'amountCents',
      key: 'amountCents',
      width: 120,
      render: (cents) => <span style={{ color: '#fa4126', fontWeight: 600 }}>{yuan(cents)}</span>,
    },
    {
      title: '滿減門檻',
      dataIndex: 'minSpendCents',
      key: 'minSpendCents',
      width: 130,
      render: (cents) => (cents > 0 ? `滿 ${yuan(cents)}` : '無門檻'),
    },
    {
      title: '有效期限',
      key: 'validity',
      width: 220,
      render: (_, record) => `${dateText(record.validFrom)} ~ ${dateText(record.validTo)}`,
    },
    {
      title: '已發放',
      dataIndex: 'issuedCount',
      key: 'issuedCount',
      width: 100,
      render: (count) => `${count || 0} 張`,
    },
    {
      title: '狀態',
      key: 'status',
      width: 100,
      render: (_, record) =>
        record.isActive === false ? <Tag>停用</Tag> : <Tag color="green">啟用</Tag>,
    },
    {
      title: '操作',
      key: 'actions',
      width: 100,
      render: (_, record) => (
        <Button type="link" icon={<GiftOutlined />} onClick={() => openIssue(record)}>
          發放
        </Button>
      ),
    },
  ];

  const recipientOptions = [
    { value: 'all', label: '全員（所有客戶）' },
    ...recipients.map((user) => ({ value: user.id, label: `${user.name}（${user.id}）` })),
  ];

  return (
    <div>
      <div className="page-header">
        <div>
          <h2>優惠券管理</h2>
          <div className="page-subtitle">新增優惠券、對指定用戶或全員發放</div>
        </div>
        <Space>
          <Button icon={<ReloadOutlined />} onClick={load}>
            重新整理
          </Button>
          <Button type="primary" icon={<PlusOutlined />} onClick={openCreate}>
            新增優惠券
          </Button>
        </Space>
      </div>

      <Table
        rowKey="couponId"
        loading={loading}
        columns={columns}
        dataSource={list}
        pagination={{ pageSize: 20, showSizeChanger: false }}
      />

      <Modal
        title="新增優惠券"
        open={createOpen}
        onCancel={() => setCreateOpen(false)}
        onOk={createCoupon}
        okText="建立"
        cancelText="取消"
        destroyOnClose
      >
        <Form form={form} layout="vertical">
          <Form.Item
            name="name"
            label="名稱"
            rules={[{ required: true, message: '請輸入優惠券名稱' }]}
          >
            <Input placeholder="例如：新客立減 20 元" maxLength={40} />
          </Form.Item>
          <Form.Item
            name="amountYuan"
            label="面額（元）"
            rules={[{ required: true, message: '請輸入面額' }]}
          >
            <InputNumber min={0.01} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="minSpendYuan"
            label="滿減門檻（元；0 = 無門檻）"
            rules={[{ required: true, message: '請輸入滿減門檻' }]}
          >
            <InputNumber min={0} precision={2} style={{ width: '100%' }} />
          </Form.Item>
          <Form.Item
            name="validRange"
            label="有效期限"
            rules={[{ required: true, message: '請選擇有效期限' }]}
          >
            <RangePicker style={{ width: '100%' }} />
          </Form.Item>
          <div style={{ fontSize: 12, color: '#999' }}>
            面額與門檻以「元」輸入，送出時轉為整數分；金額計算一律使用分。
          </div>
        </Form>
      </Modal>

      <Modal
        title={`發放優惠券${issueCoupon ? `：${issueCoupon.name}` : ''}`}
        open={issueOpen}
        onCancel={() => setIssueOpen(false)}
        onOk={submitIssue}
        okText="確認發放"
        cancelText="取消"
        confirmLoading={issuing}
        destroyOnClose
      >
        <Space direction="vertical" style={{ width: '100%' }}>
          <div>發放對象</div>
          <Select
            style={{ width: '100%' }}
            value={issueTarget}
            options={recipientOptions}
            onChange={setIssueTarget}
          />
          <div style={{ fontSize: 12, color: '#999' }}>
            同一用戶對同一張券只會持有一張；重複發放會被略過。
          </div>
        </Space>
      </Modal>
    </div>
  );
}
